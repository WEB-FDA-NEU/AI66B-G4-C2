"""Auth routes — register / login / logout / me / update-me / change-password."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import schemas
from db import get_db
from deps import get_current_user, get_current_user_optional
from models import User
from security import COOKIE_NAME, create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_MAX_AGE = int(os.getenv("JWT_EXPIRE_MINUTES", "60")) * 60
COOKIE_SECURE  = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")  # lax | strict | none


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME, value=token, max_age=COOKIE_MAX_AGE,
        httponly=True, secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE, path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


# ── Register ────────────────────────────────────────────────────────────

@router.post("/register", response_model=schemas.UserOut,
             status_code=status.HTTP_201_CREATED)
def register(payload: schemas.RegisterIn, response: Response,
             db: Session = Depends(get_db)):
    user = User(
        email=payload.email.lower(),
        username=payload.username.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raw = str(exc.orig or "").lower()
        if "email" in raw:
            raise HTTPException(409, "Email already registered.")
        if "username" in raw:
            raise HTTPException(409, "Username already taken.")
        raise HTTPException(409, "Could not create account.")
    db.refresh(user)
    _set_auth_cookie(response, create_token(user.id))
    return user


# ── Login ───────────────────────────────────────────────────────────────

@router.post("/login", response_model=schemas.UserOut)
def login(payload: schemas.LoginIn, response: Response,
          db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password.")
    if user.status == "banned":
        raise HTTPException(403, "This account has been banned.")
    if user.status == "suspended":
        until = user.suspended_until
        if until is not None and until > datetime.now(timezone.utc):
            raise HTTPException(403, f"This account is suspended until {until.isoformat()}.")
    _set_auth_cookie(response, create_token(user.id))
    return user


# ── Logout ──────────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    _clear_auth_cookie(response)
    return None


# ── Current user ────────────────────────────────────────────────────────

@router.get("/me", response_model=schemas.UserOut)
def me(user: User | None = Depends(get_current_user_optional)):
    if user is None:
        raise HTTPException(401, "Not logged in.")
    return user


# ── Update profile ──────────────────────────────────────────────────────

@router.patch("/me", response_model=schemas.UserOut)
def update_me(payload: schemas.MeUpdate,
              db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    if payload.username is not None:
        new_username = payload.username.strip().lower()
        if new_username != user.username:
            clash = db.scalar(
                select(User).where(
                    func.lower(User.username) == new_username,
                    User.id != user.id,
                )
            )
            if clash:
                raise HTTPException(409, "Username already taken.")
            user.username = new_username

    if payload.email is not None:
        new_email = payload.email.lower()
        if new_email != user.email:
            clash = db.scalar(
                select(User).where(
                    func.lower(User.email) == new_email,
                    User.id != user.id,
                )
            )
            if clash:
                raise HTTPException(409, "Email already registered.")
            user.email = new_email

    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.bio is not None:
        user.bio = payload.bio
    if payload.website is not None:
        user.website = payload.website
    if payload.location is not None:
        user.location = payload.location

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raw = str(exc.orig or "").lower()
        if "email" in raw:
            raise HTTPException(409, "Email already registered.")
        if "username" in raw:
            raise HTTPException(409, "Username already taken.")
        raise HTTPException(409, "Could not update profile.")

    db.refresh(user)
    return user


# ── Change password ─────────────────────────────────────────────────────

@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: schemas.ChangePasswordIn,
                    db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    if payload.current_password == payload.new_password:
        raise HTTPException(400, "New password must differ from the current one.")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return None