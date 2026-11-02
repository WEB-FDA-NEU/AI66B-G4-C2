"""Admin endpoints — moderation console data.

   Only moderators and admins may hit these routes; regular users get 403
   (via the `_require_staff` helper). The middleware in `main.py` already
   blocks unauthorized users from loading `admin.html`, so these routes
   are the second line of defense — they also prevent a regular user who
   somehow reaches the API directly from reading or mutating moderation
   state.

   Routes
   ──────
   GET   /api/admin/post-marks        → list post marks
   GET   /api/admin/users             → list users with admin fields
   PATCH /api/admin/users/{user_id}   → suspend / unsuspend / ban / unban /
                                        promote / demote

   User-action authorization matrix (target = who you act ON, viewer =
   who's logged in):

     Action    | Mod → regular | Mod → staff | Admin → regular | Admin → staff | Admin → self
     ──────────┼───────────────┼─────────────┼─────────────────┼───────────────┼──────────────
     suspend   | ✅            | ❌          | ✅              | ✅            | ❌
     unsuspend | ✅            | ❌          | ✅              | ✅            | ❌
     ban       | ❌            | ❌          | ✅              | ✅            | ❌
     unban     | ❌            | ❌          | ✅              | ✅            | ❌
     promote   | ❌            | ❌          | ✅ (user only)  | ❌            | ❌
     demote    | ❌            | ❌          | ❌              | ✅ (mod only) | ❌

   Rationale
   ─────────
   - Moderators can suspend (temporary) but not ban (permanent) or
     promote/demote staff.
   - Admins can't act on themselves (prevents lockout).
   - Admins can't demote another admin (prevents lateral warfare).
   - All checks are enforced server-side in `update_user`, regardless of
     what the frontend renders.

   Field shapes returned by GET endpoints match what
   `admin-listings.js` reads directly:
     · post-marks: id, title, url, mark, markTone, markedBy, markedByTone,
                   markedAt, score, actions
     · users:      id, username, displayName, avatarLetter, avatarColor,
                   email, reputation, joinedAt, role, roleTone, status,
                   statusTone, suspendedUntil, actions
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user
from models import Post, PostMark, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Label / tone maps (must match what the frontend expects) ───────────

_MARK_LABELS = {
    "duplicated": "Duplicated",
    "violated":   "Violated",
    "off_topic":  "Off-topic",
    "spam":       "Spam",
}

_MARK_TONES = {
    "duplicated": "info",
    "violated":   "danger",
    "off_topic":  "warning",
    "spam":       "danger",
}

_ROLE_LABELS = {
    "user":      "User",
    "moderator": "Moderator",
    "admin":     "Admin",
}

_ROLE_TONES = {
    "user":      "tonal",
    "moderator": "info",
    "admin":     "warning",
}

_STATUS_LABELS = {
    "active":    "Active",
    "suspended": "Suspended",
    "banned":    "Banned",
}

_STATUS_TONES = {
    "active":    "success",
    "suspended": "warning",
    "banned":    "danger",
}

_AVATAR_PALETTE = [
    "bg-orange-300", "bg-blue-300", "bg-purple-300", "bg-green-300",
    "bg-pink-300", "bg-yellow-300", "bg-red-300", "bg-blue-300",
]


# ── Helpers ────────────────────────────────────────────────────────────

def _require_staff(user: User) -> None:
    if user.role not in ("moderator", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only moderators or admins can access this resource.",
        )


def _avatar_color(seed: str) -> str:
    """Stable hash → palette index. Mirrors the JS helper."""
    h = 0
    for ch in str(seed or "?"):
        h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
        if h >= 0x80000000:
            h -= 0x100000000
    return _AVATAR_PALETTE[abs(h) % len(_AVATAR_PALETTE)]


def _avatar_letter(name: str | None) -> str:
    s = str(name or "?").strip()
    return s[0].upper() if s else "?"


def _post_url(post: Post) -> str:
    if post.post_type == "discussion":
        return f"./discussion-detail.html?id={post.id}"
    return f"./question-detail.html?id={post.id}"


def _is_staff(u: User) -> bool:
    return u.role in ("moderator", "admin")


def _can_act_on(viewer: User, target: User) -> bool:
    """Base guard: can viewer act on target at all?

    - Can never act on yourself (lockout prevention).
    - Only admins may act on other staff members.
    """
    if viewer.id == target.id:
        return False
    if _is_staff(target) and viewer.role != "admin":
        return False
    return True


def _compute_user_actions(target: User, viewer: User) -> list[dict]:
    """Return the list of `{label, tone}` actions the viewer can take
    on the target user. Used by the Users tab's Actions column.

    This is the *display* side of the authorization matrix. The
    `update_user` endpoint re-enforces the same rules server-side,
    so a tampered POST cannot bypass them.
    """
    if not _can_act_on(viewer, target):
        return []

    is_admin = viewer.role == "admin"
    actions: list[dict] = []

    if target.status == "active":
        actions.append({"label": "Suspend", "tone": "warning"})
        if is_admin:
            actions.append({"label": "Ban", "tone": "danger"})
            if target.role == "user":
                actions.append({"label": "Promote", "tone": "primary"})
            elif target.role == "moderator":
                actions.append({"label": "Demote", "tone": "clear"})
    elif target.status == "suspended":
        actions.append({"label": "Unsuspend", "tone": "success"})
        if is_admin:
            actions.append({"label": "Ban", "tone": "danger"})
    elif target.status == "banned":
        if is_admin:
            actions.append({"label": "Unban", "tone": "clear"})

    return actions


# ── Request model ──────────────────────────────────────────────────────

class UserActionIn(BaseModel):
    """Body for PATCH /api/admin/users/{id}."""
    action: Literal["suspend", "unsuspend", "ban", "unban", "promote", "demote"]
    days:   int = Field(default=7, ge=1, le=365,
                        description="Suspension duration (suspend only)")


# ── Routes ─────────────────────────────────────────────────────────────

@router.get("/post-marks")
def list_post_marks(
    page:      int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List every moderator-applied post mark."""
    _require_staff(user)

    stmt = (
        select(PostMark, Post, User)
        .join(Post, Post.id == PostMark.post_id)
        .outerjoin(User, User.id == PostMark.marked_by_user_id)
        .where(Post.deleted_at.is_(None))
        .order_by(PostMark.created_at.desc())
    )

    total = db.scalar(
        select(func.count())
        .select_from(PostMark)
        .join(Post, Post.id == PostMark.post_id)
        .where(Post.deleted_at.is_(None))
    ) or 0

    rows = db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    ).all()

    items = []
    for mark, post, marker in rows:
        mark_label = _MARK_LABELS.get(mark.mark_type, mark.mark_type)
        mark_tone  = _MARK_TONES.get(mark.mark_type, "tonal")

        items.append({
            "id":           str(mark.id),
            "title":        post.title,
            "url":          _post_url(post),
            "mark":         mark_label,
            "markTone":     mark_tone,
            "markedBy":     marker.display_name if marker else "System",
            "markedByTone": None,
            "markedAt":     mark.created_at.isoformat() if mark.created_at else None,
            "score":        int(post.score or 0),
            "actions":      [],
        })

    return {
        "items": items, "total": total,
        "page": page, "page_size": page_size,
    }


