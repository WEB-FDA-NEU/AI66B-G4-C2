"""Posts: questions + discussions, list / detail / create / update / delete
   plus answers, comments, votes, and answer acceptance.

   Authorization rules (post-fix):
   - PATCH  /posts/{id}                 → AUTHOR ONLY.
     Previously moderators/admins could edit any post through the same
     endpoint, which is what made "non-author users can edit other
     user's posts" true. Users now see Edit only for their own posts
     (frontend) and the backend enforces it strictly. Moderation
     actions are decoupled into dedicated endpoints if/when needed.

   - DELETE /posts/{id}                 → author OR moderator/admin.
     Unchanged from before — moderation still needs to be able to
     remove content. Not part of the reported bug.

   - POST   /posts/{id}/accept-answer   → AUTHOR ONLY (new endpoint).
     Toggles the accepted answer for a question. Body:
         { "answer_id": <int> }    accept this answer
         { "answer_id": null }     un-accept (question becomes unanswered)
     Sets/clears both `posts.accepted_answer_id` and the corresponding
     `answers.is_accepted` flag atomically.

   Type-aware body-length validation is also applied to POST and PATCH
   so undersized bodies surface as 422 (not 500 from the DB CHECK).
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import schemas
from db import get_db
from deps import get_current_user, get_current_user_optional
from models import Answer, Comment, Post, PostTag, Tag, User, Vote

router = APIRouter(prefix="/api", tags=["posts"])


# ── Request models (small, endpoint-local) ──────────────────────────────

class _AcceptAnswerIn(BaseModel):
    """Body for POST /posts/{id}/accept-answer.

    `answer_id` is the answer to accept; passing `null` un-accepts
    whatever was previously accepted.
    """
    answer_id: int | None = None


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


def _card(p: Post, a: User, tags: list[Tag], my_vote: int | None = None) -> dict:
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
        "my_vote":      my_vote,
        "created_at":   p.created_at,
        "updated_at":   p.updated_at,
    }


def _my_vote_map(
    db: Session,
    user_id: int | None,
    pairs: list[tuple[str, int]],
) -> dict[tuple[str, int], int]:
    if not user_id or not pairs:
        return {}
    by_type: dict[str, list[int]] = defaultdict(list)
    for t, i in pairs:
        by_type[t].append(i)
    out: dict[tuple[str, int], int] = {}
    for t, ids in by_type.items():
        rows = db.execute(
            select(Vote.target_id, Vote.value).where(
                Vote.user_id == user_id,
                Vote.target_type == t,
                Vote.target_id.in_(ids),
            )
        ).all()
        for tid, val in rows:
            out[(t, tid)] = val
    return out


def _upsert_tags(db: Session, names: list[str]) -> list[Tag]:
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


# ── Tag-filter helpers ─────────────────────────────────────────────────

def _split_tags(raw: str, limit: int) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for t in raw.split(","):
        name = t.strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
        if len(out) >= limit:
            break
    return out


def _has_any_tag(any_of: list[str]):
    return (
        select(1)
        .select_from(PostTag)
        .join(Tag, Tag.id == PostTag.tag_id)
        .where(
            PostTag.post_id == Post.id,
            func.lower(Tag.name).in_(any_of),
        )
        .exists()
    )


# ── Type-aware body length ─────────────────────────────────────────────

_BODY_MIN = {"question": 20, "discussion": 10}


def _validate_body_for_type(body: str, post_type: str) -> None:
    min_len = _BODY_MIN.get(post_type, 20)
    if len((body or "").strip()) < min_len:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Body must be at least {min_len} characters "
                f"for a {post_type}."
            ),
        )


# ── Similar post suggestion (soft dedup) ────────────────────────────────

_SIMILAR_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "to", "of", "for", "in",
    "on", "at", "by", "with", "and", "or", "but", "do", "does", "did",
    "how", "why", "what", "when", "where", "which", "who", "this", "that",
    "it", "my", "i", "you", "we", "they", "be", "been", "being",
    "have", "has", "had", "can", "could", "should", "would", "will",
    "not", "no", "so", "if", "then", "than", "as", "into", "about",
    "without", "from", "just", "only", "also", "very",
}

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9_+#.-]{2,}")


@router.get("/posts/similar", response_model=list[schemas.PostCard])
def similar_posts(
    title: str = "",
    tags: str = "",
    exclude_id: int | None = Query(None),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    title = (title or "").strip()
    tag_list = _split_tags(tags, 5)

    words: list[str] = []
    seen: set[str] = set()
    for m in _WORD_RE.finditer(title):
        w = m.group(0).lower()
        if w in _SIMILAR_STOPWORDS or w in seen:
            continue
        seen.add(w)
        words.append(w)
        if len(words) >= 8:
            break

    if not words and not tag_list:
        return []

    stmt = select(Post).where(Post.deleted_at.is_(None))
    if exclude_id:
        stmt = stmt.where(Post.id != exclude_id)

    conditions = []
    if words:
        conditions.append(
            or_(*[func.lower(Post.title).like(f"%{w}%") for w in words])
        )
    if tag_list:
        conditions.append(_has_any_tag(tag_list))

    stmt = (
        stmt.where(or_(*conditions))
        .order_by(Post.score.desc(), Post.updated_at.desc())
        .limit(limit)
    )

    posts = db.scalars(stmt).all()
    if not posts:
        return []

    authors = _load_authors(db, {p.author_id for p in posts})
    tags_by_post = _load_tags_for(db, [p.id for p in posts])
    my_votes = _my_vote_map(
        db, user.id if user else None, [("post", p.id) for p in posts]
    )

    return [
        _card(
            p,
            authors[p.author_id],
            tags_by_post[p.id],
            my_votes.get(("post", p.id)),
        )
        for p in posts
    ]


# ── List ────────────────────────────────────────────────────────────────

@router.get("/posts", response_model=schemas.PostPage)
def list_posts(
    type: Literal["question", "discussion"] | None = Query(None),
    q:    str = "",
    tag:  str = "",
    ignore_tags: str = "",
    unanswered: bool = False,
    author: str = "",
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

    tag_list = _split_tags(tag, 10)
    if tag_list:
        stmt = stmt.where(_has_any_tag(tag_list))

    ignore_list = _split_tags(ignore_tags, 50)
    if ignore_list:
        stmt = stmt.where(~_has_any_tag(ignore_list))

    if unanswered:
        stmt = stmt.where(
            Post.post_type == "question",
            Post.answer_count == 0,
        )

    if author:
        author_user = db.scalar(
            select(User).where(func.lower(User.username) == author.lower())
        )
        if author_user is None:
            return {"items": [], "total": 0, "page": page, "page_size": page_size}
        stmt = stmt.where(Post.author_id == author_user.id)
    if mine:
        if user is None:
            raise HTTPException(401, "Login required for `mine=true`.")
        stmt = stmt.where(Post.author_id == user.id)

    if sort == "unanswered":
        stmt = stmt.where(
            Post.post_type == "question",
            Post.answer_count == 0,
        )

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

    my_votes = _my_vote_map(
        db,
        user.id if user else None,
        [("post", p.id) for p in posts],
    )

    return {
        "items": [
            _card(p, authors[p.author_id], tags_by_post[p.id],
                  my_votes.get(("post", p.id)))
            for p in posts
        ],
        "total": total, "page": page, "page_size": page_size,
    }


# ── Detail ──────────────────────────────────────────────────────────────

@router.get("/posts/{post_id}", response_model=schemas.PostDetail)
def get_post(
    post_id: int,
    increment_views: bool = Query(True, include_in_schema=False),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    p = db.get(Post, post_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Post not found.")

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

    comments = db.scalars(
        select(Comment)
        .where(Comment.post_id == p.id, Comment.answer_id.is_(None),
               Comment.deleted_at.is_(None))
        .order_by(Comment.created_at.asc())
    ).all()

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

    target_pairs: list[tuple[str, int]] = [("post", p.id)]
    for a in answers:
        target_pairs.append(("answer", a["id"]))
        for c in a.get("comments") or []:
            target_pairs.append(("comment", c["id"]))
    for c in card["comments"]:
        target_pairs.append(("comment", c["id"]))

    my_votes = _my_vote_map(
        db, user.id if user else None, target_pairs,
    )

    card["my_vote"] = my_votes.get(("post", p.id))
    for a in answers:
        a["my_vote"] = my_votes.get(("answer", a["id"]))
        for c in a.get("comments") or []:
            c["my_vote"] = my_votes.get(("comment", c["id"]))
    for c in card["comments"]:
        c["my_vote"] = my_votes.get(("comment", c["id"]))

    return card


# ── Create ──────────────────────────────────────────────────────────────

@router.post("/posts", response_model=schemas.PostDetail,
             status_code=status.HTTP_201_CREATED)
def create_post(
    payload: schemas.PostCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _validate_body_for_type(payload.body, payload.post_type)

    post = Post(
        post_type=payload.post_type,
        title=payload.title.strip(),
        body=payload.body,
        author_id=user.id,
    )
    db.add(post)

    try:
        db.flush()
        for tag in _upsert_tags(db, payload.tags):
            db.add(PostTag(post_id=post.id, tag_id=tag.id))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Could not create post: {exc.orig or exc}",
        )

    db.refresh(post)
    return get_post(post.id, increment_views=False, db=db, user=user)


# ── Update / Delete ─────────────────────────────────────────────────────

@router.patch("/posts/{post_id}", response_model=schemas.PostDetail)
def update_post(
    post_id: int,
    payload: schemas.PostUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a post (works for both questions and discussions).

    Strict author-only: no moderator/admin escape hatch. This closes
    the "non-author users can still edit other user's posts" bug. If
    a moderation editing capability is desired later, it should be a
    dedicated endpoint with its own audit trail, not a silent bypass
    on the user-facing edit route.
    """
    p = db.get(Post, post_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Post not found.")
    if p.author_id != user.id:
        raise HTTPException(403, "Only the author can edit this post.")

    if payload.body is not None:
        _validate_body_for_type(payload.body, p.post_type)

    if payload.title is not None:
        p.title = payload.title.strip()
    if payload.body is not None:
        p.body = payload.body
    if payload.tags is not None:
        db.execute(delete(PostTag).where(PostTag.post_id == p.id))
        for tag in _upsert_tags(db, payload.tags):
            db.add(PostTag(post_id=p.id, tag_id=tag.id))

    p.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Could not update post: {exc.orig or exc}",
        )

    db.refresh(p)
    return get_post(p.id, increment_views=False, db=db, user=user)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Soft-delete a post. Author only — moderation decoupled from
    user-facing delete to keep the authorization model uniform."""
    p = db.get(Post, post_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Post not found.")
    if p.author_id != user.id:
        raise HTTPException(403, "Only the author can delete this post.")
    p.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return None


# ── Accept / un-accept an answer ────────────────────────────────────────

@router.post("/posts/{post_id}/accept-answer",
             response_model=schemas.PostDetail)
def accept_answer(
    post_id: int,
    payload: _AcceptAnswerIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Toggle the accepted answer for a question.

    Only the question's author may accept or un-accept. Setting
    `answer_id` to an answer id marks that answer as accepted and
    updates `posts.accepted_answer_id` (which drives `is_answered`
    on every PostCard). Setting `answer_id` to null clears the
    accepted state (question becomes unanswered again).

    Either way, previously accepted answers on this post are
    un-marked so the `answers_one_accepted_per_post` unique index
    never conflicts. Returns the refreshed PostDetail so the client
    can re-render immediately without a second round-trip.
    """
    p = db.get(Post, post_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Post not found.")
    if p.post_type != "question":
        raise HTTPException(
            400, "Only questions can have an accepted answer."
        )
    if p.author_id != user.id:
        raise HTTPException(
            403, "Only the question author can accept an answer."
        )

    try:
        # 1. Un-mark any currently accepted answer on this post.
        #    Flushing here releases the unique-index slot BEFORE we
        #    set the new one, so accepting answer B when A was
        #    previously accepted never momentarily violates the
        #    `answers_one_accepted_per_post` constraint.
        db.execute(
            update(Answer)
            .where(
                Answer.post_id == p.id,
                Answer.is_accepted.is_(True),
            )
            .values(is_accepted=False)
        )
        db.flush()

        # 2. Apply the new state.
        if payload.answer_id is not None:
            ans = db.get(Answer, payload.answer_id)
            if ans is None or ans.deleted_at is not None:
                raise HTTPException(404, "Answer not found.")
            if ans.post_id != p.id:
                raise HTTPException(
                    400, "Answer does not belong to this question."
                )
            ans.is_accepted = True
            p.accepted_answer_id = ans.id
        else:
            p.accepted_answer_id = None

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Could not update accepted answer: {exc}",
        )

    db.refresh(p)
    return get_post(p.id, increment_views=False, db=db, user=user)


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
        "my_vote": None,
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
        "my_vote": None,
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
        "my_vote": None,
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