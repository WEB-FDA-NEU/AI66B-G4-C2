"""
Notification helpers.

`notify()` never commits — the caller owns the transaction.
Callers commit immediately after, wrapped in try/except so a
notification failure does not roll back the primary action.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from models import Notification
from sqlalchemy import select
from sqlalchemy.orm import Session

DEDUPE_WINDOW = timedelta(hours=1)


def notify(
    db: Session,
    *,
    user_id: int | None,
    actor_id: int | None,
    type: str,
    target_type: str | None = None,
    target_id: int | None = None,
    title_preview: str = "",
    url: str = "",
) -> Notification | None:
    """Create a notification unless it would be redundant.

    Skips:
      - self-notifications (actor == recipient)
      - duplicates inside DEDUPE_WINDOW (same actor/type/target)
    """
    if user_id is None:
        return None
    if actor_id is not None and actor_id == user_id:
        return None

    recent = db.scalar(
        select(Notification).where(
            Notification.user_id     == user_id,
            Notification.actor_id    == actor_id,
            Notification.type        == type,
            Notification.target_type == target_type,
            Notification.target_id   == target_id,
            Notification.created_at  > datetime.now(timezone.utc) - DEDUPE_WINDOW,
        ).limit(1)
    )
    if recent is not None:
        return None

    n = Notification(
        user_id=user_id,
        actor_id=actor_id,
        type=type,
        target_type=target_type,
        target_id=target_id,
        title_preview=(title_preview or "")[:200],
        url=url or "",
    )
    db.add(n)
    return n


# ── URL builders (single source of truth) ───────────────────────────────

def post_url(post) -> str:
    kind = "discussion" if post.post_type == "discussion" else "question"
    return f"./{kind}-detail.html?id={post.id}"


def post_anchor_url(post, anchor: str) -> str:
    return post_url(post) + (f"#{anchor}" if anchor else "")


def answer_url(post, answer) -> str:
    return post_anchor_url(post, f"answer-{answer.id}")


def comment_url(post, comment) -> str:
    return post_anchor_url(post, f"comment-{comment.id}")