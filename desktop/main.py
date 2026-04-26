"""
משחק חלליות מקומי (Pygame) + שמירת תוצאות ב-FastAPI/PostgreSQL.
הרצה: מתוך תיקיית notes-api/desktop (לא מתוך notes-api בלבד) — python main.py
"""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import pygame
from pygame.math import Vector2

from bidi.algorithm import get_display

import api_client


def h(text: str) -> str:
    """Pygame לא מטפל ב־Unicode BIDI; ממיר מחרוזת לוגית לסדר תצוגה לעברית."""
    return get_display(text) if text else text

WIDTH, HEIGHT = 960, 640
FPS = 60

SPACE = (12, 18, 42)
STAR_LOW = (180, 200, 255)
SHIP_BODY = (255, 140, 190)
SHIP_ACCENT = (120, 220, 255)
HUD = (230, 240, 255)


@dataclass
class Star:
    pos: Vector2
    speed: float
    r: int

    def update(self, dt: float) -> None:
        self.pos.y += self.speed * dt * 60
        if self.pos.y > HEIGHT + 4:
            self.pos.y = random.uniform(-20, -4)
            self.pos.x = random.uniform(0, WIDTH)


@dataclass
class Bullet:
    pos: Vector2
    vel: Vector2 = field(default_factory=lambda: Vector2(0, -720))

    def update(self, dt: float) -> None:
        self.pos += self.vel * dt


@dataclass
class Alien:
    pos: Vector2
    phase: float
    color: Tuple[int, int, int]
    radius: int = 26

    def speed_y(self, wave: int) -> float:
        return 55 + wave * 10

    def update(self, dt: float, wave: int, t: float) -> None:
        self.pos.y += self.speed_y(wave) * dt
        self.pos.x += math.sin(t * 2.2 + self.phase) * 42 * dt
        self.pos.x = max(self.radius, min(WIDTH - self.radius, self.pos.x))


@dataclass
class Particle:
    pos: Vector2
    vel: Vector2
    life: float
    color: Tuple[int, int, int]
    r: int

    def update(self, dt: float) -> bool:
        self.pos += self.vel * dt
        self.life -= dt
        self.vel *= 0.985
        return self.life > 0


def make_stars(n: int = 110) -> List[Star]:
    stars: List[Star] = []
    for _ in range(n):
        stars.append(
            Star(
                pos=Vector2(random.uniform(0, WIDTH), random.uniform(0, HEIGHT)),
                speed=random.uniform(18, 110),
                r=random.randint(1, 2),
            )
        )
    return stars


def spawn_explosion(pos: Vector2, color: Tuple[int, int, int]) -> List[Particle]:
    parts: List[Particle] = []
    for _ in range(18):
        ang = random.uniform(0, math.tau)
        sp = random.uniform(90, 260)
        parts.append(
            Particle(
                pos=Vector2(pos),
                vel=Vector2(math.cos(ang), math.sin(ang)) * sp,
                life=random.uniform(0.35, 0.75),
                color=color,
                r=random.randint(3, 6),
            )
        )
    parts.extend(
        Particle(
            pos=Vector2(pos) + Vector2(random.uniform(-6, 6), random.uniform(-6, 6)),
            vel=Vector2(random.uniform(-40, 40), random.uniform(-120, -20)),
            life=random.uniform(0.55, 1.0),
            color=(255, 240, 200),
            r=2,
        )
        for _ in range(10)
    )
    return parts


def draw_ship(surf: pygame.Surface, pos: Vector2, tilt: float) -> None:
    p = (int(pos.x), int(pos.y))
    body = pygame.Surface((86, 52), pygame.SRCALPHA)
    pygame.draw.ellipse(body, SHIP_BODY, (0, 0, 86, 52))
    pygame.draw.ellipse(body, (255, 255, 255, 55), (18, 10, 36, 16))
    pygame.draw.polygon(body, SHIP_ACCENT, [(43, 0), (62, 34), (24, 34)])
    pygame.draw.rect(body, (90, 60, 120, 200), (10, 22, 18, 18), border_radius=6)
    pygame.draw.rect(body, (90, 60, 120, 200), (58, 22, 18, 18), border_radius=6)
    rotated = pygame.transform.rotozoom(body, tilt, 1.0)
    r = rotated.get_rect(center=p)
    surf.blit(rotated, r)


