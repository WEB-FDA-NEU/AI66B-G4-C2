"""Admin endpoints — moderation console data.

   Only moderators and admins may hit these routes; regular users get 403
   (via the `_require_staff` helper). The middleware in `main.py` already
   blocks unauthorized users from loading `admin.html`, so these routes
   are the second line of defense — they also prevent a regular user who
   somehow reaches the API directly from reading or mutating moderation
   state.

   Routes
   ──────
   GET    /api/admin/post-marks             → list post marks
   DELETE /api/admin/post-marks/{mark_id}   → remove a mark
   GET    /api/admin/users                  → list users with admin fields
   PATCH  /api/admin/users/{user_id}        → suspend / ban / promote / …
   GET    /api/admin/hidden-posts           → list soft-deleted posts
   PATCH  /api/admin/posts/{post_id}/hide   → soft-delete a post
   PATCH  /api/admin/posts/{post_id}/restore→ un-delete a post

   Field shapes returned by GET endpoints match what
   `admin-listings.js` reads directly:
     · post-marks:   id, title, url, mark, markTone, markedBy, markedAt,
                     score, actions
     · users:        id, username, displayName, avatarLetter, avatarColor,
                     email, reputation, joinedAt, role, roleTone, status,
                     statusTone, suspendedUntil, actions
     · hidden-posts: id, title, url, author, authorUsername, deletedAt,
                     score, actions
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal

import dedupe
from db import get_db
from deps import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query, status
from models import Post, PostMark, User
from notifications import notify, post_url
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

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
    if viewer.id == target.id:
        return False
    if _is_staff(target) and viewer.role != "admin":
        return False
    return True


def _compute_user_actions(target: User, viewer: User) -> list[dict]:
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


# ── Request models ──────────────────────────────────────────────────────

class UserActionIn(BaseModel):
    action: Literal["suspend", "unsuspend", "ban", "unban", "promote", "demote"]
    days:   int = Field(default=7, ge=1, le=365,
                        description="Suspension duration (suspend only)")


# ── Post marks ──────────────────────────────────────────────────────────

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
            "actions":      [{"label": "Remove Mark", "tone": "clear"}],
        })

    return {
        "items": items, "total": total,
        "page": page, "page_size": page_size,
    }


@router.delete("/post-marks/{mark_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_post_mark(
    mark_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove a specific post mark."""
    _require_staff(user)

    mark = db.get(PostMark, mark_id)
    if mark is None:
        raise HTTPException(404, "Post mark not found.")

    db.delete(mark)
    db.commit()
    return None


# ── Users ───────────────────────────────────────────────────────────────

@router.get("/users")
def list_admin_users(
    page:      int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List every user with admin-scope fields."""
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
    """Apply a moderation action to a user."""
    _require_staff(viewer)

    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found.")

    if not _can_act_on(viewer, target):
        raise HTTPException(403, "You cannot perform this action on this user.")

    is_admin = viewer.role == "admin"
    now = datetime.now(timezone.utc)

    if payload.action == "suspend":
        if target.status == "banned":
            raise HTTPException(400, "Cannot suspend a banned user. Unban first.")
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
    
    try:
        msg = {
            "suspend": f"Your account was suspended for {payload.days} day"
                       f"{'s' if payload.days != 1 else ''}.",
            "ban":     "Your account was banned.",
            "promote": "You were promoted to moderator.",
            "demote":  "You were demoted to a regular user.",
        }.get(payload.action)
        if msg and target.id != viewer.id:
            notify(
                db,
                user_id=target.id,
                actor_id=viewer.id,
                type="role_change",
                target_type="user",
                target_id=target.id,
                title_preview=msg,
                url="./settings.html",
            )
            db.commit()
    except Exception:
        db.rollback()

    return {
        "id":             target.id,
        "role":           target.role,
        "status":         target.status,
        "suspendedUntil": target.suspended_until.isoformat()
                          if target.suspended_until else None,
    }


# ── Hidden content (soft-deleted posts) ─────────────────────────────────

@router.get("/hidden-posts")
def list_hidden_posts(
    page:      int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all soft-deleted posts (removed from public view).

    This is the "Hidden Content" tab. Only moderators/admins can see
    these, and each row exposes a Restore action so content can be
    un-hidden if it was deleted erroneously.
    """
    _require_staff(user)

    stmt = (
        select(Post, User)
        .outerjoin(User, User.id == Post.author_id)
        .where(Post.deleted_at.is_not(None))
        .order_by(Post.deleted_at.desc())
    )

    total = db.scalar(
        select(func.count()).select_from(Post)
        .where(Post.deleted_at.is_not(None))
    ) or 0

    rows = db.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    ).all()

    items = []
    for post, author in rows:
        kind = "discussion" if post.post_type == "discussion" else "question"
        items.append({
            "id":             str(post.id),
            "title":          post.title,
            "url":            _post_url(post),
            "type":           kind,
            "author":         author.display_name if author else "anonymous",
            "authorUsername": author.username if author else "",
            "deletedAt":      post.deleted_at.isoformat() if post.deleted_at else None,
            "score":          int(post.score or 0),
            "actions":        [{"label": "Restore", "tone": "clear"}],
        })

    return {
        "items": items, "total": total,
        "page": page, "page_size": page_size,
    }


