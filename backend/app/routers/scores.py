from typing import List

from fastapi import APIRouter, status

from app.schemas.scores import ScoreCreate, ScoreRead
from app.services import scores as scores_service

router = APIRouter(tags=["scores"])


@router.post("/scores", response_model=ScoreRead, status_code=status.HTTP_201_CREATED)
def create_score(payload: ScoreCreate) -> ScoreRead:
    return scores_service.create_score(payload)


@router.get("/scores", response_model=List[ScoreRead])
def list_scores(limit: int = 30) -> List[ScoreRead]:
    return scores_service.list_scores(limit)
