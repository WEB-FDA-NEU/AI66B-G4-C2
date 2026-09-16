import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import Depends

from database import Base, engine, get_db
from models import Item
from routers import auth, items

Base.metadata.create_all(engine)   # Mốc 3 dùng tạm. Dự án thật dùng Alembic migration.

app = FastAPI(
    title="TÊN-SẢN-PHẨM API",
    version="1.0.0",
    description="TODO: mô tả sản phẩm. Tài liệu tự sinh tại /docs.",
)

# CORS chỉ cần khi frontend chạy ở cổng khác (lúc phát triển: Live Server 5500).
# Khi deploy, FastAPI serve luôn frontend nên cùng origin, không cần CORS.
origins = os.getenv("CORS_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(items.router)
app.include_router(items.me_router)
# TODO: thêm router của các thành viên khác ở đây


@app.get("/api/health", tags=["ops"])
def health():
    return {"status": "ok"}


# ---- Serve frontend (Mốc 4) --------------------------------------------
# Đặt CUỐI CÙNG, sau tất cả router API. Nếu mount ở trên thì "/" nuốt hết
# và mọi request /api/... sẽ ra 404.
UPLOADS = Path(__file__).resolve().parent / "uploads"
UPLOADS.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
