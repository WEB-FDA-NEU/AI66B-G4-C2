"""Reports: submit, list, and resolve user-submitted content flags.

   Endpoints
   ─────────
   POST   /api/reports              → authenticated users only
   GET    /api/reports              → moderator / admin only
   PATCH  /api/reports/{report_id}  → moderator / admin only

   Security
   ────────
   - Guests hitting POST → 401 (via get_current_user dependency).
   - Non-staff hitting GET/PATCH → 403 (explicit role check).
   - Duplicate reports by the same user on the same target → 409.
   - Invalid reason values → 422 (Pydantic Literal).
   - Referenced target (post / answer / comment) must exist and not
     be soft-deleted → 404.

   Response shape
   ──────────────
   GET /api/reports now returns an enriched shape that includes the
   *content* of the reported target (body + author) so the admin UI can
   show a self-contained "Report Details" modal without extra fetches:

     {
       id, type, title, url, target_body, target_author,
       reason, reasonTone, reporter, details,
       reportedAt, status, statusTone, actions: [...]
     }

   `target_body` is truncated to 1500 chars — long enough to see the
   context, short enough to keep the payload small. `target_author` is
   `{ username, display_name }` so the modal can link to the profile.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user
from models import Answer, Comment, Post, Report, User

router = APIRouter(prefix="/api/reports", tags=["reports"])


# ── Constants ───────────────────────────────────────────────────────────

_ALLOWED_REASONS = {
    "spam", "abuse", "off-topic", "off-topic-discussion",
    "duplicate", "plagiarism", "other",
}

_ALLOWED_TARGET_TYPES = {"post", "answer", "comment"}

_REASON_LABELS = {
    "spam":                 "Spam",
    "abuse":                "Abuse",
    "off-topic":            "Off-topic",
    "off-topic-discussion": "Off-topic discussion",
    "duplicate":            "Duplicate",
    "plagiarism":           "Plagiarism",
    "other":                "Other",
}

_REASON_TONES = {
    "spam":                 "danger",
    "abuse":                "danger",
    "off-topic":            "warning",
    "off-topic-discussion": "warning",
    "duplicate":            "info",
    "plagiarism":           "danger",
    "other":                "tonal",
}

_STATUS_LABELS = {
    "pending":   "Pending",
    "reviewed":  "Reviewed",
    "dismissed": "Dismissed",
}

_STATUS_TONES = {
    "pending":   "warning",
    "reviewed":  "success",
    "dismissed": "tonal",
}

# Cap how much of the reported body we ship to the client. 1500 chars
# fits the modal without scrolling on a 1080p screen and is well under
# the 8000-char limit `post_form.js` enforces on new content.
_BODY_PREVIEW_LEN = 1500


# ── Request / response models ───────────────────────────────────────────

class ReportCreate(BaseModel):
    """Body for POST /api/reports."""
    target_type: Literal["post", "answer", "comment"]
    target_id:   int = Field(gt=0)
    reason:      str = Field(min_length=1)
    details:     str = Field(default="", max_length=500)


class ReportStatusUpdate(BaseModel):
    """Body for PATCH /api/reports/{id}."""
    status: Literal["pending", "reviewed", "dismissed"]


# ── Internal helpers ────────────────────────────────────────────────────

def _require_staff(user: User) -> None:
    if user.role not in ("moderator", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only moderators or admins can access reports.",
        )


def _preview(text: str | None) -> str:
    s = (text or "").strip()
    if len(s) <= _BODY_PREVIEW_LEN:
        return s
    return s[:_BODY_PREVIEW_LEN].rsplit(" ", 1)[0] + "…"


def _author_block(user: User | None) -> dict | None:
    if user is None:
        return None
    return {
        "id":           user.id,
        "username":     user.username,
        "display_name": user.display_name,
        "reputation":   user.reputation,
    }


def _resolve_target(
    db: Session, target_type: str, target_id: int
) -> dict | None:
    """Look up a report target and normalize it for the admin UI.

    Returns a dict of the form:
        { title, url, type, body, author }   when valid
        None                                 when it doesn't exist

    `author` is `{ id, username, display_name, reputation }` so the modal
    can render and link to the target's profile without extra fetches.
    """
    if target_type == "post":
        p = db.get(Post, target_id)
        if p is None or p.deleted_at is not None:
            return None
        author = db.get(User, p.author_id)
        kind = "discussion" if p.post_type == "discussion" else "question"
        url = (
            f"./discussion-detail.html?id={p.id}"
            if kind == "discussion"
            else f"./question-detail.html?id={p.id}"
        )
        return {
            "title":  p.title,
            "url":    url,
            "type":   kind,
            "body":   _preview(p.body),
            "author": _author_block(author),
        }

    if target_type == "answer":
        a = db.get(Answer, target_id)
        if a is None or a.deleted_at is not None:
            return None
        parent = db.get(Post, a.post_id)
        if parent is None or parent.deleted_at is not None:
            return None
        author = db.get(User, a.author_id)
        url = (
            f"./discussion-detail.html?id={parent.id}#answer-{a.id}"
            if parent.post_type == "discussion"
            else f"./question-detail.html?id={parent.id}#answer-{a.id}"
        )
        return {
            "title":  f"Answer to: {parent.title}",
            "url":    url,
            "type":   "answer",
            "body":   _preview(a.body),
            "author": _author_block(author),
        }

    if target_type == "comment":
        c = db.get(Comment, target_id)
        if c is None or c.deleted_at is not None:
            return None
        author = db.get(User, c.author_id)

        if c.post_id is not None:
            parent = db.get(Post, c.post_id)
            if parent is None:
                return None
            url = (
                f"./discussion-detail.html?id={parent.id}#comment-{c.id}"
                if parent.post_type == "discussion"
                else f"./question-detail.html?id={parent.id}#comment-{c.id}"
            )
            return {
                "title":  f"Comment on: {parent.title}",
                "url":    url,
                "type":   "comment",
                "body":   _preview(c.body),
                "author": _author_block(author),
            }

        if c.answer_id is not None:
            ans = db.get(Answer, c.answer_id)
            if ans is None:
                return None
            parent = db.get(Post, ans.post_id)
            if parent is None:
                return None
            url = (
                f"./discussion-detail.html?id={parent.id}#comment-{c.id}"
                if parent.post_type == "discussion"
                else f"./question-detail.html?id={parent.id}#comment-{c.id}"
            )
            return {
                "title":  f"Comment on answer: {parent.title}",
                "url":    url,
                "type":   "comment",
                "body":   _preview(c.body),
                "author": _author_block(author),
            }

    return None


# ── Routes ──────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Submit a report against a post, answer, or comment."""
    if payload.reason not in _ALLOWED_REASONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid reason. Allowed: {sorted(_ALLOWED_REASONS)}",
        )

    if payload.target_type not in _ALLOWED_TARGET_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid target_type. Allowed: {sorted(_ALLOWED_TARGET_TYPES)}",
        )

    target = _resolve_target(db, payload.target_type, payload.target_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{payload.target_type.capitalize()} not found.",
        )

    report = Report(
        reporter_id=user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason,
        details=payload.details.strip(),
        status="pending",
    )
    db.add(report)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already reported this content.",
        )

    db.refresh(report)
    return {"id": report.id, "status": "pending"}


