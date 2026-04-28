from typing import List

from app.database import get_cursor
from app.schemas.scores import ScoreCreate, ScoreRead


def create_score(payload: ScoreCreate) -> ScoreRead:
    sql = """
    INSERT INTO space_scores (player_name, score, kills, wave_reached, duration_seconds)
    VALUES (%s, %s, %s, %s, %s)
    RETURNING id, player_name, score, kills, wave_reached, duration_seconds, created_at;
    """
    with get_cursor() as cur:
        cur.execute(
            sql,
            (
                payload.player_name.strip(),
                payload.score,
                payload.kills,
                payload.wave_reached,
                payload.duration_seconds,
            ),
        )
        row = cur.fetchone()
    return ScoreRead(**row)


def list_scores(limit: int = 30) -> List[ScoreRead]:
    cap = min(max(limit, 1), 100)
    sql = """
    SELECT id, player_name, score, kills, wave_reached, duration_seconds, created_at
    FROM space_scores
    ORDER BY score DESC, kills DESC, wave_reached DESC, duration_seconds ASC, created_at ASC
    LIMIT %s;
    """
    with get_cursor() as cur:
        cur.execute(sql, (cap,))
        rows = cur.fetchall()
    return [ScoreRead(**r) for r in rows]