@router.get("/users")
def list_admin_users(
    page:      int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List every user with admin-scope fields.

    The `actions` array for each row is computed server-side from the
    viewer's role + the target's role/status. This is what makes the
    Actions column show the correct buttons per row without the frontend
    re-implementing the authorization matrix.
    """
    _require_staff(user)

    stmt = select(User).order_by(User.created_at.desc())
    total = db.scalar(select(func.count()).select_from(User)) or 0
    rows  = db.scalars(
        stmt.offset((page - 1) * page_size).limit(page_size)
    ).all()

    items = []
    for u in rows:
        role_label  = _ROLE_LABELS.get(u.role, u.role)
        role_tone   = _ROLE_TONES.get(u.role, "tonal")
        status_lbl  = _STATUS_LABELS.get(u.status, u.status)
        status_tone = _STATUS_TONES.get(u.status, "tonal")

        items.append({
            "id":             u.id,
            "username":       u.username,
            "displayName":    u.display_name or u.username,
            "avatarLetter":   _avatar_letter(u.display_name or u.username),
            "avatarColor":    _avatar_color(u.username or str(u.id)),
            "email":          str(u.email),
            "reputation":     int(u.reputation or 0),
            "joinedAt":       u.created_at.isoformat() if u.created_at else None,
            "role":           role_label,
            "roleTone":       role_tone,
            "status":         status_lbl,
            "statusTone":     status_tone,
            "suspendedUntil": u.suspended_until.isoformat() if u.suspended_until else None,
            "actions":        _compute_user_actions(u, user),
        })

    return {
        "items": items, "total": total,
        "page": page, "page_size": page_size,
    }


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserActionIn,
    db: Session = Depends(get_db),
    viewer: User = Depends(get_current_user),
):
    """Apply a moderation action to a user.

    Server-side enforcement of the authorization matrix in the module
    docstring. Every action re-checks:
      - staff-only endpoint (`_require_staff`)
      - target exists
      - viewer can act on target (`_can_act_on`)
      - action-specific preconditions (ban/promote/demote are admin-only)
    """
    _require_staff(viewer)

    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found.")

    if not _can_act_on(viewer, target):
        raise HTTPException(
            403, "You cannot perform this action on this user."
        )

    is_admin = viewer.role == "admin"
    now = datetime.now(timezone.utc)

    if payload.action == "suspend":
        if target.status == "banned":
            raise HTTPException(
                400, "Cannot suspend a banned user. Unban first."
            )
        target.status = "suspended"
        target.suspended_until = now + timedelta(days=payload.days)

    elif payload.action == "unsuspend":
        if target.status != "suspended":
            raise HTTPException(400, "User is not currently suspended.")
        target.status = "active"
        target.suspended_until = None

    elif payload.action == "ban":
        if not is_admin:
            raise HTTPException(403, "Only admins can ban users.")
        target.status = "banned"
        target.suspended_until = None

    elif payload.action == "unban":
        if not is_admin:
            raise HTTPException(403, "Only admins can unban users.")
        if target.status != "banned":
            raise HTTPException(400, "User is not currently banned.")
        target.status = "active"
        target.suspended_until = None

    elif payload.action == "promote":
        if not is_admin:
            raise HTTPException(403, "Only admins can promote users.")
        if target.role != "user":
            raise HTTPException(400, "User is already staff.")
        target.role = "moderator"

    elif payload.action == "demote":
        if not is_admin:
            raise HTTPException(403, "Only admins can demote staff.")
        if target.role == "admin":
            raise HTTPException(400, "Cannot demote another admin.")
        if target.role != "moderator":
            raise HTTPException(400, "User is not a moderator.")
        target.role = "user"

    db.commit()
    db.refresh(target)

    return {
        "id":             target.id,
        "role":           target.role,
        "status":         target.status,
        "suspendedUntil": target.suspended_until.isoformat()
                          if target.suspended_until else None,
    }