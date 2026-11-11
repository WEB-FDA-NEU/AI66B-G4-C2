"""
Database Integration Tests.
Kiểm thử các Triggers của PostgreSQL (tự động đếm, tự động cộng điểm).
"""
import pytest
import uuid
import datetime
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text

from db import engine
from models import User, Post, Answer, Vote, Comment
from security import hash_password

@pytest.fixture(scope="module", autouse=True)
def fix_and_check_db():
    """
    Tự động đồng bộ lại các Sequence (bộ đếm ID tự tăng) 
    để tránh lỗi "duplicate key" do dữ liệu seed gây ra.
    """
    if not inspect(engine).has_table("users"):
        pytest.skip("Database chưa được khởi tạo. Hãy chạy 'python manage.py init-db' trước.")
    
    # Đồng bộ lại toàn bộ sequence
    with engine.begin() as conn:
        tables = [
            "users", "posts", "answers", "comments", 
            "tags", "votes", "reports", "post_marks", "notifications"
        ]
        for table in tables:
            try:
                conn.execute(text(
                    f"SELECT setval('{table}_id_seq', (SELECT COALESCE(MAX(id), 1) FROM {table}))"
                ))
            except Exception:
                pass  # Bỏ qua nếu bảng chưa có sequence

@pytest.fixture(scope="function")
def db_session():
    """Tạo session kết nối DB. Tự động rollback sau khi test xong."""
    with Session(engine) as session:
        yield session
        session.rollback()

@pytest.fixture(scope="function")
def test_users(db_session):
    """Tạo 2 user tạm thời để test (tránh lỗi khóa ngoại)."""
    unique_id = uuid.uuid4().hex[:6]
    
    u1 = User(
        email=f"test1_{unique_id}@tech4rum.io", 
        username=f"test1_{unique_id}", 
        password_hash=hash_password("password123"), 
        display_name="Test User 1"
    )
    u2 = User(
        email=f"test2_{unique_id}@tech4rum.io", 
        username=f"test2_{unique_id}", 
        password_hash=hash_password("password123"), 
        display_name="Test User 2"
    )
    db_session.add(u1)
    db_session.add(u2)
    db_session.flush()
    return u1, u2


def test_answer_count_trigger(db_session, test_users):
    """Kiểm tra Trigger: Insert Answer -> posts.answer_count tự động tăng (+1)"""
    user1, user2 = test_users

    post = Post(post_type="question", title="Test trigger count", body="This is a sufficiently long test body for a question.", author_id=user1.id)
    db_session.add(post)
    db_session.flush()
    assert post.answer_count == 0

    ans = Answer(post_id=post.id, post_type="question", author_id=user2.id, body="Test answer")
    db_session.add(ans)
    db_session.flush()
    
    db_session.refresh(post)
    assert post.answer_count == 1

    # Soft delete
    ans.deleted_at = datetime.datetime.now(datetime.timezone.utc)
    db_session.flush()
    
    db_session.refresh(post)
    assert post.answer_count == 0


def test_vote_score_trigger(db_session, test_users):
    """Kiểm tra Trigger: Insert Vote -> posts.score tự động thay đổi."""
    user1, user2 = test_users

    post = Post(post_type="question", title="Test trigger score", body="This is a sufficiently long test body for a question.", author_id=user1.id)
    db_session.add(post)
    db_session.flush()
    assert post.score == 0

    vote = Vote(user_id=user2.id, target_type="post", target_id=post.id, value=1)
    db_session.add(vote)
    db_session.flush()
    
    db_session.refresh(post)
    assert post.score == 1

    db_session.delete(vote)
    db_session.flush()
    
    db_session.refresh(post)
    assert post.score == 0


def test_comment_reply_count_trigger(db_session, test_users):
    """Kiểm tra Trigger: Discussion tăng reply_count khi có comment."""
    user1, user2 = test_users

    disc = Post(post_type="discussion", title="Test reply count", body="This is a sufficiently long test body for a discussion.", author_id=user1.id)
    db_session.add(disc)
    db_session.flush()
    assert disc.reply_count == 0

    cmt = Comment(post_id=disc.id, author_id=user2.id, body="Test reply")
    db_session.add(cmt)
    db_session.flush()
    
    db_session.refresh(disc)
    assert disc.reply_count == 1