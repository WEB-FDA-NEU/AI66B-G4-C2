"""Nạp dữ liệu mẫu.  Chạy:  python seed.py

BẮT BUỘC có. Trang trống thì không demo được, và không kiểm tra được empty state.
TODO: đổi dữ liệu mẫu theo đề tài.
"""
from database import Base, engine, SessionLocal
from models import User, Item
from security import hash_password

Base.metadata.create_all(engine)
db = SessionLocal()

if db.query(User).count() == 0:
    user  = User(email="user@example.com",  password_hash=hash_password("password123"),
                 display_name="Người dùng mẫu", phone="0912345678")
    admin = User(email="admin@example.com", password_hash=hash_password("password123"),
                 display_name="Quản trị", role="admin")
    db.add_all([user, admin])
    db.commit()

    for i in range(1, 6):
        db.add(Item(
            title=f"Bản ghi mẫu số {i}",
            description="Mô tả mẫu, đủ dài để vượt qua ràng buộc tối thiểu 20 ký tự.",
            price=100_000 * i,
            owner_id=user.id,
        ))
    db.commit()
    print("Đã nạp dữ liệu mẫu.  Đăng nhập: user@example.com / password123")
else:
    print("Database đã có dữ liệu, bỏ qua.")

db.close()
