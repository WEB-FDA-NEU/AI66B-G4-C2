"""Posts: questions + discussions, list / detail / create / update / delete
   plus answers, comments and votes."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import schemas
from db import get_db
from deps import get_current_user, get_current_user_optional
from models import Answer, Comment, Post, PostTag, Tag, User, Vote

router = APIRouter(prefix="/api", tags=["posts"])


# ── Helpers ─────────────────────────────────────────────────────────────

def _author(u: User) -> dict:
    return {
        "id": u.id, "username": u.username,
        "display_name": u.display_name, "reputation": u.reputation,
    }


def _excerpt(body: str, length: int = 220) -> str:
    """Trim body to a word-boundary excerpt with an ellipsis."""
    text_body = (body or "").strip()
    if len(text_body) <= length:
        return text_body
    head = text_body[:length].rsplit(" ", 1)[0]
    return (head or text_body[:length]).rstrip() + "…"


def _load_authors(db: Session, ids: set[int]) -> dict[int, User]:
    if not ids:
        return {}
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids)))}


def _load_tags_for(db: Session, post_ids: list[int]) -> dict[int, list[Tag]]:
    if not post_ids:
        return {}
    rows = db.execute(
        select(PostTag.post_id, Tag)
        .join(Tag, Tag.id == PostTag.tag_id)
        .where(PostTag.post_id.in_(post_ids))
    ).all()
    out: dict[int, list[Tag]] = defaultdict(list)
    for pid, tag in rows:
        out[pid].append(tag)
    return out


def _tag_out(t: Tag, count: int = 0) -> dict:
    return {"id": t.id, "name": t.name,
            "description": t.description, "post_count": count}


def _card(p: Post, a: User, tags: list[Tag]) -> dict:
    return {
        "id":           p.id,
        "post_type":    p.post_type,
        "title":        p.title,
        "body_excerpt": _excerpt(p.body),
        "author":       _author(a),
        "tags":         [_tag_out(t) for t in tags],
        "score":        p.score,
        "answer_count": p.answer_count,
        "reply_count":  p.reply_count,
        "view_count":   p.view_count,
        "is_answered":  p.accepted_answer_id is not None,
        "created_at":   p.created_at,
        "updated_at":   p.updated_at,
    }


def _upsert_tags(db: Session, names: list[str]) -> list[Tag]:
    """Find or create tags. Uses SAVEPOINTs to survive insert races."""
    out: list[Tag] = []
    seen: set[str] = set()
    for raw in (names or [])[:5]:
        name = raw.strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)

        tag = db.scalar(select(Tag).where(func.lower(Tag.name) == name))
        if tag is None:
            try:
                # begin_nested() creates a SAVEPOINT — if the insert
                # collides with a concurrent insert, only the savepoint
                # rolls back, not the caller's pending changes.
                with db.begin_nested():
                    tag = Tag(name=name, description="")
                    db.add(tag)
            except IntegrityError:
                tag = db.scalar(
                    select(Tag).where(func.lower(Tag.name) == name)
                )
        if tag is not None:
            out.append(tag)
    return out


# ── List ────────────────────────────────────────────────────────────────

@router.get("/posts", response_model=schemas.PostPage)
def list_posts(
    type: Literal["question", "discussion"] | None = Query(None),
    q:    str = "",
    tag:  str = "",
    sort: Literal["newest", "active", "votes", "views", "unanswered"] = "newest",
    mine: bool = False,
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    stmt = select(Post).where(Post.deleted_at.is_(None))

    if type:
        stmt = stmt.where(Post.post_type == type)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(Post.title).like(like),
                func.lower(Post.body).like(like))
        )
    if tag:
        stmt = (stmt
                .join(PostTag, PostTag.post_id == Post.id)
                .join(Tag, Tag.id == PostTag.tag_id)
                .where(func.lower(Tag.name) == tag.lower()))
    if mine:
        if user is None:
            raise HTTPException(401, "Login required for `mine=true`.")
        stmt = stmt.where(Post.author_id == user.id)
    if sort == "unanswered":
        stmt = stmt.where(Post.answer_count == 0).where(Post.post_type == "question")

    order = {
        "newest":     Post.created_at.desc(),
        "active":     Post.updated_at.desc(),
        "votes":      Post.score.desc(),
        "views":      Post.view_count.desc(),
        "unanswered": Post.created_at.desc(),
    }[sort]
    stmt = stmt.order_by(order)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    posts = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()

    authors = _load_authors(db, {p.author_id for p in posts})
    tags_by_post = _load_tags_for(db, [p.id for p in posts])

    return {
        "items": [_card(p, authors[p.author_id], tags_by_post[p.id]) for p in posts],
        "total": total, "page": page, "page_size": page_size,
    }


# ── Detail ──────────────────────────────────────────────────────────────

@router.get("/posts/{post_id}", response_model=schemas.PostDetail)
def get_post(
    post_id: int,
    increment_views: bool = Query(True, include_in_schema=False),
    db: Session = Depends(get_db),
):
    p = db.get(Post, post_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Post not found.")

    # Optionally bump view counter — skipped on internal calls
    # from create_post / update_post so users don't see phantom views.
    if increment_views:
        try:
            db.execute(
                text("UPDATE posts SET view_count = view_count + 1 WHERE id = :id"),
                {"id": p.id},
            )
            db.commit()
            db.refresh(p)
        except Exception:
            db.rollback()

    authors = _load_authors(db, {p.author_id})
    tags_by_post = _load_tags_for(db, [p.id])
    card = _card(p, authors[p.author_id], tags_by_post[p.id])
    card["body"] = p.body

    # Top-level comments on the post
    comments = db.scalars(
        select(Comment)
        .where(Comment.post_id == p.id, Comment.answer_id.is_(None),
               Comment.deleted_at.is_(None))
        .order_by(Comment.created_at.asc())
    ).all()

    # Answers + their comments (questions only)
    answers = []
    if p.post_type == "question":
        ans_rows = db.scalars(
            select(Answer)
            .where(Answer.post_id == p.id, Answer.deleted_at.is_(None))
            .order_by(Answer.is_accepted.desc(), Answer.score.desc(),
                      Answer.created_at.asc())
        ).all()
        ans_comments = db.scalars(
            select(Comment)
            .where(Comment.answer_id.in_([a.id for a in ans_rows]),
                   Comment.deleted_at.is_(None))
            .order_by(Comment.created_at.asc())
        ).all() if ans_rows else []

        all_users = _load_authors(
            db, {p.author_id}
            | {a.author_id for a in ans_rows}
            | {c.author_id for c in list(comments) + list(ans_comments)}
        )

        ans_comments_by_answer = defaultdict(list)
        for c in ans_comments:
            ans_comments_by_answer[c.answer_id].append(c)

        for a in ans_rows:
            answers.append({
                "id":          a.id,
                "post_id":     a.post_id,
                "author":      _author(all_users[a.author_id]),
                "body":        a.body,
                "score":       a.score,
                "is_accepted": a.is_accepted,
                "created_at":  a.created_at,
                "updated_at":  a.updated_at,
                "comments": [
                    {
                        "id": c.id, "post_id": c.post_id,
                        "answer_id": c.answer_id,
                        "parent_comment_id": c.parent_comment_id,
                        "author": _author(all_users[c.author_id]),
                        "body": c.body, "score": c.score,
                        "created_at": c.created_at,
                    }
                    for c in ans_comments_by_answer[a.id]
                ],
            })
    else:
        all_users = _load_authors(
            db, {p.author_id} | {c.author_id for c in comments}
        )

    card["answers"] = answers
    card["comments"] = [
        {
            "id": c.id, "post_id": c.post_id, "answer_id": c.answer_id,
            "parent_comment_id": c.parent_comment_id,
            "author": _author(all_users[c.author_id]),
            "body": c.body, "score": c.score,
            "created_at": c.created_at,
        }
        for c in comments
    ]
    return card


# ── Create ──────────────────────────────────────────────────────────────

@router.post("/posts", response_model=schemas.PostDetail,
             status_code=status.HTTP_201_CREATED)
def create_post(
    payload: schemas.PostCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = Post(
        post_type=payload.post_type,
        title=payload.title.strip(),
        body=payload.body,
        author_id=user.id,
    )
    db.add(post)
    db.flush()

    for tag in _upsert_tags(db, payload.tags):
        db.add(PostTag(post_id=post.id, tag_id=tag.id))

    db.commit()
    db.refresh(post)
    return get_post(post.id, increment_views=False, db=db)


# ── Update / Delete ─────────────────────────────────────────────────────

@router.patch("/posts/{post_id}", response_model=schemas.PostDetail)
def update_post(
    post_id: int,
    payload: schemas.PostUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.get(Post, post_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Post not found.")
    if p.author_id != user.id and user.role not in ("moderator", "admin"):
        raise HTTPException(403, "You do not own this post.")

    if payload.title is not None:
        p.title = payload.title.strip()
    if payload.body is not None:
        p.body = payload.body
    if payload.tags is not None:
        db.execute(delete(PostTag).where(PostTag.post_id == p.id))
        for tag in _upsert_tags(db, payload.tags):
            db.add(PostTag(post_id=p.id, tag_id=tag.id))

    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return get_post(p.id, increment_views=False, db=db)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.get(Post, post_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Post not found.")
    if p.author_id != user.id and user.role not in ("moderator", "admin"):
        raise HTTPException(403, "You do not own this post.")
    p.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return None


# ── Answers ─────────────────────────────────────────────────────────────

@router.post("/posts/{post_id}/answers", response_model=schemas.AnswerOut,
             status_code=status.HTTP_201_CREATED)
def create_answer(
    post_id: int,
    payload: schemas.AnswerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.get(Post, post_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Post not found.")
    if p.post_type != "question":
        raise HTTPException(400, "Answers are only for questions.")

    a = Answer(post_id=post_id, post_type="question",
               author_id=user.id, body=payload.body)
    db.add(a)
    db.commit()
    db.refresh(a)

    return {
        "id": a.id, "post_id": a.post_id, "author": _author(user),
        "body": a.body, "score": a.score, "is_accepted": a.is_accepted,
        "created_at": a.created_at, "updated_at": a.updated_at,
        "comments": [],
    }


# ── Comments ────────────────────────────────────────────────────────────

@router.post("/posts/{post_id}/comments", response_model=schemas.CommentOut,
             status_code=status.HTTP_201_CREATED)
def comment_post(
    post_id: int,
    payload: schemas.CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if db.get(Post, post_id) is None:
        raise HTTPException(404, "Post not found.")
    c = Comment(post_id=post_id, author_id=user.id,
                body=payload.body, parent_comment_id=payload.parent_comment_id)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {
        "id": c.id, "post_id": c.post_id, "answer_id": c.answer_id,
        "parent_comment_id": c.parent_comment_id,
        "author": _author(user), "body": c.body, "score": c.score,
        "created_at": c.created_at,
    }


@router.post("/answers/{answer_id}/comments", response_model=schemas.CommentOut,
             status_code=status.HTTP_201_CREATED)
def comment_answer(
    answer_id: int,
    payload: schemas.CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    a = db.get(Answer, answer_id)
    if a is None or a.deleted_at is not None:
        raise HTTPException(404, "Answer not found.")
    c = Comment(answer_id=answer_id, author_id=user.id,
                body=payload.body, parent_comment_id=payload.parent_comment_id)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {
        "id": c.id, "post_id": c.post_id, "answer_id": c.answer_id,
        "parent_comment_id": c.parent_comment_id,
        "author": _author(user), "body": c.body, "score": c.score,
        "created_at": c.created_at,
    }


# ── Votes ───────────────────────────────────────────────────────────────

@router.post("/votes", status_code=status.HTTP_204_NO_CONTENT)
def vote(
    payload: schemas.VoteIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.value not in (-1, 1):
        raise HTTPException(400, "value must be 1 or -1.")

    # Verify target exists (and isn't soft-deleted) before recording the vote.
    if payload.target_type == "post":
        row = db.get(Post, payload.target_id)
    elif payload.target_type == "answer":
        row = db.get(Answer, payload.target_id)
    elif payload.target_type == "comment":
        row = db.get(Comment, payload.target_id)
    else:
        raise HTTPException(400, "Invalid target_type.")

    if row is None or getattr(row, "deleted_at", None) is not None:
        raise HTTPException(
            404, f"{payload.target_type.capitalize()} not found."
        )

    # Block self-voting.
    if getattr(row, "author_id", None) == user.id:
        raise HTTPException(400, "You cannot vote on your own content.")

    existing = db.scalar(
        select(Vote).where(
            Vote.user_id == user.id,
            Vote.target_type == payload.target_type,
            Vote.target_id == payload.target_id,
        )
    )
    if existing is None:
        db.add(Vote(user_id=user.id,
                    target_type=payload.target_type,
                    target_id=payload.target_id,
                    value=payload.value))
    elif existing.value == payload.value:
        db.delete(existing)   # toggle off
    else:
        existing.value = payload.value
    db.commit()
    return None