@router.get("")
def list_reports(
    status_filter: Literal["pending", "reviewed", "dismissed", "all"] = Query(
        "all", alias="status"
    ),
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List reports for the admin/mod center.

    Returns an array of items shaped exactly the way
    `admin-listings.js::renderReports` expects — plus the reported
    content's body and author for the "Report Details" modal.
    """
    _require_staff(user)

    stmt = select(Report).order_by(Report.created_at.desc())
    if status_filter != "all":
        stmt = stmt.where(Report.status == status_filter)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.offset((page - 1) * page_size).limit(page_size)
    ).all()

    if not rows:
        return {"items": [], "total": total, "page": page, "page_size": page_size}

    reporter_ids = {r.reporter_id for r in rows}
    reporters = {
        u.id: u for u in db.scalars(
            select(User).where(User.id.in_(reporter_ids))
        )
    }

    items = []
    for r in rows:
        reporter = reporters.get(r.reporter_id)
        target = _resolve_target(db, r.target_type, r.target_id)

        reason_label = _REASON_LABELS.get(r.reason, r.reason)
        reason_tone  = _REASON_TONES.get(r.reason, "tonal")
        status_label = _STATUS_LABELS.get(r.status, r.status)
        status_tone  = _STATUS_TONES.get(r.status, "tonal")

        actions = []
        if r.status == "pending":
            actions.append({"label": "Review",  "tone": "primary"})
            actions.append({"label": "Dismiss", "tone": "clear"})
        elif r.status == "reviewed":
            actions.append({"label": "Dismiss", "tone": "clear"})
        elif r.status == "dismissed":
            actions.append({"label": "Re-open", "tone": "clear"})

        items.append({
            "id":            str(r.id),
            "type":          target["type"] if target else r.target_type,
            "title":         target["title"] if target else f"Deleted {r.target_type}",
            "url":           target["url"] if target else "#",
            "target_body":   target["body"] if target else "",
            "target_author": target["author"] if target else None,
            "reason":        reason_label,
            "reasonTone":    reason_tone,
            "reporter":      reporter.display_name if reporter else "anonymous",
            "reporter_username": reporter.username if reporter else "",
            "details":       r.details or "",
            "reportedAt":    r.created_at.isoformat(),
            "status":        status_label,
            "statusTone":    status_tone,
            "actions":       actions,
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.patch("/{report_id}")
def update_report_status(
    report_id: int,
    payload: ReportStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a report as pending / reviewed / dismissed."""
    _require_staff(user)

    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Report not found.")

    r.status = payload.status
    r.resolved_at = datetime.now(timezone.utc)
    r.resolved_by_user_id = user.id
    db.commit()
    db.refresh(r)

    return {"id": r.id, "status": r.status}