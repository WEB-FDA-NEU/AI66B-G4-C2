"""
Bảng trong database.

TODO: đổi `Item` thành thực thể chính của đề tài:
  Listing (chợ đồ cũ) · Concert (bán vé) · Homestay · Pitch (sân bóng)
  Recipe (công thức) · Post (diễn đàn) · Prediction (dự đoán ML)

Cả nhóm ngồi cùng làm file này ở TUẦN 6, trước khi ai viết router.
Mọi router đều import từ đây.
"""
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id:            Mapped[int] = mapped_column(primary_key=True)
    # unique=True là thứ THẬT SỰ chặn email trùng khi 2 request đến cùng lúc.
    email:         Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name:  Mapped[str] = mapped_column(String(80))
    phone:         Mapped[str] = mapped_column(String(20), default="")
    role:          Mapped[str] = mapped_column(String(20), default="user")   # user | admin
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    items: Mapped[list["Item"]] = relationship(back_populates="owner")


class Item(Base):
    """TODO: đổi tên class, tên bảng và các cột theo đề tài."""
    __tablename__ = "items"
    id:          Mapped[int]  = mapped_column(primary_key=True)
    title:       Mapped[str]  = mapped_column(String(160), index=True)
    description: Mapped[str]  = mapped_column(Text, default="")
    price:       Mapped[int]  = mapped_column(Integer, default=0)
    cover_url:   Mapped[str]  = mapped_column(String(255), default="img/placeholder.svg")

    # TODO: liệt kê ĐÚNG các trạng thái trong state machine ở Section 3 của Mốc 1
    status:      Mapped[str]  = mapped_column(String(20), default="active", index=True)

    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    owner_id:    Mapped[int]  = mapped_column(ForeignKey("users.id"))

    owner: Mapped["User"] = relationship(back_populates="items")

    # ─────────────────────────────────────────────────────────────────
    #  TODO — NHÓM NÀO CÓ "TÀI NGUYÊN TRANH CHẤP" THÌ ĐỌC KỸ:
    #  ghế · phòng · khung giờ · tồn kho · slot duy nhất
    #
    #  Ràng buộc chống trùng PHẢI đặt ở database, không phải câu if trong Python:
    #
    #     __table_args__ = (
    #         UniqueConstraint("concert_id", "seat_no", name="uq_seat"),
    #     )
    #
    #  Vì `if SELECT ... then INSERT` vẫn lọt khi hai request đến cùng một lúc.
    #  Xem docs/QUY-UOC-CODE.md mục 6.
    # ─────────────────────────────────────────────────────────────────
