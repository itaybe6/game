import os
from typing import Any, Optional

import httpx

BASE = os.environ.get("SPACE_API_URL", "http://127.0.0.1:8000").rstrip("/")


def fetch_scores(limit: int = 10) -> Optional[list[dict[str, Any]]]:
    try:
        r = httpx.get(f"{BASE}/scores", params={"limit": limit}, timeout=4.0)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def submit_score(payload: dict) -> bool:
    try:
        r = httpx.post(f"{BASE}/scores", json=payload, timeout=6.0)
        r.raise_for_status()
        return True
    except Exception:
        return False


def ping() -> bool:
    try:
        r = httpx.get(f"{BASE}/health", timeout=2.0)
        return r.status_code == 200
    except Exception:
        return False
