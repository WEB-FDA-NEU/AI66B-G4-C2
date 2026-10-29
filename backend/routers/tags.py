"""Tags list + single-tag detail."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import schemas
from db import get_db
from models import Post, PostTag, Tag

router = APIRouter(prefix="/api", tags=["tags"])


@router.get("/tags")
def list_tags(
    q:    str = "",
    sort: str = "popular",
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(Tag)
    if q:
        stmt = stmt.where(func.lower(Tag.name).like(f"%{q.lower()}%"))

    count_sq = (
        select(PostTag.tag_id, func.count().label("n"))
        .join(Post, Post.id == PostTag.post_id)
        .where(Post.deleted_at.is_(None))
        .group_by(PostTag.tag_id)
        .subquery()
    )

    if sort == "name":
        stmt = stmt.order_by(Tag.name.asc())
    elif sort == "new":
        stmt = stmt.order_by(Tag.created_at.desc())
    else:
        stmt = stmt.order_by(
            func.coalesce(count_sq.c.n, 0).desc(), Tag.name.asc()
        ).outerjoin(count_sq, count_sq.c.tag_id == Tag.id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    tags = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()

    counts = dict(db.execute(select(PostTag.tag_id, func.count())
                             .where(PostTag.tag_id.in_([t.id for t in tags]))
                             .group_by(PostTag.tag_id)).all()) if tags else {}

    return {
        "items": [
            {"id": t.id, "name": t.name, "description": t.description,
             "post_count": counts.get(t.id, 0)}
            for t in tags
        ],
        "total": total, "page": page, "page_size": page_size,
    }


@router.get("/tags/{name}")
def get_tag(name: str, db: Session = Depends(get_db)):
    tag = db.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
    if tag is None:
        raise HTTPException(404, "Tag not found.")
    count = db.scalar(
        select(func.count()).select_from(PostTag)
        .join(Post, Post.id == PostTag.post_id)
        .where(PostTag.tag_id == tag.id, Post.deleted_at.is_(None))
    ) or 0
    return {"id": tag.id, "name": tag.name,
            "description": tag.description, "post_count": count}