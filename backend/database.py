import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# SQLite khi phát triển ở máy, Postgres khi deploy. Đổi bằng biến môi trường,
# không sửa code. Đây là lý do file .env tồn tại.
DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./dev.db"

# Neon/Heroku đưa chuỗi bắt đầu bằng "postgres://", SQLAlchemy 2.x cần "postgresql://".
# Thiếu 3 dòng này là deploy hỏng, và lỗi báo rất khó hiểu.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
