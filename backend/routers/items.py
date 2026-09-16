"""
Router cho thực thể chính.

TODO: đổi tên file, prefix và tên hàm theo đề tài
      (listings.py / concerts.py / homestays.py / recipes.py …)

Business rule của Mốc 1 nằm TRONG các hàm dưới đây, kèm comment chỉ rõ rule số mấy.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models import Item, User
import schemas

router = APIRouter(prefix="/api/items", tags=["items"])
me_router = APIRouter(prefix="/api/me", tags=["items"])


@router.get("", response_model=schemas.ItemPage)
def search_items(
    q: str = "",
    sort: str = "newest",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    stmt = select(Item).where(Item.status != "removed")
    if q:
        stmt = stmt.where(Item.title.ilike(f"%{q}%"))
    # TODO: thêm các bộ lọc của đề tài (giá, ngày, danh mục, trạng thái…)

    order = {"price_asc": Item.price.asc(), "price_desc": Item.price.desc()}.get(
        sort, Item.created_at.desc()
    )
    stmt = stmt.order_by(order)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{item_id}", response_model=schemas.ItemDetail)
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(Item, item_id)
    if item is None or item.status == "removed":
        raise HTTPException(404, "Không tìm thấy.")
    return item


@router.post("", response_model=schemas.ItemDetail, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: schemas.ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),   # bắt buộc đăng nhập
):
    # TODO: kiểm tra business rule trước khi ghi
    #       ví dụ BR "chặn trùng" → tìm bản ghi giống, nếu có thì raise HTTPException(409, ...)
    item = Item(**payload.model_dump(), owner_id=user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@me_router.get("/items", response_model=schemas.ItemPage)
def my_items(
    status_filter: str = Query("", alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Chỉ trả bản ghi của CHÍNH người đang đăng nhập.

    LƯU Ý BẢO MẬT: lọc bằng user.id lấy TỪ TOKEN, không bao giờ lấy từ query param.
    Nếu nhận owner_id từ query param thì ai cũng xem được dữ liệu của người khác —
    đây là lỗi phổ biến nhất trong đồ án sinh viên.
    """
    stmt = select(Item).where(Item.owner_id == user.id, Item.status != "removed")
    if status_filter:
        stmt = stmt.where(Item.status == status_filter)
    stmt = stmt.order_by(Item.created_at.desc())

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt).all()
    return {"items": items, "total": total, "page": 1, "page_size": total or 1}