def draw_alien(surf: pygame.Surface, a: Alien) -> None:
    pygame.draw.circle(surf, a.color, a.pos.xy, a.radius)
    pygame.draw.circle(surf, (40, 20, 60), a.pos.xy, a.radius, width=3)
    eye_off = 8
    pygame.draw.circle(surf, (255, 255, 255), (int(a.pos.x - eye_off), int(a.pos.y - 2)), 7)
    pygame.draw.circle(surf, (255, 255, 255), (int(a.pos.x + eye_off), int(a.pos.y - 2)), 7)
    pygame.draw.circle(surf, (20, 20, 30), (int(a.pos.x - eye_off + 2), int(a.pos.y)), 3)
    pygame.draw.circle(surf, (20, 20, 30), (int(a.pos.x + eye_off + 2), int(a.pos.y)), 3)
    smile_r = int(a.radius * 0.55)
    rect = pygame.Rect(0, 0, smile_r * 2, smile_r)
    rect.center = (int(a.pos.x), int(a.pos.y) + 6)
    pygame.draw.arc(surf, (40, 20, 60), rect, math.radians(200), math.radians(340), width=3)


def draw_bullets(surf: pygame.Surface, bullets: List[Bullet]) -> None:
    for b in bullets:
        pygame.draw.circle(surf, (255, 240, 120), b.pos.xy, 5)
        pygame.draw.circle(surf, (255, 200, 60), b.pos.xy, 5, width=2)


def dist(a: Vector2, b: Vector2) -> float:
    return (a - b).length()


def font_hebrew(size: int) -> pygame.font.Font:
    return pygame.font.SysFont("segoeui", size)


