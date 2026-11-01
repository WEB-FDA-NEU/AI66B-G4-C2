"""Public user list + profile + author content."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

import schemas
from db import get_db
from models import Answer, Post, User

router = APIRouter(prefix="/api", tags=["users"])


# ── Helpers ─────────────────────────────────────────────────────────────

def _excerpt(body: str, length: int = 200) -> str:
    """Word-boundary excerpt. Matches the one in routers/posts.py."""
    text_body = (body or "").strip()
    if len(text_body) <= length:
        return text_body
    head = text_body[:length].rsplit(" ", 1)[0]
    return (head or text_body[:length]).rstrip() + "…"


# ── List users ──────────────────────────────────────────────────────────

@router.get("/users", response_model=schemas.UserPage)
def list_users(
    q:    str = "",
    sort: str = "reputation",
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(User).where(User.status == "active")

    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.username).like(like),
                func.lower(User.display_name).like(like),
            )
        )

    if sort == "name":
        stmt = stmt.order_by(User.username.asc())
    else:
        stmt = stmt.order_by(User.reputation.desc(), User.username.asc())

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    users = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()

    return {
        "items": [
            {"id": u.id, "username": u.username,
             "display_name": u.display_name, "reputation": u.reputation,
             "bio": u.bio, "created_at": u.created_at}
            for u in users
        ],
        "total": total, "page": page, "page_size": page_size,
    }


# ── Single user profile ─────────────────────────────────────────────────

@router.get("/users/{username}", response_model=schemas.UserProfile)
def get_user(username: str, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(func.lower(User.username) == username.lower()))
    if u is None:
        raise HTTPException(404, "User not found.")
    post_count = db.scalar(select(func.count()).select_from(Post)
                          .where(Post.author_id == u.id, Post.deleted_at.is_(None))) or 0
    answer_count = db.scalar(select(func.count()).select_from(Answer)
                            .where(Answer.author_id == u.id, Answer.deleted_at.is_(None))) or 0
    return {
        "id": u.id, "username": u.username,
        "display_name": u.display_name, "reputation": u.reputation,
        "bio": u.bio, "created_at": u.created_at,
        "role": u.role, "website": u.website, "location": u.location,
        "post_count": post_count, "answer_count": answer_count,
    }


# ── User's answers (new) ────────────────────────────────────────────────

@router.get("/users/{username}/answers", response_model=schemas.UserAnswerPage)
def list_user_answers(
    username: str,
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    u = db.scalar(select(User).where(func.lower(User.username) == username.lower()))
    if u is None:
        raise HTTPException(404, "User not found.")

    base = select(Answer).where(
        Answer.author_id == u.id, Answer.deleted_at.is_(None)
    )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    rows = db.scalars(
        base.order_by(Answer.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    post_ids = {a.post_id for a in rows}
    posts = (
        {p.id: p for p in db.scalars(select(Post).where(Post.id.in_(post_ids)))}
        if post_ids else {}
    )

    return {
        "items": [
            {
                "id":           a.id,
                "body_excerpt": _excerpt(a.body),
                "score":        a.score,
                "is_accepted":  a.is_accepted,
                "post_id":      a.post_id,
                "post_title":   posts[a.post_id].title if a.post_id in posts else "",
                "post_type":    posts[a.post_id].post_type if a.post_id in posts else "question",
                "created_at":   a.created_at,
            }
            for a in rows
        ],
        "total": total, "page": page, "page_size": page_size,
    }