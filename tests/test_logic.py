"""
Unit tests for Tech4Rum core logic (Non-API).
Bao gồm:
- Thuật toán so khớp văn bản (Dedupe Engine)
- Bảo mật, băm mật khẩu (Bcrypt) và JWT
"""
import pytest
from dedupe import build_query, SimilarityEngine
from security import hash_password, verify_password, create_token, decode_token


# ==========================================
# 1. DEDUPE ENGINE TESTS (Thuật toán tìm trùng lặp)
# ==========================================

def test_dedupe_exact_match():
    """Kiểm tra 2 tiêu đề giống hệt nhau phải trả về điểm 1.0 (Duplicate)"""
    corpus = [
        {"id": 1, "title": "Reset my password", "body": "", "tags": [], "post_type": "question"}
    ]
    engine = SimilarityEngine(corpus)
    q = build_query("Reset my password", "", [], "question")
    
    cand = corpus[0]
    score = engine.score_pair(q, cand)
    
    assert score.score == 1.0
    assert score.label == "duplicate"


def test_dedupe_similar_match():
    """Kiểm tra 2 câu hỏi tương tự (thiếu/thừa 1 từ) phải có điểm cao (Duplicate/Probably)"""
    corpus = [
        {"id": 1, "title": "Reset my account password", "body": "", "tags": [], "post_type": "question"}
    ]
    engine = SimilarityEngine(corpus)
    # Câu query ngắn hơn nhưng cùng ý nghĩa
    q = build_query("Reset my password", "", [], "question")
    
    cand = corpus[0]
    score = engine.score_pair(q, cand)
    
    # Thuật toán Containment/Dice phải nhận diện được subset
    assert score.score >= 0.80
    assert score.label in ["duplicate", "probably_duplicate"]


def test_dedupe_unrelated():
    """Kiểm tra 2 câu hỏi không liên quan phải có điểm thấp (Không xếp hạng)"""
    corpus = [
        {"id": 1, "title": "How to install npm", "body": "", "tags": [], "post_type": "question"}
    ]
    engine = SimilarityEngine(corpus)
    q = build_query("How do I reset my account's password?", "", [], "question")
    
    cand = corpus[0]
    score = engine.score_pair(q, cand)
    
    assert score.score < 0.40
    assert score.label == ""


# ==========================================
# 2. SECURITY TESTS (Bảo mật & Mã hóa)
# ==========================================

def test_password_hashing():
    """Kiểm tra băm mật khẩu và xác thực thành công/thất bại"""
    raw_pwd = "mysecretpassword123"
    hashed = hash_password(raw_pwd)
    
    assert hashed != raw_pwd  # Phải được băm, không lưu plaintext
    assert verify_password(raw_pwd, hashed) is True
    assert verify_password("wrongpassword", hashed) is False


def test_vietnamese_password_truncation():
    """
    Kiểm tra mật khẩu tiếng Việt dài (vượt 72 bytes).
    Thuật toán Bcrypt giới hạn 72 bytes. Nếu không cắt, sẽ ném lỗi ValueError.
    """
    # Chuỗi này dài 28 ký tự, nhưng do có dấu (multi-byte) nên > 72 bytes
    pwd_vietnamese = "Mật_khẩu_rất_dài_và_có_dấu_" * 4
    
    # Nếu hàm _to_bytes hoạt động đúng, không có Exception nào bị ném ra
    hashed = hash_password(pwd_vietnamese)
    assert verify_password(pwd_vietnamese, hashed) is True


def test_jwt_token_generation():
    """Kiểm tra tạo và giải mã JWT (trả về đúng user_id)"""
    user_id = 42
    token = create_token(user_id)
    
    assert isinstance(token, str)
    assert len(token) > 20  # JWT token thường rất dài
    
    decoded_id = decode_token(token)
    assert decoded_id == user_id


def test_invalid_jwt_token():
    """Kiểm tra JWT giả mạo hoặc bị sửa đổi phải trả về None"""
    fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake_payload.fake_sig"
    
    decoded_id = decode_token(fake_token)
    assert decoded_id is None