def main() -> None:
    pygame.init()
    pygame.display.set_caption(h("חלליות חמודות — משחק מקומי"))
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    clock = pygame.time.Clock()

    title_font = font_hebrew(52)
    ui_font = font_hebrew(26)
    small_font = font_hebrew(22)

    stars = make_stars()
    state = "menu"
    leaderboard: Optional[list] = api_client.fetch_scores(8)
    server_ok = api_client.ping()

    # משחק
    player = Vector2(WIDTH / 2, HEIGHT - 96)
    player_r = 28
    tilt = 0.0
    bullets: List[Bullet] = []
    aliens: List[Alien] = []
    particles: List[Particle] = []
    spawn_timer = 0.0
    shoot_cd = 0.0
    wave = 1
    kills = 0
    score = 0
    run_t0 = 0.0
    wave_banner = 0.0
    t_game = 0.0

    # סיום משחק
    go_name = ""
    go_saved = False
    go_msg = ""

    running = True
    while running:
        dt = clock.tick(FPS) / 1000.0
        t_now = time.perf_counter()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            if state == "menu":
                if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
                    # איפוס משחק
                    player = Vector2(WIDTH / 2, HEIGHT - 96)
                    bullets.clear()
                    aliens.clear()
                    particles.clear()
                    spawn_timer = 0.0
                    shoot_cd = 0.0
                    wave = 1
                    kills = 0
                    score = 0
                    run_t0 = t_now
                    wave_banner = 1.2
                    t_game = 0.0
                    state = "play"

            elif state == "gameover":
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_RETURN:
                        if go_saved:
                            state = "menu"
                            leaderboard = api_client.fetch_scores(8)
                            server_ok = api_client.ping()
                        else:
                            name = go_name.strip() or "אנונימי"
                            ok = api_client.submit_score(
                                {
                                    "player_name": name,
                                    "score": int(score),
                                    "kills": int(kills),
                                    "wave_reached": int(wave),
                                    "duration_seconds": round(t_game, 2),
                                }
                            )
                            go_saved = True
                            go_msg = "נשמר בבסיס הנתונים! Enter לתפריט" if ok else "לא הצלחתי לשמור (האם השרת רץ?)."
                            leaderboard = api_client.fetch_scores(8)
                    elif event.key == pygame.K_ESCAPE:
                        state = "menu"
                        leaderboard = api_client.fetch_scores(8)
                        server_ok = api_client.ping()
                    elif event.key == pygame.K_BACKSPACE:
                        go_name = go_name[:-1]
                    elif event.unicode and event.unicode.isprintable() and len(go_name) < 32:
                        go_name += event.unicode

        keys = pygame.key.get_pressed()

        if state == "play":
            t_game = t_now - run_t0
            wave_banner = max(0.0, wave_banner - dt)

            # כוכבים
            for s in stars:
                s.update(dt)

            # שחקן
            spd = 420 * dt
            if keys[pygame.K_LEFT] or keys[pygame.K_a]:
                player.x -= spd
                tilt = min(12.0, tilt + 120 * dt)
            elif keys[pygame.K_RIGHT] or keys[pygame.K_d]:
                player.x += spd
                tilt = max(-12.0, tilt - 120 * dt)
            else:
                tilt *= 0.88
            player.x = max(46, min(WIDTH - 46, player.x))

            shoot_cd = max(0.0, shoot_cd - dt)
            if keys[pygame.K_SPACE] and shoot_cd <= 0:
                bullets.append(Bullet(pos=Vector2(player.x, player.y - 30)))
                shoot_cd = 0.18

            # יצירת חייזרים
            spawn_timer -= dt
            cap = min(10 + wave * 2, 34)
            if len(aliens) < cap and spawn_timer <= 0:
                spawn_timer = max(0.35, 1.35 - wave * 0.06)
                palette = [
                    (170, 120, 255),
                    (120, 220, 170),
                    (255, 190, 120),
                    (120, 190, 255),
                ]
                aliens.append(
                    Alien(
                        pos=Vector2(random.uniform(60, WIDTH - 60), random.uniform(-40, -10)),
                        phase=random.uniform(0, math.tau),
                        color=random.choice(palette),
                    )
                )

            # עדכון יריות וחייזרים
            for b in bullets:
                b.update(dt)
            bullets = [b for b in bullets if b.pos.y > -20]

            for a in aliens:
                a.update(dt, wave, t_game)

            # התנגשויות ירייה (מחיקה בטוחה של יריות)
            new_aliens: List[Alien] = []
            for a in aliens:
                hit_idx: Optional[int] = None
                for idx, b in enumerate(bullets):
                    if dist(a.pos, b.pos) < a.radius + 6:
                        hit_idx = idx
                        break
                if hit_idx is not None:
                    del bullets[hit_idx]
                    particles.extend(spawn_explosion(a.pos, a.color))
                    kills += 1
                    score += 12 + wave * 2 + int(min(40, kills * 0.15))
                    if kills > 0 and kills % 9 == 0:
                        wave += 1
                        wave_banner = 1.25
                else:
                    new_aliens.append(a)
            aliens = new_aliens

            # התנגשות שחקן / חייזר ירד נמוך מדי
            lost = False
            for a in aliens:
                if dist(a.pos, player) < a.radius + player_r:
                    lost = True
                    break
                if a.pos.y > HEIGHT - 55:
                    lost = True
                    break
            if lost:
                particles.extend(spawn_explosion(player, (255, 120, 160)))
                state = "gameover"
                go_name = ""
                go_saved = False
                go_msg = ""

            particles = [p for p in particles if p.update(dt)]

        elif state == "menu":
            for s in stars:
                s.update(dt * 0.35)

        elif state == "gameover":
            for s in stars:
                s.update(dt * 0.25)
            particles = [p for p in particles if p.update(dt)]

        # ציור
        screen.fill(SPACE)
        for s in stars:
            pygame.draw.circle(screen, STAR_LOW, (int(s.pos.x), int(s.pos.y)), s.r)

        if state == "menu":
            title = title_font.render(h("חלליות חמודות"), True, HUD)
            screen.blit(title, title.get_rect(center=(WIDTH // 2, 120)))
            lines = [
                "חצים / A-D לזוז, רווח לירות",
                "לחץ רווח כדי להתחיל",
                "",
                "התוצאות נשמרות ב-PostgreSQL דרך השרת המקומי (פורט 8000).",
            ]
            y = 210
            for line in lines:
                surf = ui_font.render(h(line), True, HUD)
                screen.blit(surf, surf.get_rect(center=(WIDTH // 2, y)))
                y += 34

            status = "שרת זמין" if server_ok else "לא זוהה תשובה מהשרת — הרץ docker compose"
            screen.blit(
                small_font.render(h(status), True, (180, 255, 200) if server_ok else (255, 200, 200)),
                (40, HEIGHT - 70),
            )

            screen.blit(small_font.render(h("לוח עליון:"), True, HUD), (40, 300))
            if leaderboard:
                yy = 330
                for i, row in enumerate(leaderboard[:8], start=1):
                    txt = f"{i}. {row.get('player_name','')} — ניקוד {row.get('score')} (גל {row.get('wave_reached')})"
                    screen.blit(small_font.render(h(txt), True, HUD), (60, yy))
                    yy += 26
            else:
                screen.blit(small_font.render(h("(אין נתונים או השרת לא רץ)"), True, (160, 170, 200)), (60, 330))

        elif state == "play":
            draw_bullets(screen, bullets)
            for a in aliens:
                draw_alien(screen, a)
            draw_ship(screen, player, tilt)
            for p in particles:
                pygame.draw.circle(screen, p.color, (int(p.pos.x), int(p.pos.y)), p.r)

            hud = f"ניקוד {score}   חיסולים {kills}   גל {wave}   זמן {t_game:0.1f}ש"
            screen.blit(ui_font.render(h(hud), True, HUD), (18, 16))
            if wave_banner > 0:
                btxt = ui_font.render(h("גל חדש! קצב עולה"), True, (255, 230, 160))
                screen.blit(btxt, btxt.get_rect(center=(WIDTH // 2, 70)))

        elif state == "gameover":
            for p in particles:
                pygame.draw.circle(screen, p.color, (int(p.pos.x), int(p.pos.y)), p.r)

            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((10, 12, 30, 170))
            screen.blit(overlay, (0, 0))

            t1 = title_font.render(h("נגמר הסיבוב"), True, HUD)
            screen.blit(t1, t1.get_rect(center=(WIDTH // 2, 150)))
            stats = [
                f"ניקוד: {score}",
                f"חיסולים: {kills}",
                f"גל מקסימלי: {wave}",
                f"זמן משחק: {t_game:0.1f} שניות",
            ]
            y = 220
            for line in stats:
                s = ui_font.render(h(line), True, HUD)
                screen.blit(s, s.get_rect(center=(WIDTH // 2, y)))
                y += 34

            screen.blit(ui_font.render(h("שם ללוח תוצאות (אופציונלי):"), True, HUD), (120, 310))
            box = pygame.Rect(120, 350, WIDTH - 240, 44)
            pygame.draw.rect(screen, (30, 40, 80), box, border_radius=10)
            pygame.draw.rect(screen, SHIP_ACCENT, box, width=2, border_radius=10)
            name_surf = ui_font.render(
                h(go_name + ("|" if (int(t_now * 2) % 2 == 0) else "")),
                True,
                (255, 255, 255),
            )
            screen.blit(name_surf, (box.x + 12, box.y + 8))

            hint = "Enter לשמירה   Esc לתפריט" if not go_saved else "Enter חזרה לתפריט   Esc לתפריט"
            screen.blit(small_font.render(h(hint), True, (200, 210, 230)), (120, 410))
            if go_msg:
                screen.blit(ui_font.render(h(go_msg), True, (180, 255, 190)), (120, 450))

        pygame.display.flip()

    pygame.quit()


if __name__ == "__main__":
    main()
