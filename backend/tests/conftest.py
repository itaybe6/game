import os

import pytest


@pytest.fixture(scope="session", autouse=True)
def _session_db_ready() -> None:
    required = (
        "POSTGRES_HOST",
        "POSTGRES_DB",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
    )
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        pytest.skip(f"Missing database env vars: {', '.join(missing)}")
    from app.database import init_db

    init_db()


@pytest.fixture(autouse=True)
def truncate_scores() -> None:
    from app.database import get_cursor

    with get_cursor() as cur:
        cur.execute("TRUNCATE space_scores RESTART IDENTITY;")
    yield
