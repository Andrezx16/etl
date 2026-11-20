import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
DATA = Path(os.getenv("MERCURY_DATA_DIR") or (ROOT / ".mercury")).resolve()
DATA.mkdir(parents=True, exist_ok=True)
SQLSERVER = os.getenv("SQLSERVER_CONNECTION", "")
SSAS_URL = os.getenv("MERCURY_SSAS_URL", "http://127.0.0.1:5000")
SECRET = os.getenv("MERCURY_SERVICE_KEY", "")
MAX_BYTES = 40 * 1024 * 1024
MAX_ROWS = 150_000
