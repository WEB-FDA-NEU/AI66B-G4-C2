"""Public user list + profile."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import schemas
from db import get_db
from models import Answer, Post, User

router = APIRouter(prefix="/api", tags=["users"])


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
        stmt = stmt.where(func.lower(User.username).like(like))

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