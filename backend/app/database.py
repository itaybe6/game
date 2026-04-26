import os
from contextlib import contextmanager
from typing import Generator

import psycopg2
from psycopg2.extras import RealDictCursor


def _connection_params() -> dict:
    return {
        "host": os.environ["POSTGRES_HOST"],
        "port": int(os.environ.get("POSTGRES_PORT", "5432")),
        "dbname": os.environ["POSTGRES_DB"],
        "user": os.environ["POSTGRES_USER"],
        "password": os.environ["POSTGRES_PASSWORD"],
    }


def init_db() -> None:
    ddl = """
    CREATE TABLE IF NOT EXISTS space_scores (
        id SERIAL PRIMARY KEY,
        player_name VARCHAR(100) NOT NULL,
        score INT NOT NULL,
        kills INT NOT NULL DEFAULT 0,
        wave_reached INT NOT NULL DEFAULT 1,
        duration_seconds DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """
    with psycopg2.connect(**_connection_params()) as conn:
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()


@contextmanager
def get_cursor() -> Generator[psycopg2.extensions.cursor, None, None]:
    conn = psycopg2.connect(**_connection_params())
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