@router.patch("/posts/{post_id}/hide", status_code=status.HTTP_204_NO_CONTENT)
def hide_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Soft-delete a post from the admin panel (idempotent)."""
    _require_staff(user)

    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(404, "Post not found.")
    if post.deleted_at is not None:
        return None  # already hidden

    post.deleted_at = datetime.now(timezone.utc)
    db.commit()
    
    try:
        notify(
            db,
            user_id=post.author_id,
            actor_id=user.id,
            type="moderation",
            target_type="post",
            target_id=post.id,
            title_preview=post.title,
            url=post_url(post),
        )
        db.commit()
    except Exception:
        db.rollback()
    
    return None


@router.patch("/posts/{post_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Un-delete a soft-deleted post."""
    _require_staff(user)

    post = db.get(Post, post_id)
    if post is None:
        raise HTTPException(404, "Post not found.")
    if post.deleted_at is None:
        return None  # already visible

    post.deleted_at = None
    db.commit()
    return None

# ── Post marks (create) ─────────────────────────────────────────────────

class PostMarkIn(BaseModel):
    post_id:   int
    mark_type: Literal["duplicated", "violated", "off_topic", "spam"]
    notes:     str = Field(default="", max_length=500)


@router.post("/post-marks", status_code=status.HTTP_201_CREATED)
def create_post_mark(
    payload: PostMarkIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create (or update) a moderator mark on a post.

    Re-posting an existing mark of the same type overwrites its notes —
    this is what the Duplicates tab relies on to update the
    "duplicate of …" reference without forcing a delete first.
    """
    _require_staff(user)

    post = db.get(Post, payload.post_id)
    if post is None or post.deleted_at is not None:
        raise HTTPException(404, "Post not found.")

    existing = db.scalar(
        select(PostMark).where(
            PostMark.post_id   == payload.post_id,
            PostMark.mark_type == payload.mark_type,
        )
    )
    now = datetime.now(timezone.utc)

    if existing is not None:
        existing.notes             = payload.notes
        existing.marked_by_user_id = user.id
        existing.created_at        = now
    else:
        existing = PostMark(
            post_id=payload.post_id,
            mark_type=payload.mark_type,
            marked_by_user_id=user.id,
            notes=payload.notes,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)
    
    try:
        post = db.get(Post, payload.post_id)
        if post is not None and post.author_id != user.id:
            label = payload.mark_type.replace("_", "-")
            notify(
                db,
                user_id=post.author_id,
                actor_id=user.id,
                type="moderation",
                target_type="post",
                target_id=post.id,
                title_preview=f"Marked as {label} · {post.title}"[:200],
                url=post_url(post),
            )
            db.commit()
    except Exception:
        db.rollback()
    
    return {
        "id":        existing.id,
        "post_id":   existing.post_id,
        "mark_type": existing.mark_type,
        "notes":     existing.notes,
    }


# ── Duplicate scan ─────────────────────────────────────────────────────

def _batch_post_tags(db: Session, post_ids: list[int]) -> dict[int, list[str]]:
    if not post_ids:
        return {}
    from models import PostTag, Tag
    rows = db.execute(
        select(PostTag.post_id, Tag.name)
        .join(Tag, Tag.id == PostTag.tag_id)
        .where(PostTag.post_id.in_(post_ids))
    ).all()
    out: dict[int, list[str]] = defaultdict(list)
    for pid, name in rows:
        out[pid].append(name)
    return out


def _enrich_post_for_dupes(p: Post, authors: dict[int, User]) -> dict:
    a = authors.get(p.author_id)
    kind = "discussion" if p.post_type == "discussion" else "question"
    return {
        "id":             p.id,
        "title":          p.title,
        "url":            f"./{kind}-detail.html?id={p.id}",
        "type":           kind,
        "author":         a.display_name if a else "anonymous",
        "authorUsername": a.username if a else "",
        "score":          int(p.score or 0),
        "createdAt":      p.created_at.isoformat() if p.created_at else None,
    }


def _scan_duplicates(
    db: Session,
    post_type: str | None = None,
    min_similarity: float = 0.65,
    focus_post_id: int | None = None,
) -> list[tuple]:
    """Return a sorted list of (PairScore, post_a, post_b) tuples."""
    stmt = select(Post).where(Post.deleted_at.is_(None))
    if post_type:
        stmt = stmt.where(Post.post_type == post_type)
    posts = list(db.scalars(stmt).all())
    if len(posts) < 2:
        return []

    focus = None
    if focus_post_id is not None:
        focus = next((p for p in posts if p.id == focus_post_id), None)
        if focus is None:
            return []
        posts = [p for p in posts if p.post_type == focus.post_type]

    ids = [p.id for p in posts]
    tags_map = _batch_post_tags(db, ids)
    post_index = {p.id: p for p in posts}

    # ── Build corpus dicts once — this is what the engine indexes ───
    corpus_dicts = [
        {
            "id":        p.id,
            "title":     p.title,
            "body":      p.body,
            "tags":      tags_map.get(p.id, []),
            "post_type": p.post_type,
        }
        for p in posts
    ]
    engine = dedupe.SimilarityEngine(corpus_dicts)

    # ── Blocking indices (unchanged) ────────────────────────────────
    tag_index:   dict[str, set[int]] = defaultdict(set)
    token_index: dict[str, set[int]] = defaultdict(set)
    for p in posts:
        for t in tags_map.get(p.id, []):
            tag_index[t.lower()].add(p.id)
        for w in dedupe.tokenize(p.title)[:10]:
            if len(w) >= 3:
                token_index[w].add(p.id)

    q_cache: dict[int, dedupe.Query] = {}
    def q_for(pid: int) -> dedupe.Query:
        if pid not in q_cache:
            p = post_index[pid]
            q_cache[pid] = dedupe.build_query(
                title=p.title, body=p.body,
                tags=tags_map.get(p.id, []),
                post_type=p.post_type,
            )
        return q_cache[pid]

    seen_pairs: set[tuple[int, int]] = set()
    results: list[tuple] = []

    for p in posts:
        candidates: set[int] = set()
        for t in tags_map.get(p.id, []):
            candidates.update(tag_index[t.lower()])
        for w in dedupe.tokenize(p.title)[:10]:
            if len(w) >= 3:
                candidates.update(token_index[w])
        candidates.discard(p.id)

        for cid in candidates:
            pair = tuple(sorted((p.id, cid)))
            if pair in seen_pairs:
                continue
            if focus is not None and p.id != focus.id and cid != focus.id:
                continue
            seen_pairs.add(pair)

            c = post_index[cid]
            cand = {
                "id":        c.id,
                "title":     c.title,
                "body":      c.body,
                "tags":      tags_map.get(c.id, []),
                "post_type": c.post_type,
            }
            # ── Use the shared engine ──────────────────────────────
            s = engine.score_pair(q_for(p.id), cand)
            if s.score >= min_similarity:
                results.append((s, p, c))

    marked = set(
        db.scalars(
            select(PostMark.post_id).where(PostMark.mark_type == "duplicated")
        ).all()
    )
    results = [(s, a, b) for s, a, b in results
               if a.id not in marked and b.id not in marked]

    results.sort(key=lambda r: r[0].score, reverse=True)
    return results


@router.get("/duplicates")
def list_duplicate_candidates(
    page:           int   = Query(1,  ge=1),
    page_size:      int   = Query(20, ge=1, le=100),
    min_similarity: float = Query(0.5, ge=0.0, le=1.0),
    post_type:      Literal["question", "discussion"] | None = None,
    post_id:        int | None = Query(None, description="Focus on one post"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return pairs of posts that look like duplicates of each other.

    Scans every non-deleted post, groups candidates by tag and title
    token, and scores the resulting pairs via `dedupe.score_pair`.
    Results are sorted by similarity (highest first), paginated, and
    enriched with author + URL metadata for the admin list.

    `post_id` narrows the scan to pairs involving a single post —
    useful for the "check this report's target" workflow.
    """
    _require_staff(user)

    pairs = _scan_duplicates(
        db, post_type=post_type,
        min_similarity=min_similarity,
        focus_post_id=post_id,
    )
    total = len(pairs)
    start = (page - 1) * page_size
    page_rows = pairs[start:start + page_size]

    # Batch-fetch authors for the current page only
    author_ids = {p.author_id for _, a, b in page_rows for p in (a, b)}
    authors = {
        u.id: u for u in db.scalars(
            select(User).where(User.id.in_(author_ids))
        )
    } if author_ids else {}

    items = []
    for score, a, b in page_rows:
        items.append({
            "id":         f"{a.id}:{b.id}",
            "similarity": score.score,
            "label":      score.label,
            "post_a":     _enrich_post_for_dupes(a, authors),
            "post_b":     _enrich_post_for_dupes(b, authors),
        })

    return {
        "items": items, "total": total,
        "page": page, "page_size": page_size,
        "min_similarity": min_similarity,
    }