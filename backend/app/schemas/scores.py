from datetime import datetime

from pydantic import BaseModel, Field


class ScoreCreate(BaseModel):
    player_name: str = Field(default="אנונימי", min_length=1, max_length=100)
    score: int = Field(..., ge=0)
    kills: int = Field(..., ge=0)
    wave_reached: int = Field(..., ge=1)
    duration_seconds: float = Field(..., ge=0)


class ScoreRead(BaseModel):
    id: int
    player_name: str
    score: int
    kills: int
    wave_reached: int
    duration_seconds: float
    created_at: datetime

    model_config = {"from_attributes": True}
