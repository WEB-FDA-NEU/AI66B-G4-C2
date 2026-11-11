import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from main import app
from db import get_db
from db.engine import DATABASE_URL
from models import User
from security import hash_password

test_engine = create_engine(
    DATABASE_URL, 
    poolclass=StaticPool,
    connect_args={"options": "-c timezone=utc"} 
)

@pytest.fixture(scope="function")
def db_session():
    """Mở transaction trên Postgres, rollback sau khi xong."""
    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="function")
def client(db_session):
    """Ghi đè get_db để FastAPI dùng chung session test."""
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def user1_client(client):
    res = client.post("/api/auth/register", json={
        "email": "user1@test.com", "username": "user1", "password": "password123", "display_name": "User One"
    })
    assert res.status_code == 201, f"Register failed: {res.text}"
    return client

# Thêm `client` vào tham số để kích hoạt override trước khi tạo client mới
@pytest.fixture(scope="function")
def user2_client(client):
    with TestClient(app) as c2:
        res = c2.post("/api/auth/register", json={
            "email": "user2@test.com", "username": "user2", "password": "password123", "display_name": "User Two"
        })
        assert res.status_code == 201, f"Register failed: {res.text}"
        yield c2

# Thêm `client` vào tham số để kích hoạt override
@pytest.fixture(scope="function")
def admin_client(client, db_session):
    admin = User(
        email="admin@test.com", username="admin", 
        password_hash=hash_password("admin123"), 
        display_name="Admin", role="admin"
    )
    db_session.add(admin)
    db_session.flush()
    
    with TestClient(app) as c3:
        res = c3.post("/api/auth/login", json={"email": "admin@test.com", "password": "admin123"})
        assert res.status_code == 200
        yield c3

# ── CÁC BÀI TEST API ──

def test_login_wrong_password(client):
    res = client.post("/api/auth/login", json={"email": "user1@test.com", "password": "wrongpassword"})
    assert res.status_code == 401

def test_get_me(user1_client):
    res = user1_client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["username"] == "user1"

def test_create_post_too_short(user1_client):
    res = user1_client.post("/api/posts", json={
        "post_type": "question", "title": "Short body", "body": "Too short", "tags": ["test"]
    })
    assert res.status_code == 422

def test_update_post_not_owner(user1_client, user2_client):
    res = user1_client.post("/api/posts", json={
        "post_type": "question", "title": "User 1 Post", "body": "This is a valid body for testing.", "tags": []
    })
    post_id = res.json()["id"]

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

def test_accept_answer_permissions(user1_client, user2_client):
    res_q = user1_client.post("/api/posts", json={
        "post_type": "question", "title": "Question?", "body": "Need help with this problem.", "tags": []
    })
    q_id = res_q.json()["id"]
    
    res_a = user2_client.post(f"/api/posts/{q_id}/answers", json={"body": "Here is the answer."})
    ans_id = res_a.json()["id"]
    
    res_accept2 = user2_client.post(f"/api/posts/{q_id}/accept-answer", json={"answer_id": ans_id})
    assert res_accept2.status_code == 403
    
    res_accept1 = user1_client.post(f"/api/posts/{q_id}/accept-answer", json={"answer_id": ans_id})
    assert res_accept1.status_code == 200
    assert res_accept1.json()["is_answered"] is True

def test_vote_other_user_post(user1_client, user2_client):
    res_q = user1_client.post("/api/posts", json={
        "post_type": "question", "title": "Vote for me", "body": "This body is long enough.", "tags": []
    })
    q_id = res_q.json()["id"]

    res_vote = user2_client.post("/api/votes", json={"target_type": "post", "target_id": q_id, "value": 1})
    assert res_vote.status_code == 204

    res_get_user2 = user2_client.get(f"/api/posts/{q_id}")
    assert res_get_user2.json()["my_vote"] == 1
    
    res_get_user1 = user1_client.get(f"/api/posts/{q_id}")
    assert res_get_user1.json()["my_vote"] is None

def test_report_duplicate_fails(user1_client, user2_client):
    res_q = user1_client.post("/api/posts", json={
        "post_type": "question", "title": "Spam post", "body": "This is a spam post, please report it twice.", "tags": []
    })
    q_id = res_q.json()["id"]

    payload = {"target_type": "post", "target_id": q_id, "reason": "spam", "details": ""}

    res1 = user2_client.post("/api/reports", json=payload)
    assert res1.status_code == 201

    res2 = user2_client.post("/api/reports", json=payload)
    assert res2.status_code == 409

def test_admin_routes_blocked_for_regular_user(user1_client):
    res = user1_client.get("/api/admin/users")
    assert res.status_code == 403

def test_admin_suspend_user(admin_client, user2_client):
    res_user2 = user2_client.get("/api/auth/me")
    user2_id = res_user2.json()["id"]

    res_suspend = admin_client.patch(f"/api/admin/users/{user2_id}", json={"action": "suspend", "days": 5})
    assert res_suspend.status_code == 200

    res_login = user2_client.post("/api/auth/login", json={"email": "user2@test.com", "password": "password123"})
    assert res_login.status_code == 403