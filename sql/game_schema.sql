-- טבלת תוצאות למשחק החלליות (נוצרת גם אוטומטית בהפעלת השרת)

CREATE TABLE IF NOT EXISTS space_scores (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(100) NOT NULL,
    score INT NOT NULL,
    kills INT NOT NULL DEFAULT 0,
    wave_reached INT NOT NULL DEFAULT 1,
    duration_seconds DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
