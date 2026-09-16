from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models import User
from security import hash_password, verify_password, create_token
import schemas

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/auth/register", response_model=schemas.TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.RegisterIn, db: Session = Depends(get_db)):
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        phone=payload.phone,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Ràng buộc UNIQUE ở database mới là thứ chặn thật.
        # Kiểm tra bằng SELECT trước rồi INSERT sau vẫn lọt khi 2 request đến cùng lúc.
        db.rollback()
        raise HTTPException(409, "Email này đã được đăng ký.")
    db.refresh(user)
    return {"access_token": create_token(user.id), "user": user}


@router.post("/auth/login", response_model=schemas.TokenOut)
def login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        # Cùng một thông điệp cho cả hai trường hợp — không tiết lộ email nào tồn tại.
        raise HTTPException(401, "Email hoặc mật khẩu không đúng.")
    return {"access_token": create_token(user.id), "user": user}


@router.get("/me", response_model=schemas.UserOut)
def me(user: User = Depends(get_current_user)):
    return user
