"""Notification endpoints — list, unread count, mark read, dismiss."""
from __future__ import annotations

import schemas
from db import get_db
from deps import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query, status
from models import Notification, User
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _actor_block(u: User | None) -> dict | None:
    if u is None:
        return None
    return {
        "id":           u.id,
        "username":     u.username,
        "display_name": u.display_name,
        "reputation":   u.reputation,
    }


@router.get("", response_model=schemas.NotificationPage)
def list_notifications(
    unread_only: bool = False,
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    base = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        base = base.where(Notification.is_read.is_(False))

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.order_by(Notification.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
    ).all()

    actor_ids = {n.actor_id for n in rows if n.actor_id}
    actors = {
        u.id: u for u in db.scalars(select(User).where(User.id.in_(actor_ids)))
    } if actor_ids else {}

    unread = db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
    ) or 0

    return {
        "items": [
            {
                "id":            n.id,
                "type":          n.type,
                "actor":         _actor_block(actors.get(n.actor_id)) if n.actor_id else None,
                "target_type":   n.target_type,
                "target_id":     n.target_id,
                "title_preview": n.title_preview,
                "url":           n.url,
                "is_read":       n.is_read,
                "created_at":    n.created_at,
            }
            for n in rows
        ],
        "total":     total,
        "unread":    unread,
        "page":      page,
        "page_size": page_size,
    }


@router.get("/unread-count")
def unread_count(
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    count = db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
    ) or 0
    return {"unread": count}


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    notification_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, "Notification not found.")
    if not n.is_read:
        n.is_read = True
        db.commit()
    return None


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return None


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def dismiss(
    notification_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, "Notification not found.")
    db.delete(n)
    db.commit()
    return None