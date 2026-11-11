import sys
from pathlib import Path

# Lấy đường dẫn tuyệt đối tới thư mục backend
backend_dir = Path(__file__).resolve().parent / "backend"

# Thêm thư mục backend vào PYTHONPATH để pytest có thể import main, db, models...
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))