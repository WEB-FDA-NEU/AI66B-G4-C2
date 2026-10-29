"""Pydantic shapes for the auth API."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]{3,30}$")
TAG_RE      = re.compile(r"^[a-z0-9][a-z0-9+.#-]*$")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:           int
    email:        EmailStr
    username:     str
    display_name: str
    bio:          str = ""
    website:      str = ""
    location:     str = ""
    reputation:   int = 0
    role:         str
    status:       str
    created_at:   datetime | None = None


class RegisterIn(BaseModel):
    email:        EmailStr
    username:     str = Field(min_length=3, max_length=30)
    password:     str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=2, max_length=80)

    @field_validator("username")
    @classmethod
    def _username_format(cls, v: str) -> str:
        if not USERNAME_RE.match(v):
            raise ValueError(
                "Username must be 3-30 characters: letters, digits, '_' or '-'."
            )
        return v


class LoginIn(BaseModel):
    email:    EmailStr
    password: str


class AuthorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:           int
    username:     str
    display_name: str
    reputation:   int


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:           int
    name:         str
    description:  str
    post_count:   int = 0


class PostCard(BaseModel):
    id:           int
    post_type:    Literal["question", "discussion"]
    title:        str
    body_excerpt: str
    author:       AuthorOut
    tags:         list[TagOut]
    score:        int
    answer_count: int
    reply_count:  int
    view_count:   int
    is_answered:  bool
    created_at:   datetime
    updated_at:   datetime


class PostPage(BaseModel):
    items:     list[PostCard]
    total:     int
    page:      int
    page_size: int


class CommentOut(BaseModel):
    id:                int
    post_id:           int | None
    answer_id:         int | None
    parent_comment_id: int | None
    author:            AuthorOut
    body:              str
    score:             int
    created_at:        datetime


class AnswerOut(BaseModel):
    id:          int
    post_id:     int
    author:      AuthorOut
    body:        str
    score:       int
    is_accepted: bool
    created_at:  datetime
    updated_at:  datetime
    comments:    list[CommentOut] = []


class PostDetail(PostCard):
    body:     str
    answers:  list[AnswerOut] = []
    comments: list[CommentOut] = []


def _validate_tag_list(v: list[str]) -> list[str]:
    """Strip, lowercase, dedupe, and validate each tag."""
    cleaned: list[str] = []
    for raw in v:
        t = raw.strip().lower()
        if not t:
            continue
        if len(t) > 35:
            raise ValueError(f"Tag '{raw}' is too long (max 35 chars).")
        if not TAG_RE.match(t):
            raise ValueError(f"Tag '{raw}' has invalid characters.")
        if t not in cleaned:
            cleaned.append(t)
    return cleaned


class PostCreate(BaseModel):
    post_type: Literal["question", "discussion"]
    title:     str = Field(min_length=5, max_length=150)
    body:      str = Field(min_length=10)
    tags:      list[str] = Field(default_factory=list, max_length=5)

    @field_validator("tags")
    @classmethod
    def _tags_format(cls, v: list[str]) -> list[str]:
        return _validate_tag_list(v)


class PostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=5, max_length=150)
    body:  str | None = Field(default=None, min_length=10)
    tags:  list[str] | None = None

    @field_validator("tags")
    @classmethod
    def _tags_format(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        return _validate_tag_list(v)


class AnswerCreate(BaseModel):
    body: str = Field(min_length=5)


class CommentCreate(BaseModel):
    body:              str = Field(min_length=1, max_length=800)
    parent_comment_id: int | None = None


class VoteIn(BaseModel):
    target_type: Literal["post", "answer", "comment"]
    target_id:   int
    value:       int  # 1 or -1


class UserCard(BaseModel):
    id:           int
    username:     str
    display_name: str
    reputation:   int
    bio:          str
    created_at:   datetime


class UserProfile(UserCard):
    role:          str
    website:       str
    location:      str
    post_count:    int = 0
    answer_count:  int = 0


class UserPage(BaseModel):
    items:     list[UserCard]
    total:     int
    page:      int
    page_size: int