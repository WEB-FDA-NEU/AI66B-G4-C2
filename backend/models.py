"""ORM models — matches the authoritative schema in `db/schema.sql`."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text, func, Boolean, ForeignKey, SmallInteger, text
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class User(Base):
    __tablename__ = "users"

    id:            Mapped[int]  = mapped_column(BigInteger, primary_key=True)
    email:         Mapped[str]  = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str]  = mapped_column(Text)
    username:      Mapped[str]  = mapped_column(String(30), unique=True, index=True)
    display_name:  Mapped[str]  = mapped_column(Text)
    bio:           Mapped[str]  = mapped_column(Text, default="")
    website:       Mapped[str]  = mapped_column(Text, default="")
    location:      Mapped[str]  = mapped_column(Text, default="")
    reputation:    Mapped[int]  = mapped_column(Integer, default=0)

    role:   Mapped[str] = mapped_column(
        PgEnum("user", "moderator", "admin", name="user_role", create_type=False),
        default="user",
    )
    status: Mapped[str] = mapped_column(
        PgEnum("active", "suspended", "banned", name="user_status", create_type=False),
        default="active",
    )
    suspended_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    

class Tag(Base):
    __tablename__ = "tags"
    id:          Mapped[int]  = mapped_column(BigInteger, primary_key=True)
    name:        Mapped[str]  = mapped_column(String(35), unique=True)
    description: Mapped[str]  = mapped_column(Text, default="")
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Post(Base):
    __tablename__ = "posts"
    id:                 Mapped[int]  = mapped_column(BigInteger, primary_key=True)
    post_type:          Mapped[str]  = mapped_column(
        PgEnum("question", "discussion", name="post_type", create_type=False)
    )
    title:              Mapped[str]  = mapped_column(Text)
    body:               Mapped[str]  = mapped_column(Text)
    author_id:          Mapped[int]  = mapped_column(BigInteger, ForeignKey("users.id"))
    view_count:         Mapped[int]  = mapped_column(Integer, default=0)
    score:              Mapped[int]  = mapped_column(Integer, default=0)
    answer_count:       Mapped[int]  = mapped_column(Integer, default=0)
    reply_count:        Mapped[int]  = mapped_column(Integer, default=0)
    accepted_answer_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    is_locked:          Mapped[bool] = mapped_column(Boolean, default=False)
    created_at:         Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:         Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at:         Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Answer(Base):
    __tablename__ = "answers"
    id:          Mapped[int] = mapped_column(BigInteger, primary_key=True)
    post_id:     Mapped[int] = mapped_column(BigInteger, ForeignKey("posts.id"))
    post_type:   Mapped[str] = mapped_column(
        PgEnum("question", "discussion", name="post_type", create_type=False),
        default="question",
    )
    author_id:   Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    body:        Mapped[str] = mapped_column(Text)
    is_accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    score:       Mapped[int]  = mapped_column(Integer, default=0)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Comment(Base):
    __tablename__ = "comments"
    id:                Mapped[int] = mapped_column(BigInteger, primary_key=True)
    post_id:           Mapped[int | None] = mapped_column(BigInteger, ForeignKey("posts.id"), nullable=True)
    answer_id:         Mapped[int | None] = mapped_column(BigInteger, ForeignKey("answers.id"), nullable=True)
    parent_comment_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("comments.id"), nullable=True)
    author_id:         Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    body:              Mapped[str] = mapped_column(Text)
    score:             Mapped[int] = mapped_column(Integer, default=0)
    created_at:        Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:        Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at:        Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PostTag(Base):
    __tablename__ = "post_tags"
    post_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("posts.id"), primary_key=True)
    tag_id:  Mapped[int] = mapped_column(BigInteger, ForeignKey("tags.id"),  primary_key=True)


class Vote(Base):
    __tablename__ = "votes"
    id:          Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id:     Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    target_type: Mapped[str] = mapped_column(
        PgEnum("post", "answer", "comment", name="vote_target", create_type=False)
    )
    target_id:   Mapped[int] = mapped_column(BigInteger)
    value:       Mapped[int] = mapped_column(SmallInteger)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())