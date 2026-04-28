from fastapi.testclient import TestClient

from app.main import app


def test_list_scores_empty() -> None:
    with TestClient(app) as client:
        r = client.get("/scores")
    assert r.status_code == 200
    assert r.json() == []


def test_create_score_and_list() -> None:
    body = {
        "player_name": "Tester",
        "score": 100,
        "kills": 5,
        "wave_reached": 3,
        "duration_seconds": 42.5,
    }
    with TestClient(app) as client:
        created = client.post("/scores", json=body)
        listed = client.get("/scores?limit=10")
    assert created.status_code == 201
    data = created.json()
    assert data["player_name"] == "Tester"
    assert data["score"] == 100
    assert data["kills"] == 5
    assert data["wave_reached"] == 3
    assert data["duration_seconds"] == 42.5
    assert "id" in data
    assert "created_at" in data

    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["player_name"] == "Tester"
    assert rows[0]["score"] == 100


def test_list_scores_respects_limit_cap() -> None:
    with TestClient(app) as client:
        for i in range(3):
            client.post(
                "/scores",
                json={
                    "player_name": f"P{i}",
                    "score": i * 10,
                    "kills": 0,
                    "wave_reached": 1,
                    "duration_seconds": 1.0,
                },
            )
        r = client.get("/scores?limit=500")
    assert r.status_code == 200
    assert len(r.json()) <= 100
