import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, BigInteger
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.compiler import compiles

from main import app
from db import Base, get_db
from models import User
from security import hash_password

# ── Báo cho SQLite biết BigInteger là INTEGER tự tăng ──
@compiles(BigInteger, 'sqlite')
def compile_big_integer_sqlite(type_, compiler, **kw):
    return "INTEGER"

# ── Cấu hình Database cho Testing (SQLite in-memory) ──
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)

# ── CÁC FIXTURE XỬ LÝ COOKIE ──

@pytest.fixture(scope="module")
def user1_client(client):
    """Đăng ký User 1 và trả về một TestClient đã có sẵn cookie."""
    res = client.post("/api/auth/register", json={
        "email": "user1@test.com", "username": "user1", "password": "password123", "display_name": "User One"
    })
    assert res.status_code == 201, f"Register failed: {res.text}"
    # Lấy cookie trực tiếp từ client, không lấy từ response
    cookie_value = client.cookies.get("t4r_auth")
    assert cookie_value is not None, "Cookie t4r_auth was not set!"
    return client

@pytest.fixture(scope="module")
def user2_client():
    """Tạo một TestClient MỚI hoàn toàn để đăng ký User 2 (tránh dính cookie User 1)."""
    with TestClient(app) as c2:
        res = c2.post("/api/auth/register", json={
            "email": "user2@test.com", "username": "user2", "password": "password123", "display_name": "User Two"
        })
        assert res.status_code == 201, f"Register failed: {res.text}"
        yield c2

@pytest.fixture(scope="module")
def admin_client():
    """Tạo admin trong DB và đăng nhập."""
    db = TestingSessionLocal()
    admin = User(email="admin@test.com", username="admin", password_hash=hash_password("admin123"), display_name="Admin", role="admin")
    db.add(admin)
    db.commit()
    db.close()

    with TestClient(app) as c3:
        res = c3.post("/api/auth/login", json={"email": "admin@test.com", "password": "admin123"})
        assert res.status_code == 200
        yield c3

# ── CÁC BÀI TEST ──

def test_login_wrong_password(client):
    res = client.post("/api/auth/login", json={"email": "user1@test.com", "password": "wrongpassword"})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password."

def test_get_me(user1_client):
    # Vì user1_client đã có sẵn cookie, ta không cần truyền cookies=...
    res = user1_client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["username"] == "user1"

def test_create_post_too_short(user1_client):
    res = user1_client.post("/api/posts", json={
        "post_type": "question", "title": "Short body", "body": "Too short", "tags": ["test"]
    })
    assert res.status_code == 422

def test_update_post_not_owner(user1_client, user2_client):
    # User 1 tạo bài
    res = user1_client.post("/api/posts", json={
        "post_type": "question", "title": "User 1 Post", "body": "This is a valid body for testing.", "tags": []
    })
    post_id = res.json()["id"]

    # User 2 cố tình sửa bài của User 1
    res2 = user2_client.patch(f"/api/posts/{post_id}", json={"title": "Hacked Title"})
    assert res2.status_code == 403

def test_soft_delete_post(user1_client):
    res = user1_client.post("/api/posts", json={
        "post_type": "discussion", "title": "To be deleted", "body": "This discussion will be soft deleted.", "tags": []
    })
    post_id = res.json()["id"]

    user1_client.delete(f"/api/posts/{post_id}")
    res_get = user1_client.get(f"/api/posts/{post_id}")
    assert res_get.status_code == 404

def test_answer_on_discussion_fails(user1_client):
    res = user1_client.post("/api/posts", json={
        "post_type": "discussion", "title": "A discussion", "body": "No answers allowed here.", "tags": []
    })
    post_id = res.json()["id"]

    res_ans = user1_client.post(f"/api/posts/{post_id}/answers", json={"body": "My answer"})
    assert res_ans.status_code == 400
    assert res_ans.json()["detail"] == "Answers are only for questions."

def test_accept_answer_permissions(user1_client, user2_client):
    res_q = user1_client.post("/api/posts", json={
        "post_type": "question", "title": "Question?", "body": "Need help with this problem.", "tags": []
    })
    q_id = res_q.json()["id"]
    
    res_a = user2_client.post(f"/api/posts/{q_id}/answers", json={"body": "Here is the answer."})
    ans_id = res_a.json()["id"]
    
    # User 2 tự accept -> Bị chặn
    res_accept2 = user2_client.post(f"/api/posts/{q_id}/accept-answer", json={"answer_id": ans_id})
    assert res_accept2.status_code == 403
    
    # User 1 (chủ câu hỏi) accept -> Thành công
    res_accept1 = user1_client.post(f"/api/posts/{q_id}/accept-answer", json={"answer_id": ans_id})
    assert res_accept1.status_code == 200
    
    # Kiểm tra xem câu trả lời đã được đánh dấu is_accepted chưa
    data = res_accept1.json()
    assert data["is_answered"] is True
    
    # Tìm câu trả lời vừa được accept trong danh sách answers trả về
    accepted_answer = next((a for a in data["answers"] if a["id"] == ans_id), None)
    assert accepted_answer is not None
    assert accepted_answer["is_accepted"] is True

def test_vote_other_user_post(user1_client, user2_client):
    res_q = user1_client.post("/api/posts", json={
        "post_type": "question", "title": "Vote for me", "body": "This body is long enough.", "tags": []
    })
    q_id = res_q.json()["id"]

    # User 2 upvote
    res_vote = user2_client.post("/api/votes", json={"target_type": "post", "target_id": q_id, "value": 1})
    assert res_vote.status_code == 204

    # Kiểm tra my_vote của User 2 (phải là 1)
    res_get_user2 = user2_client.get(f"/api/posts/{q_id}")
    assert res_get_user2.json()["my_vote"] == 1
    
    # Kiểm tra my_vote của User 1 (phải là None vì chưa vote)
    res_get_user1 = user1_client.get(f"/api/posts/{q_id}")
    assert res_get_user1.json()["my_vote"] is None

def test_report_duplicate_fails(user1_client, user2_client):
    res_q = user1_client.post("/api/posts", json={
        "post_type": "question", 
        "title": "Spam post", 
        "body": "This is a spam post, please report it twice.", # <-- Đã sửa dài hơn 20 ký tự
        "tags": []
    })
    q_id = res_q.json()["id"]

    payload = {"target_type": "post", "target_id": q_id, "reason": "spam", "details": ""}

    # Lần 1: OK
    res1 = user2_client.post("/api/reports", json=payload)
    assert res1.status_code == 201

    # Lần 2: 409 Conflict
    res2 = user2_client.post("/api/reports", json=payload)
    assert res2.status_code == 409

def test_admin_routes_blocked_for_regular_user(user1_client):
    res = user1_client.get("/api/admin/users")
    assert res.status_code == 403

def test_admin_suspend_user(admin_client, user2_client):
    # Lấy ID của user2
    res_user2 = user2_client.get("/api/auth/me")
    user2_id = res_user2.json()["id"]

    # Admin suspend user2
    res_suspend = admin_client.patch(f"/api/admin/users/{user2_id}", json={"action": "suspend", "days": 5})
    assert res_suspend.status_code == 200

    # Thử login lại
    res_login = user2_client.post("/api/auth/login", json={"email": "user2@test.com", "password": "password123"})
    assert res_login.status_code == 403