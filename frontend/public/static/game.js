(() => {
  const API = "/api";
  const WIDTH = 960;
  const HEIGHT = 640;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const serverLine = document.getElementById("server-line");
  const goOverlay = document.getElementById("go-overlay");
  const goStats = document.getElementById("go-stats");
  const playerNameInput = document.getElementById("player-name");
  const goMsg = document.getElementById("go-msg");
  const btnSave = document.getElementById("btn-save");
  const btnSkip = document.getElementById("btn-skip");

  let scaleX = 1, scaleY = 1;

  function resizeGameCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vv = window.visualViewport;
    const cw = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const ch = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = "";
    canvas.style.height = "";
    scaleX = canvas.width / WIDTH;
    scaleY = canvas.height / HEIGHT;
  }

  window.addEventListener("resize", resizeGameCanvas);
  window.addEventListener("orientationchange", resizeGameCanvas);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resizeGameCanvas);

  const keys = new Set();
  let pointerX = WIDTH / 2;
  let shake = 0, shakeT = 0;
  let state = "menu";

  function toCanvasCoords(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * WIDTH, y: ((clientY - r.top) / r.height) * HEIGHT };
  }

  window.addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (state === "menu" && e.code === "Space" && !e.repeat) startRun();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function stagePaceMul(w) { return 1 + Math.min(1.5, (Math.max(1, w) - 1) * 0.1); }

  // ─── STARS (4 depth layers) ──────────────────────────────────────────────────
  function makeStars() {
    const out = [];
    const defs = [
      { n: 80, minSpd: 4,   maxSpd: 11,  r: 0.38, bright: 0.32 },
      { n: 55, minSpd: 18,  maxSpd: 34,  r: 0.85, bright: 0.58 },
      { n: 30, minSpd: 55,  maxSpd: 88,  r: 1.55, bright: 0.85 },
      { n: 14, minSpd: 115, maxSpd: 175, r: 2.7,  bright: 1.0, trail: true },
    ];
    for (const d of defs) {
      for (let i = 0; i < d.n; i++) {
        out.push({
          x: Math.random() * WIDTH,
          y: Math.random() * HEIGHT,
          speed: d.minSpd + Math.random() * (d.maxSpd - d.minSpd),
          r: d.r * (0.75 + Math.random() * 0.5),
          bright: d.bright,
          trail: d.trail || false,
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    }
    return out;
  }

  // ─── NEBULAE ─────────────────────────────────────────────────────────────────
  const nebulae = [
    { x: 210, y: 160, rx: 300, ry: 170, rot: 0.28, hue: 205, sat: 80, alpha: 0.038 },
    { x: 760, y: 310, rx: 340, ry: 195, rot: -0.48, hue: 275, sat: 75, alpha: 0.032 },
    { x: 490, y: 490, rx: 270, ry: 145, rot: 0.78, hue: 28, sat: 85, alpha: 0.028 },
    { x: 95, y: 510, rx: 210, ry: 125, rot: 1.15, hue: 315, sat: 70, alpha: 0.022 },
    { x: 830, y: 100, rx: 180, ry: 110, rot: -0.3, hue: 170, sat: 65, alpha: 0.026 },
  ];

  function drawNebulae() {
    for (const n of nebulae) {
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(n.rot);
      const maxR = Math.max(n.rx, n.ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, maxR);
      g.addColorStop(0, `hsla(${n.hue},${n.sat}%,62%,${n.alpha * 2.1})`);
      g.addColorStop(0.38, `hsla(${n.hue},${n.sat}%,50%,${n.alpha})`);
      g.addColorStop(0.72, `hsla(${n.hue},${n.sat - 10}%,38%,${n.alpha * 0.4})`);
      g.addColorStop(1, `hsla(${n.hue},60%,30%,0)`);
      ctx.fillStyle = g;
      ctx.scale(n.rx / maxR, n.ry / maxR);
      ctx.beginPath();
      ctx.arc(0, 0, maxR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ─── EXPLOSIONS ──────────────────────────────────────────────────────────────
  function spawnExplosion(px, py, color) {
    const parts = [];
    parts.push({ type: "ring", x: px, y: py, r: 5, maxR: 90, life: 0.55, maxLife: 0.55, color });
    parts.push({ type: "ring", x: px, y: py, r: 3, maxR: 45, life: 0.3, maxLife: 0.3, color: [255, 255, 220] });
    parts.push({ type: "flash", x: px, y: py, r: 35, life: 0.14, maxLife: 0.14, color });
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 90 + Math.random() * 210;
      parts.push({
        type: "spark", x: px, y: py,
        vx: Math.cos(ang) * sp * (0.5 + Math.random()),
        vy: Math.sin(ang) * sp * (0.5 + Math.random()),
        life: 0.28 + Math.random() * 0.42, maxLife: 0.7,
        color, r: 2 + Math.random() * 4,
      });
    }
    for (let i = 0; i < 9; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 35 + Math.random() * 95;
      parts.push({
        type: "debris", x: px, y: py,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 50,
        life: 0.55 + Math.random() * 0.55, maxLife: 1.1,
        color: [255, 200 + (Math.random() * 55 | 0), 90],
        r: 3 + Math.random() * 5, rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 9,
      });
    }
    return parts;
  }

  function bumpShake(amount) {
    shake = Math.min(22, shake + amount);
    shakeT = 0.42;
  }

  // ─── GAME STATE ──────────────────────────────────────────────────────────────
  let stars = makeStars();
  let leaderboard = null, serverOk = false;
  let tGame = 0, animT = 0;

  let playerX = WIDTH / 2, playerY = HEIGHT - 96;
  const playerR = 28;
  let tilt = 0;
  let playerHp = 3, playerInvT = 0, hitFlash = 0;
  let bullets = [], enemyBullets = [], aliens = [], meteors = [], powerups = [], particles = [];
  let boss = null;
  let spawnTimer = 0, meteorTimer = 3, shootCd = 0;
  let wave = 1, kills = 0, score = 0;
  let runT0 = 0, waveBanner = 0, waveBannerText = "";
  let goSaved = false;
  let shieldCharges = 0, rapidUntil = 0, spreadUntil = 0;
  let combo = 0, comboTimer = 0, bestCombo = 0, lastKillT = -99;

  function baseShootCd() { return tGame < rapidUntil ? 0.08 : 0.16; }

  function tryFire() {
    if (shootCd > 0) return;
    const spread = tGame < spreadUntil;
    if (spread) {
      bullets.push({ x: playerX, y: playerY - 28, vy: -750, vx: 0 });
      bullets.push({ x: playerX - 22, y: playerY - 18, vy: -710, vx: -68 });
      bullets.push({ x: playerX + 22, y: playerY - 18, vy: -710, vx: 68 });
    } else {
      bullets.push({ x: playerX, y: playerY - 30, vy: -750, vx: 0 });
    }
    shootCd = baseShootCd();
  }

  canvas.addEventListener("mousemove", (e) => {
    if (state === "play") pointerX = toCanvasCoords(e.clientX, e.clientY).x;
  });
  canvas.addEventListener("touchmove", (e) => {
    if (state !== "play") return;
    e.preventDefault();
    pointerX = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY).x;
  }, { passive: false });
  canvas.addEventListener("touchstart", (e) => {
    if (state !== "play") return;
    e.preventDefault();
    pointerX = toCanvasCoords(e.changedTouches[0].clientX, e.changedTouches[0].clientY).x;
    tryFire();
  }, { passive: false });

  // ─── ALIEN FACTORIES ─────────────────────────────────────────────────────────
  function rollAlienKind(w) {
    const r = Math.random();
    if (w >= 5 && r < 0.11) return "sniper";
    if (w >= 3 && r < 0.24) return "tank";
    if (r < 0.38) return "scout";
    return "grunt";
  }

  function makeAlien(w) {
    const kind = rollAlienKind(w);
    const x = 70 + Math.random() * (WIDTH - 140);
    const y = -22 - Math.random() * 42;
    const phase = Math.random() * Math.PI * 2;
    const shootDelay = 2 + Math.random() * 3;
    const base = { x, y, phase, kind, shootTimer: shootDelay };
    if (kind === "scout") return { ...base, radius: 19, hp: 1, maxHp: 1, speedMul: 1.65, sinAmp: 65, color: [70, 215, 255], shootCd: 2.0 };
    if (kind === "tank") return { ...base, radius: 37, hp: 5, maxHp: 5, speedMul: 0.42, sinAmp: 20, color: [255, 90, 155], shootCd: 3.2 };
    if (kind === "sniper") return { ...base, radius: 22, hp: 2, maxHp: 2, speedMul: 0.28, sinAmp: 6, color: [255, 215, 60], shootCd: 1.6, anchoredY: 75 + Math.random() * 130 };
    return {
      ...base, radius: 25, hp: 1, maxHp: 1, speedMul: 1.0, sinAmp: 46,
      color: [[158, 88, 255], [88, 215, 155], [255, 175, 88], [88, 175, 255]][(Math.random() * 4) | 0],
      shootCd: 3.2 + Math.random(),
    };
  }

  function makeBoss(w) {
    return {
      x: WIDTH / 2, y: -155, phase: Math.random() * Math.PI * 2,
      hp: 65 + w * 15, maxHp: 65 + w * 15,
      radius: 82, vy: 18 + w * 0.75, anchorY: 135,
      shootTimer: 1.8, ringAngle: 0,
    };
  }

  function maybeDropPowerup(x, y) {
    if (Math.random() > 0.17) return;
    const kinds = ["SHIELD", "RAPID", "SPREAD", "BOMB"];
    powerups.push({
      x, y, vy: 88 + Math.random() * 55,
      kind: kinds[(Math.random() * kinds.length) | 0],
      wobble: Math.random() * Math.PI * 2,
    });
  }

  // ─── PLAYER HIT / COMBO ──────────────────────────────────────────────────────
  function playerHit() {
    if (playerInvT > 0) return;
    if (shieldCharges > 0) {
      shieldCharges -= 1;
      playerInvT = 1.6;
      hitFlash = 0.22;
      bumpShake(6);
      particles.push(...spawnExplosion(playerX, playerY, [100, 220, 255]));
      return;
    }
    playerHp -= 1;
    playerInvT = 2.2;
    hitFlash = 0.38;
    bumpShake(13);
    particles.push(...spawnExplosion(playerX, playerY, [255, 70, 110]));
    if (playerHp <= 0) triggerGameOver();
  }

  function registerKill() {
    if (tGame - lastKillT < 2.5) combo += 1; else combo = 1;
    lastKillT = tGame;
    if (combo > bestCombo) bestCombo = combo;
    comboTimer = 2.5;
  }

  function comboMul() { return 1 + Math.max(0, Math.min(combo - 1, 9)) * 0.15; }

  // ─── API ─────────────────────────────────────────────────────────────────────
  async function ping() { try { return (await fetch(`${API}/health`)).ok; } catch { return false; } }
  async function fetchScores(limit = 8) {
    try { const r = await fetch(`${API}/scores?limit=${limit}`); return r.ok ? r.json() : null; } catch { return null; }
  }
  async function submitScore(payload) {
    try {
      return (await fetch(`${API}/scores`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      })).ok;
    } catch { return false; }
  }

  function setServerLine() {
    serverLine.classList.remove("ok", "bad");
    if (serverOk) {
      serverLine.textContent = "API דרך nginx (/api) — תוצאות ב־PostgreSQL.";
      serverLine.classList.add("ok");
    } else {
      serverLine.textContent = "לא נוצר קשר עם /api — ודא ש־docker compose רץ ושאתה על אותו פורט שהוגדר (ברירת מחדל 9080).";
      serverLine.classList.add("bad");
    }
  }

  async function refreshMeta() { serverOk = await ping(); leaderboard = await fetchScores(8); setServerLine(); }

  function hideGoOverlay() { goOverlay.classList.add("hidden"); goOverlay.setAttribute("aria-hidden", "true"); canvas.focus(); }

  function showGoOverlay() {
    goStats.innerHTML = "";
    const lines = [
      `ניקוד: ${score}`, `חיסולים: ${kills}`,
      `שלב מקסימלי: ${wave}`, `זמן משחק: ${tGame.toFixed(1)} שניות`,
      `קומבו מקסימלי: x${bestCombo}`,
    ];
    for (const t of lines) { const li = document.createElement("li"); li.textContent = t; goStats.appendChild(li); }
    playerNameInput.value = ""; goMsg.textContent = ""; goSaved = false;
    goOverlay.classList.remove("hidden");
    goOverlay.setAttribute("aria-hidden", "false");
    playerNameInput.focus();
  }

  function triggerGameOver() {
    particles.push(...spawnExplosion(playerX, playerY, [255, 70, 110]));
    particles.push(...spawnExplosion(playerX + 25, playerY - 15, [255, 170, 60]));
    bumpShake(16);
    state = "gameover";
    showGoOverlay();
  }

  btnSave.addEventListener("click", async () => {
    if (goSaved) return;
    const name = (playerNameInput.value || "אנונימי").trim() || "אנונימי";
    const ok = await submitScore({ player_name: name, score: Math.floor(score), kills: Math.floor(kills), wave_reached: Math.max(1, Math.floor(wave)), duration_seconds: Math.round(tGame * 100) / 100 });
    goSaved = true;
    goMsg.textContent = ok ? "נשמר בבסיס הנתונים." : "לא הצלחתי לשמור — בדוק שה־backend רץ.";
    leaderboard = await fetchScores(8);
  });

  btnSkip.addEventListener("click", async () => {
    keys.delete("Space");
    hideGoOverlay();
    await refreshMeta();
    state = "menu";
  });

  function startRun() {
    keys.delete("Space");
    playerX = WIDTH / 2; playerY = HEIGHT - 96;
    bullets = []; enemyBullets = []; aliens = []; meteors = []; powerups = []; particles = [];
    boss = null; spawnTimer = 0; meteorTimer = 2.2; shootCd = 0;
    wave = 1; kills = 0; score = 0;
    runT0 = performance.now() / 1000;
    waveBanner = 1.2; waveBannerText = "שלב 1";
    tGame = 0; tilt = 0;
    playerHp = 3; playerInvT = 0; hitFlash = 0;
    shieldCharges = 0; rapidUntil = 0; spreadUntil = 0;
    combo = 0; comboTimer = 0; bestCombo = 0; lastKillT = -99;
    state = "play";
    canvas.focus();
  }

  // ─── SHIP THEME ──────────────────────────────────────────────────────────────
  function shipThemeForWave(w) {
    const s = Math.max(1, Math.min(8, w));
    const themes = [
      { body: [70, 150, 255], accent: [100, 230, 255], glow: "rgba(70,190,255,0.85)" },
      { body: [90, 215, 255], accent: [190, 255, 255], glow: "rgba(90,235,255,0.9)" },
      { body: [255, 195, 70], accent: [255, 135, 35], glow: "rgba(255,175,55,0.85)" },
      { body: [110, 255, 155], accent: [35, 210, 115], glow: "rgba(75,250,155,0.85)" },
      { body: [215, 90, 255], accent: [155, 55, 255], glow: "rgba(195,75,255,0.85)" },
      { body: [255, 115, 75], accent: [255, 55, 35], glow: "rgba(255,75,55,0.9)" },
      { body: [70, 250, 195], accent: [35, 195, 175], glow: "rgba(55,235,195,0.85)" },
      { body: [250, 250, 255], accent: [195, 175, 255], glow: "rgba(215,195,255,1.0)" },
    ];
    return themes[s - 1];
  }

  // ─── DRAW: SHIP (3D perspective look) ────────────────────────────────────────
  function drawShip(x, y, tiltDeg, waveNum) {
    const th = shipThemeForWave(waveNum);
    const [br, bg, bb] = th.body;
    const [ar, ag, ab] = th.accent;

    ctx.save();
    ctx.translate(x, y);
    // Banking skew for 3D feel
    const bankSkew = tiltDeg * 0.013;
    ctx.transform(1, 0, bankSkew, 1, 0, 0);

    // Engine flame trails
    const flicker = 0.62 + 0.38 * Math.sin(animT * 27);
    for (const side of [-1, 1]) {
      const ex = side * 22, ey = 22;
      const eLen = 28 + flicker * 20;
      const eg = ctx.createRadialGradient(ex, ey + eLen * 0.28, 0, ex, ey + eLen * 0.55, eLen);
      eg.addColorStop(0, `rgba(${ar},${ag},${ab},0.97)`);
      eg.addColorStop(0.3, `rgba(80,140,255,0.55)`);
      eg.addColorStop(0.65, `rgba(40,70,200,0.22)`);
      eg.addColorStop(1, `rgba(0,15,80,0)`);
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.ellipse(ex, ey + eLen * 0.5, 8 * flicker, eLen * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.ellipse(ex, ey + 1, 4.2, 6.5 * flicker, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hull shadow for depth
    ctx.fillStyle = "rgba(0,0,30,0.3)";
    ctx.beginPath();
    ctx.ellipse(5, 8, 50, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Left wing
    ctx.beginPath();
    ctx.moveTo(-15, -5); ctx.lineTo(-12, 26); ctx.lineTo(-64, 36); ctx.lineTo(-54, 2);
    ctx.closePath();
    const lwg = ctx.createLinearGradient(-64, 36, -13, 0);
    lwg.addColorStop(0, `rgba(${br * 0.18 | 0},${bg * 0.18 | 0},${bb * 0.18 | 0},0.92)`);
    lwg.addColorStop(0.55, `rgba(${br * 0.52 | 0},${bg * 0.52 | 0},${bb * 0.52 | 0},0.95)`);
    lwg.addColorStop(1, `rgba(${br},${bg},${bb},1)`);
    ctx.fillStyle = lwg;
    ctx.fill();
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.48)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Right wing
    ctx.beginPath();
    ctx.moveTo(15, -5); ctx.lineTo(12, 26); ctx.lineTo(64, 36); ctx.lineTo(54, 2);
    ctx.closePath();
    const rwg = ctx.createLinearGradient(64, 36, 13, 0);
    rwg.addColorStop(0, `rgba(${br * 0.18 | 0},${bg * 0.18 | 0},${bb * 0.18 | 0},0.92)`);
    rwg.addColorStop(0.55, `rgba(${br * 0.52 | 0},${bg * 0.52 | 0},${bb * 0.52 | 0},0.95)`);
    rwg.addColorStop(1, `rgba(${br},${bg},${bb},1)`);
    ctx.fillStyle = rwg;
    ctx.fill();
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.48)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Wing panel details
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.38)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-34, 22); ctx.lineTo(-60, 32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(34, 22); ctx.lineTo(60, 32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-42, 10); ctx.lineTo(-56, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, 10); ctx.lineTo(56, 14); ctx.stroke();

    // Main hull body
    ctx.beginPath();
    ctx.moveTo(0, -37);
    ctx.lineTo(16, -5);
    ctx.lineTo(20, 11);
    ctx.lineTo(14, 26);
    ctx.lineTo(-14, 26);
    ctx.lineTo(-20, 11);
    ctx.lineTo(-16, -5);
    ctx.closePath();
    const hg = ctx.createRadialGradient(-8, -14, 2, 0, 0, 48);
    hg.addColorStop(0, "rgba(255,255,255,0.97)");
    hg.addColorStop(0.14, `rgba(${Math.min(255, br + 85)},${Math.min(255, bg + 85)},${Math.min(255, bb + 85)},0.92)`);
    hg.addColorStop(0.44, `rgba(${br},${bg},${bb},1)`);
    hg.addColorStop(0.82, `rgba(${br * 0.38 | 0},${bg * 0.38 | 0},${bb * 0.38 | 0},1)`);
    hg.addColorStop(1, "rgba(6,8,28,1)");
    ctx.fillStyle = hg;
    ctx.shadowColor = th.glow;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.72)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hull panel lines
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.32)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, 20); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath(); ctx.moveTo(-14, 4); ctx.lineTo(14, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-17, 14); ctx.lineTo(17, 14); ctx.stroke();

    // Engine pods (3D ellipses)
    for (const side of [-1, 1]) {
      const ex = side * 22, ey = 21;
      const epg = ctx.createRadialGradient(ex - 3, ey - 2, 0, ex, ey, 14);
      epg.addColorStop(0, "rgba(255,255,255,0.97)");
      epg.addColorStop(0.28, `rgba(${ar},${ag},${ab},0.9)`);
      epg.addColorStop(0.72, `rgba(${br * 0.45 | 0},${bg * 0.45 | 0},${bb * 0.45 | 0},0.9)`);
      epg.addColorStop(1, "rgba(0,0,18,0.85)");
      ctx.fillStyle = epg;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 11, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.82)`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }

    // Cockpit dome
    const cdg = ctx.createRadialGradient(-5, -27, 1, 0, -23, 14);
    cdg.addColorStop(0, "rgba(215,242,255,0.98)");
    cdg.addColorStop(0.38, "rgba(95,185,255,0.62)");
    cdg.addColorStop(0.78, "rgba(28,75,158,0.38)");
    cdg.addColorStop(1, "rgba(8,28,78,0.12)");
    ctx.fillStyle = cdg;
    ctx.beginPath();
    ctx.ellipse(0, -23, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(175,228,255,0.68)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.beginPath();
    ctx.ellipse(-4, -27, 4, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Shield ring
    if (shieldCharges > 0) {
      const sa = 0.42 + 0.16 * Math.sin(animT * 9);
      ctx.strokeStyle = `rgba(100,235,255,${sa})`;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = "rgba(85,215,255,0.92)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(0, -1, 62, 47, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(195,255,255,${sa * 0.38})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -1, 57, 43, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Invincibility flicker
    if (playerInvT > 0 && Math.floor(animT * 9) % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.ellipse(0, -1, 64, 48, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ─── 3D SPHERE SHADING UTILITY ───────────────────────────────────────────────
  function apply3DShading(cx, cy, rad) {
    const hl = ctx.createRadialGradient(cx - rad * 0.38, cy - rad * 0.42, 0, cx, cy, rad * 1.06);
    hl.addColorStop(0, "rgba(255,255,255,0.72)");
    hl.addColorStop(0.26, "rgba(255,255,255,0.18)");
    hl.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hl;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();

    const sh = ctx.createRadialGradient(cx + rad * 0.32, cy + rad * 0.36, 0, cx, cy, rad * 0.9);
    sh.addColorStop(0, "rgba(0,0,0,0.38)");
    sh.addColorStop(0.55, "rgba(0,0,0,0.14)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.84)";
    ctx.beginPath();
    ctx.arc(cx - rad * 0.31, cy - rad * 0.35, rad * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── EVIL FACE (shared for aliens & boss) ────────────────────────────────────
  function drawEvilFace(x, y, rad, a) {
    const kind = a.kind || "grunt";
    const blink = 0.82 + 0.18 * Math.sin(animT * 5.5 + a.phase);
    const eo = rad * 0.3;
    const eyeR = rad * 0.24 * blink;

    // Eyebrows
    ctx.fillStyle = "rgba(18,0,8,0.6)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * (eo + 5), y - rad * 0.14);
      ctx.lineTo(x + side * (eo - 5), y - rad * 0.26);
      ctx.lineTo(x + side * 2, y - rad * 0.17);
      ctx.closePath();
      ctx.fill();
    }

    // Eyes
    for (const side of [-1, 1]) {
      const ex = x + side * eo, ey = y - rad * 0.07;
      const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, eyeR * 2.2);
      glow.addColorStop(0, "rgba(255,70,35,0.42)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR * 2.2, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#180008";
      ctx.beginPath(); ctx.ellipse(ex, ey, eyeR * 1.1, eyeR * 0.92, 0, 0, Math.PI * 2); ctx.fill();

      const iris = ctx.createRadialGradient(ex, ey, 0, ex, ey, eyeR);
      iris.addColorStop(0, "#ffe892");
      iris.addColorStop(0.38, "#ff2838");
      iris.addColorStop(0.82, "#780015");
      iris.addColorStop(1, "#280008");
      ctx.fillStyle = iris;
      ctx.beginPath(); ctx.ellipse(ex, ey, eyeR * 0.92, eyeR, side * 0.1, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#040108";
      ctx.beginPath(); ctx.arc(ex + side * 1.5, ey + 1, eyeR * 0.38, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.beginPath(); ctx.arc(ex - eyeR * 0.22, ey - eyeR * 0.28, eyeR * 0.16, 0, Math.PI * 2); ctx.fill();
    }

    // Mouth
    const teethN = kind === "tank" ? 8 : kind === "boss" ? 9 : 6;
    const mouthY = y + rad * 0.16;
    const mouthW = rad * 0.64;
    ctx.fillStyle = "rgba(175,0,38,0.88)";
    ctx.beginPath();
    ctx.arc(x, mouthY + rad * 0.09, mouthW * 0.72, (198 * Math.PI) / 180, (342 * Math.PI) / 180);
    ctx.fill();
    ctx.fillStyle = "rgba(255,245,230,0.96)";
    for (let i = 0; i < teethN; i++) {
      const t = i / (teethN - 1) - 0.5;
      const tx = x + t * mouthW * 1.3;
      const ty = mouthY + Math.abs(t) * rad * 0.1;
      const th2 = Math.max(3, 9 + (kind === "tank" ? 4 : 0) - Math.abs(t) * 5);
      ctx.beginPath();
      ctx.moveTo(tx - 3.5, ty); ctx.lineTo(tx, ty + th2); ctx.lineTo(tx + 3.5, ty);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawHpBar(x, y, rad, ratio) {
    const bw = rad * 2.4, bh = 5, bx = x - bw / 2, by = y - rad - 13;
    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.beginPath(); roundRect(ctx, bx, by, bw, bh, 2); ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? "#55eeff" : ratio > 0.25 ? "#ffc845" : "#ff3858";
    ctx.beginPath(); roundRect(ctx, bx, by, bw * ratio, bh, 2); ctx.fill();
  }

  // ─── DRAW: GRUNT ALIEN ───────────────────────────────────────────────────────
  function drawAlienGrunt(a) {
    const { x, y, radius: rad, color, phase } = a;
    const pulse = 0.96 + 0.04 * Math.sin(animT * 4.2 + phase);
    const rot = phase * 0.1 + animT * 0.32;

    ctx.save();
    ctx.shadowColor = `rgb(${color.join(",")})`;
    ctx.shadowBlur = 16;

    ctx.beginPath();
    ctx.arc(x, y, rad * pulse, 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(x, y, 2, x, y, rad * 1.12);
    bg.addColorStop(0, `rgba(${color.join(",")},0.88)`);
    bg.addColorStop(0.58, `rgba(${color.map(v => v * 0.38 | 0).join(",")},0.95)`);
    bg.addColorStop(1, "rgba(8,4,18,1)");
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowBlur = 0;

    apply3DShading(x, y, rad * pulse);

    ctx.beginPath();
    ctx.arc(x, y, rad * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${color.map(v => Math.min(255, v + 65)).join(",")},0.72)`;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Tentacles
    const tentN = 4;
    for (let i = 0; i < tentN; i++) {
      const ang = rot + (i / tentN) * Math.PI * 2;
      const wriggle = Math.sin(animT * 3.8 + i * 1.5 + phase) * 0.3;
      const tx = x + Math.cos(ang) * rad * 0.85, ty = y + Math.sin(ang) * rad * 0.85;
      const ex = x + Math.cos(ang + wriggle) * (rad * 1.55 + 5);
      const ey = y + Math.sin(ang + wriggle) * (rad * 1.55 + 5);
      const cx1 = x + Math.cos(ang + wriggle * 0.55) * (rad * 1.18);
      const cy1 = y + Math.sin(ang + wriggle * 0.55) * (rad * 1.18);
      ctx.strokeStyle = `rgba(${color.map(v => v * 0.65 | 0).join(",")},0.62)`;
      ctx.lineWidth = 2.8 - i * 0.22;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(cx1, cy1, ex, ey); ctx.stroke();
      ctx.fillStyle = `rgba(${color.join(",")},0.55)`;
      ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, Math.PI * 2); ctx.fill();
    }

    drawEvilFace(x, y, rad, a);
    if (a.maxHp > 1) drawHpBar(x, y, rad, a.hp / a.maxHp);
    ctx.restore();
  }

  // ─── DRAW: SCOUT ALIEN ───────────────────────────────────────────────────────
  function drawAlienScout(a) {
    const { x, y, radius: rad, color, phase } = a;
    const rot = animT * 0.85 + phase;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.shadowColor = `rgb(${color.join(",")})`;
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.moveTo(0, -rad * 1.12);
    ctx.lineTo(rad * 0.62, rad * 0.32);
    ctx.lineTo(rad * 0.26, rad * 0.72);
    ctx.lineTo(0, rad * 0.52);
    ctx.lineTo(-rad * 0.26, rad * 0.72);
    ctx.lineTo(-rad * 0.62, rad * 0.32);
    ctx.closePath();

    const sg = ctx.createRadialGradient(-rad * 0.22, -rad * 0.42, 0, 0, 0, rad * 1.05);
    sg.addColorStop(0, "rgba(220,248,255,0.97)");
    sg.addColorStop(0.28, `rgb(${color.join(",")})`);
    sg.addColorStop(0.72, `rgb(${color.map(v => v * 0.28 | 0).join(",")})`);
    sg.addColorStop(1, "rgb(4,9,22)");
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${color.map(v => Math.min(255, v + 85)).join(",")},0.82)`;
    ctx.lineWidth = 1.5; ctx.stroke();

    // Panel lines
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -rad * 0.52); ctx.lineTo(0, rad * 0.52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-rad * 0.28, -rad * 0.08); ctx.lineTo(rad * 0.28, -rad * 0.08); ctx.stroke();

    // Engine glow
    const eg = ctx.createRadialGradient(0, rad * 0.78, 0, 0, rad * 0.82, rad * 0.42);
    eg.addColorStop(0, `rgba(${color.join(",")},0.92)`);
    eg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(0, rad * 0.72, rad * 0.27, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "rgba(198,238,255,0.92)";
    ctx.beginPath(); ctx.ellipse(0, -rad * 0.28, rad * 0.14, rad * 0.22, 0, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
    if (a.maxHp > 1) drawHpBar(x, y, rad, a.hp / a.maxHp);
  }

  // ─── DRAW: TANK ALIEN ────────────────────────────────────────────────────────
  function drawAlienTank(a) {
    const { x, y, radius: rad, color, phase } = a;
    const rot = phase * 0.2 + animT * 0.14;

    ctx.save();
    ctx.shadowColor = `rgb(${color.join(",")})`;
    ctx.shadowBlur = 22;

    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
    const ag = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, 4, x, y, rad * 1.12);
    ag.addColorStop(0, `rgba(255,215,238,0.92)`);
    ag.addColorStop(0.22, `rgb(${color.join(",")})`);
    ag.addColorStop(0.62, `rgb(${color.map(v => v * 0.42 | 0).join(",")})`);
    ag.addColorStop(1, "rgb(7,3,14)");
    ctx.fillStyle = ag;
    ctx.fill();
    ctx.shadowBlur = 0;

    apply3DShading(x, y, rad);

    // Armor segments
    ctx.strokeStyle = `rgba(${color.map(v => v * 0.28 | 0).join(",")},0.72)`;
    ctx.lineWidth = 3.5;
    for (let i = 0; i < 6; i++) {
      const a1 = rot + (i / 6) * Math.PI * 2;
      const a2 = rot + ((i + 1) / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a1) * rad * 0.44, y + Math.sin(a1) * rad * 0.44);
      ctx.lineTo(x + Math.cos(a1) * rad * 0.95, y + Math.sin(a1) * rad * 0.95);
      ctx.lineTo(x + Math.cos((a1 + a2) / 2) * rad * 1.02, y + Math.sin((a1 + a2) / 2) * rad * 1.02);
      ctx.lineTo(x + Math.cos(a2) * rad * 0.95, y + Math.sin(a2) * rad * 0.95);
      ctx.stroke();
    }

    // Spikes
    for (let i = 0; i < 6; i++) {
      const ang = rot + (i / 6) * Math.PI * 2;
      const sx = x + Math.cos(ang) * rad, sy = y + Math.sin(ang) * rad;
      const ex = x + Math.cos(ang) * (rad * 1.38), ey = y + Math.sin(ang) * (rad * 1.38);
      ctx.strokeStyle = `rgba(${color.join(",")},0.82)`;
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = `rgba(255,${color[1] * 0.65 | 0},${color[2] * 0.45 | 0},0.92)`;
      ctx.beginPath(); ctx.arc(ex, ey, 4.5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${color.map(v => Math.min(255, v + 72)).join(",")},0.82)`;
    ctx.lineWidth = 3.2; ctx.stroke();

    drawEvilFace(x, y, rad, a);
    drawHpBar(x, y, rad, a.hp / a.maxHp);
    ctx.restore();
  }

  // ─── DRAW: SNIPER ALIEN ──────────────────────────────────────────────────────
  function drawAlienSniper(a) {
    const { x, y, radius: rad, color, phase } = a;
    const pulse = 0.93 + 0.07 * Math.sin(animT * 7 + phase);
    const rot = phase * 0.3 + animT * 0.22;

    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.shadowColor = `rgb(${color.join(",")})`;
    ctx.shadowBlur = 18;

    // Star/spiky shape
    const pts = 8;
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const outer = i % 2 === 0;
      const r = outer ? rad * pulse : rad * 0.52 * pulse;
      const ang = (i / (pts * 2)) * Math.PI * 2;
      const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const sg = ctx.createRadialGradient(-rad * 0.32, -rad * 0.36, 0, 0, 0, rad);
    sg.addColorStop(0, "rgba(255,255,195,0.92)");
    sg.addColorStop(0.28, `rgb(${color.join(",")})`);
    sg.addColorStop(0.78, `rgb(${color.map(v => v * 0.28 | 0).join(",")})`);
    sg.addColorStop(1, "rgb(9,7,2)");
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${color.map(v => Math.min(255, v + 82)).join(",")},0.9)`;
    ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    // Targeting laser (faint line toward player)
    const dx = playerX - x, dy = playerY - y, d = Math.hypot(dx, dy);
    if (d > 0) {
      const lAlpha = 0.07 + 0.05 * Math.sin(animT * 9 + phase);
      const lg = ctx.createLinearGradient(x, y, x + dx, y + dy);
      lg.addColorStop(0, `rgba(${color.join(",")},${lAlpha * 2.2})`);
      lg.addColorStop(1, `rgba(${color.join(",")},0)`);
      ctx.strokeStyle = lg;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (a.maxHp > 1) drawHpBar(x, y, rad, a.hp / a.maxHp);
  }

  function drawAlien(a) {
    const k = a.kind || "grunt";
    if (k === "scout") drawAlienScout(a);
    else if (k === "tank") drawAlienTank(a);
    else if (k === "sniper") drawAlienSniper(a);
    else drawAlienGrunt(a);
  }

  // ─── DRAW: BOSS ──────────────────────────────────────────────────────────────
  function drawBoss(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const rad = b.radius;
    const pulse = 0.92 + 0.08 * Math.sin(animT * 2.6);
    const ang = b.ringAngle || 0;
    const hpRatio = b.hp / b.maxHp;

    // Outer energy field
    const oef = ctx.createRadialGradient(0, 0, rad * 0.8, 0, 0, rad * 1.7);
    oef.addColorStop(0, "rgba(200,55,115,0)");
    oef.addColorStop(0.48, `rgba(200,55,115,${0.14 + 0.07 * Math.sin(animT * 3.2)})`);
    oef.addColorStop(1, "rgba(200,55,115,0)");
    ctx.fillStyle = oef; ctx.beginPath(); ctx.arc(0, 0, rad * 1.7, 0, Math.PI * 2); ctx.fill();

    // Primary orbital ring
    ctx.save(); ctx.rotate(ang);
    ctx.strokeStyle = "rgba(255,155,72,0.7)";
    ctx.lineWidth = 6;
    ctx.shadowColor = "rgba(255,135,55,0.85)"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(0, 0, rad * 1.32, rad * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tx = Math.cos(a) * rad * 1.32, ty = Math.sin(a) * rad * 0.5;
      const tg = ctx.createRadialGradient(tx - 2, ty - 2, 0, tx, ty, 10);
      tg.addColorStop(0, "rgba(255,205,95,0.97)");
      tg.addColorStop(0.48, "rgba(205,75,35,0.82)");
      tg.addColorStop(1, "rgba(78,0,18,0)");
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.arc(tx, ty, 10 + pulse * 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Secondary ring
    ctx.save(); ctx.rotate(-ang * 0.68);
    ctx.strokeStyle = `rgba(115,72,255,${0.38 + 0.1 * Math.sin(animT * 4)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, rad * 1.12, rad * 0.34, Math.PI / 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Main body
    ctx.beginPath(); ctx.arc(0, 0, rad * pulse, 0, Math.PI * 2);
    const bodyG = ctx.createRadialGradient(-rad * 0.3, -rad * 0.32, rad * 0.05, 0, 0, rad * 1.02);
    const c1 = hpRatio > 0.5 ? "#ffd0ee" : "#ff8050";
    const c2 = hpRatio > 0.5 ? "#c25595" : "#c02818";
    const c3 = hpRatio > 0.5 ? "#5e1848" : "#5c0d0d";
    bodyG.addColorStop(0, c1); bodyG.addColorStop(0.22, c2); bodyG.addColorStop(0.62, c3);
    bodyG.addColorStop(0.88, hpRatio > 0.5 ? "#2d071d" : "#280606");
    bodyG.addColorStop(1, "#0b0312");
    ctx.fillStyle = bodyG;
    ctx.shadowColor = hpRatio > 0.5 ? "rgba(235,72,155,0.72)" : "rgba(255,55,35,0.85)";
    ctx.shadowBlur = 28; ctx.fill(); ctx.shadowBlur = 0;

    // 3D sphere shading
    apply3DShading(0, 0, rad * pulse);

    // Surface ridges
    ctx.strokeStyle = "rgba(95,25,55,0.55)";
    ctx.lineWidth = 3.5;
    for (let i = 0; i < 6; i++) {
      const ra = (i / 6) * Math.PI * 2 + animT * 0.42;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ra) * rad * 0.22, Math.sin(ra) * rad * 0.22);
      ctx.lineTo(Math.cos(ra) * rad * 0.88, Math.sin(ra) * rad * 0.88);
      ctx.stroke();
    }

    ctx.beginPath(); ctx.arc(0, 0, rad * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,205,115,0.88)";
    ctx.lineWidth = 4.5; ctx.stroke();

    drawEvilFace(0, 0, rad * 0.74, { kind: "boss", phase: b.phase || 0 });

    // HP bar
    const bw = rad * 2.3, bh = 9;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.beginPath(); roundRect(ctx, -bw / 2, -rad - 20, bw, bh, 3); ctx.fill();
    ctx.fillStyle = hpRatio > 0.5 ? "#ff5585" : hpRatio > 0.25 ? "#ff7535" : "#ff1818";
    ctx.beginPath(); roundRect(ctx, -bw / 2, -rad - 20, bw * hpRatio, bh, 3); ctx.fill();

    ctx.textAlign = "center";
    ctx.font = "bold 13px Segoe UI, Heebo, sans-serif";
    ctx.fillStyle = "rgba(255,195,145,0.88)";
    ctx.fillText("BOSS", 0, -rad - 26);

    ctx.restore();
  }

  // ─── DRAW: METEOR ────────────────────────────────────────────────────────────
  function drawMeteor(m) {
    ctx.save();
    ctx.translate(m.x, m.y); ctx.rotate(m.rot);
    const pts = 9;

    function meteorPath() {
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const ang = (i / pts) * Math.PI * 2;
        const rr = m.r * (0.7 + 0.3 * Math.sin(i * 2.4 + m.seed));
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }

    meteorPath();
    const rg = ctx.createRadialGradient(-m.r * 0.28, -m.r * 0.33, 0, 0, 0, m.r * 1.08);
    rg.addColorStop(0, "#989aae"); rg.addColorStop(0.32, "#606272");
    rg.addColorStop(0.68, "#383a50"); rg.addColorStop(1, "#181825");
    ctx.fillStyle = rg; ctx.fill();
    ctx.strokeStyle = "rgba(175,178,212,0.48)"; ctx.lineWidth = 2; ctx.stroke();

    // Craters
    const craters = [
      { rx: -m.r * 0.2, ry: m.r * 0.12, cr: m.r * 0.22 },
      { rx: m.r * 0.32, ry: -m.r * 0.22, cr: m.r * 0.16 },
      { rx: -m.r * 0.36, ry: -m.r * 0.28, cr: m.r * 0.13 },
    ];
    for (const c of craters) {
      if (Math.hypot(c.rx, c.ry) + c.cr < m.r * 0.85) {
        ctx.fillStyle = "rgba(18,18,30,0.58)";
        ctx.beginPath(); ctx.arc(c.rx, c.ry, c.cr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(135,138,158,0.28)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = "rgba(195,198,218,0.18)";
        ctx.beginPath(); ctx.arc(c.rx - c.cr * 0.22, c.ry - c.cr * 0.22, c.cr * 0.65, 0.8, 2.55); ctx.stroke();
      }
    }

    // 3D surface shading
    meteorPath();
    const sg = ctx.createRadialGradient(-m.r * 0.25, -m.r * 0.28, 0, 0, 0, m.r * 0.98);
    sg.addColorStop(0, "rgba(195,195,215,0.32)");
    sg.addColorStop(0.42, "rgba(0,0,0,0)");
    sg.addColorStop(1, "rgba(0,0,0,0.48)");
    ctx.fillStyle = sg; ctx.fill();

    ctx.restore();
  }

  // ─── DRAW: POWERUP ───────────────────────────────────────────────────────────
  function drawPowerup(p) {
    const bob = Math.sin(animT * 5.2 + p.wobble) * 3.2;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(animT * 2.1 + p.wobble);

    const colors = { SHIELD: [100, 235, 255], RAPID: [255, 198, 52], SPREAD: [195, 95, 255], BOMB: [255, 95, 52] };
    const [r, g, b] = colors[p.kind] || [255, 255, 255];

    const og = ctx.createRadialGradient(0, 0, 5, 0, 0, 28);
    og.addColorStop(0, `rgba(${r},${g},${b},0.42)`);
    og.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();

    const s = 16.5;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.68, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.68, 0);
    ctx.closePath();
    const dg = ctx.createLinearGradient(-s, -s, s, s);
    dg.addColorStop(0, "rgba(255,255,255,0.92)");
    dg.addColorStop(0.42, `rgb(${r},${g},${b})`);
    dg.addColorStop(1, `rgb(${r * 0.48 | 0},${g * 0.48 | 0},${b * 0.48 | 0})`);
    ctx.fillStyle = dg;
    ctx.shadowColor = `rgba(${r},${g},${b},0.82)`;
    ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.62)"; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `bold ${s * 0.65}px monospace`;
    ctx.fillStyle = "rgba(8,4,22,0.92)";
    const icons = { SHIELD: "S", RAPID: "R", SPREAD: "X", BOMB: "B" };
    ctx.fillText(icons[p.kind] || "?", 0, 1);

    ctx.restore();
  }

  // ─── DRAW: PLAYER BULLETS ────────────────────────────────────────────────────
  function drawBullets() {
    for (const b of bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      const tg = ctx.createLinearGradient(0, 0, 0, 20);
      tg.addColorStop(0, "rgba(255,238,95,0.92)");
      tg.addColorStop(1, "rgba(255,135,0,0)");
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.ellipse(0, 10, 3.2, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = "rgba(255,218,72,0.92)"; ctx.shadowBlur = 11;
      ctx.fillStyle = "#fff9de";
      ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 7.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ─── DRAW: ENEMY BULLETS ─────────────────────────────────────────────────────
  function drawEnemyBullets() {
    for (const eb of enemyBullets) {
      const [r, g, b] = eb.color;
      ctx.save();
      ctx.shadowColor = `rgba(${r},${g},${b},0.82)`;
      ctx.shadowBlur = 14;
      const og = ctx.createRadialGradient(eb.x, eb.y, 0, eb.x, eb.y, eb.r * 2.6);
      og.addColorStop(0, `rgba(${r},${g},${b},0.52)`);
      og.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r * 2.6, 0, Math.PI * 2); ctx.fill();
      const cg = ctx.createRadialGradient(eb.x - eb.r * 0.3, eb.y - eb.r * 0.3, 0, eb.x, eb.y, eb.r);
      cg.addColorStop(0, "rgba(255,255,255,0.97)");
      cg.addColorStop(0.38, `rgba(${r},${g},${b},0.92)`);
      cg.addColorStop(1, `rgba(${r * 0.28 | 0},${g * 0.28 | 0},${b * 0.28 | 0},0.82)`);
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ─── DRAW: PARTICLES ─────────────────────────────────────────────────────────
  function drawParticles() {
    for (const p of particles) {
      const t = p.life / p.maxLife;
      if (p.type === "ring") {
        const r = p.r + (p.maxR - p.r) * (1 - t);
        ctx.strokeStyle = `rgba(${p.color.join(",")},${t * 0.72})`;
        ctx.lineWidth = 3.5 * t;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      } else if (p.type === "flash") {
        const fr = p.r * (1 + (1 - t) * 2.2);
        const fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, fr);
        fg.addColorStop(0, `rgba(255,255,255,${t * 0.82})`);
        fg.addColorStop(0.28, `rgba(${p.color.join(",")},${t * 0.52})`);
        fg.addColorStop(1, `rgba(${p.color.join(",")},0)`);
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(p.x, p.y, fr, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === "spark") {
        const alpha = Math.min(1, t * 2.2);
        ctx.fillStyle = `rgba(${p.color.join(",")},${alpha})`;
        ctx.shadowColor = `rgba(${p.color.join(",")},${alpha * 0.5})`; ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * Math.max(0.08, t), 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      } else if (p.type === "debris") {
        const alpha = Math.min(1, t * 1.6);
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillStyle = `rgba(${p.color.join(",")},${alpha})`;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      } else {
        const alpha = Math.min(1, t * 2);
        ctx.fillStyle = `rgba(${p.color.join(",")},${alpha})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * Math.max(0.08, t), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  // ─── DRAW: BACKGROUND ────────────────────────────────────────────────────────
  function drawBackground() {
    ctx.fillStyle = "rgb(5,7,20)";
    ctx.fillRect(-22, -22, WIDTH + 44, HEIGHT + 44);
    drawNebulae();

    // Subtle converging depth lines
    const vpX = WIDTH / 2, vpY = HEIGHT * 0.44;
    const numLines = 18;
    const gridAlpha = 0.018 + 0.008 * Math.sin(animT * 0.38);
    ctx.strokeStyle = `rgba(65,105,205,${gridAlpha})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < numLines; i++) {
      const bx = (i / numLines) * WIDTH;
      ctx.beginPath(); ctx.moveTo(vpX, vpY); ctx.lineTo(bx, HEIGHT); ctx.stroke();
    }
    // Horizontal depth lines
    ctx.strokeStyle = `rgba(65,105,205,${gridAlpha * 0.65})`;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const gy = vpY + (HEIGHT - vpY) * Math.pow(t, 1.7);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(WIDTH, gy); ctx.stroke();
    }
  }

  // ─── DRAW: STARS ─────────────────────────────────────────────────────────────
  function drawAndUpdateStars(dt, speedMul) {
    for (const s of stars) {
      s.y += s.speed * dt * speedMul;
      s.twinkle += dt * 2.4;
      if (s.y > HEIGHT + 10) { s.y = -10 - Math.random() * 22; s.x = Math.random() * WIDTH; }
      const tAlpha = s.bright * (0.72 + 0.28 * Math.sin(s.twinkle));
      if (s.trail) {
        const trailLen = s.speed * dt * speedMul * 4.5;
        const tg = ctx.createLinearGradient(s.x, s.y - trailLen, s.x, s.y);
        tg.addColorStop(0, "rgba(195,215,255,0)");
        tg.addColorStop(1, `rgba(195,215,255,${tAlpha})`);
        ctx.strokeStyle = tg; ctx.lineWidth = s.r * 1.4;
        ctx.beginPath(); ctx.moveTo(s.x, s.y - trailLen); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      ctx.fillStyle = `rgba(195,215,255,${tAlpha})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ─── DRAW: HUD ───────────────────────────────────────────────────────────────
  function drawHUD() {
    ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 5;

    ctx.font = "bold 18px Segoe UI, Heebo, sans-serif";
    ctx.fillStyle = "rgba(208,225,255,0.96)";
    ctx.textAlign = "right";
    ctx.fillText(`ניקוד ${score}   חיסולים ${kills}   שלב ${wave}   ${tGame.toFixed(1)}ש`, WIDTH - 14, 30);
    ctx.shadowBlur = 0;

    // HP hearts
    ctx.textAlign = "left"; ctx.font = "24px sans-serif";
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < playerHp ? "#ff3a60" : "rgba(115,35,55,0.48)";
      ctx.fillText("♥", 14 + i * 29, 32);
    }

    // Powerup buffs
    const buff = [];
    if (shieldCharges) buff.push(`S×${shieldCharges}`);
    if (tGame < rapidUntil) buff.push("RAPID");
    if (tGame < spreadUntil) buff.push("SPREAD");
    if (buff.length) {
      ctx.font = "bold 14px Segoe UI, Heebo, sans-serif";
      ctx.fillStyle = "rgba(165,235,255,0.92)";
      ctx.textAlign = "left";
      ctx.fillText(buff.join("  "), 14, 55);
    }

    // Combo
    if (combo >= 3 && comboTimer > 0) {
      const ca = Math.min(1, comboTimer / 0.85);
      ctx.textAlign = "center";
      ctx.font = `bold ${18 + Math.min(combo, 10) * 1.6}px Segoe UI, sans-serif`;
      const cr = 255, cg2 = Math.max(55, 215 - combo * 13), cb2 = 55;
      ctx.fillStyle = `rgba(${cr},${cg2},${cb2},${ca})`;
      ctx.shadowColor = `rgba(${cr},${cg2},${cb2},0.55)`; ctx.shadowBlur = 10;
      ctx.fillText(`x${combo} COMBO`, WIDTH / 2, 98);
      ctx.shadowBlur = 0;
    }

    // Wave banner
    if (waveBanner > 0 && waveBannerText) {
      ctx.textAlign = "center";
      ctx.font = "bold 26px Segoe UI, Heebo, sans-serif";
      const alpha = Math.min(1, waveBanner * 2.6);
      ctx.fillStyle = `rgba(255,215,112,${alpha})`;
      ctx.shadowColor = "rgba(255,175,52,0.72)"; ctx.shadowBlur = 14;
      ctx.fillText(waveBannerText, WIDTH / 2, 66);
      ctx.shadowBlur = 0;
    }
  }

  // ─── DRAW: MENU ──────────────────────────────────────────────────────────────
  function drawMenu() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 56px Segoe UI, Heebo, sans-serif";
    const tg = ctx.createLinearGradient(WIDTH / 2 - 215, 0, WIDTH / 2 + 215, 0);
    tg.addColorStop(0, "#ff62aa");
    tg.addColorStop(0.48, "#b892ff");
    tg.addColorStop(1, "#55e2ff");
    ctx.fillStyle = tg;
    ctx.shadowColor = "rgba(152,95,255,0.55)"; ctx.shadowBlur = 22;
    ctx.fillText("חלליות — 3D", WIDTH / 2, 108);
    ctx.shadowBlur = 0;

    ctx.font = "19px Segoe UI, Heebo, sans-serif";
    ctx.fillStyle = "rgba(195,215,255,0.88)";
    const lines = [
      "חצים / A-D לתנועה · רווח לירייה · עכבר/מגע",
      "האויבים יורים בחזרה!  ♥ שלושה חיים",
      "אספקות: S=מגן  R=מהיר  X=פיזור  B=פצצה",
      "שלב חדש כל 9 חיסולים · בוס כל 5 שלבים",
      "רצף חיסולים מעלה מכפיל ניקוד!",
      "",
      "לחץ רווח להתחיל",
    ];
    let y = 175;
    for (const line of lines) {
      ctx.fillText(line, WIDTH / 2, y); y += 32;
    }

    ctx.textAlign = "right";
    ctx.font = "bold 19px Segoe UI, Heebo, sans-serif";
    ctx.fillStyle = "rgba(112,215,255,0.92)";
    ctx.fillText("לוח עליון:", WIDTH - 58, 360);
    ctx.font = "17px Segoe UI, Heebo, sans-serif";
    if (leaderboard && leaderboard.length) {
      let yy = 386;
      leaderboard.slice(0, 8).forEach((row, i) => {
        ctx.fillStyle = i < 3 ? "rgba(255,215,115,0.92)" : "rgba(172,195,228,0.82)";
        ctx.fillText(`${i + 1}. ${row.player_name} — ${row.score} (שלב ${row.wave_reached})`, WIDTH - 58, yy);
        yy += 26;
      });
    } else {
      ctx.fillStyle = "rgba(135,155,195,0.72)";
      ctx.fillText("(אין נתונים או השרת לא זמין)", WIDTH - 58, 386);
    }
    ctx.restore();
  }

  // ─── ENEMY SHOOTING ──────────────────────────────────────────────────────────
  function alienShoot(a, dt) {
    if (a.kind === "sniper" && a.anchoredY && a.y < a.anchoredY - 5) return;
    a.shootTimer = (a.shootTimer || 2) - dt;
    if (a.shootTimer > 0) return;
    const cds = { scout: 1.75, tank: 2.8, sniper: 1.45, grunt: 3.0 };
    a.shootTimer = (cds[a.kind] || 3) * (0.55 + Math.random() * 0.9);
    const dx = playerX - a.x, dy = playerY - a.y, d = Math.hypot(dx, dy);
    if (d === 0) return;
    const spds = { scout: 395, tank: 175, sniper: 530, grunt: 225 };
    const spd = spds[a.kind] || 260;
    if (a.kind === "tank") {
      for (const angle of [-0.3, 0, 0.3]) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        enemyBullets.push({
          x: a.x, y: a.y,
          vx: (dx / d * cos - dy / d * sin) * spd * 0.72,
          vy: (dx / d * sin + dy / d * cos) * spd * 0.72,
          r: 8.5, color: a.color, life: 4.5,
        });
      }
    } else {
      enemyBullets.push({
        x: a.x, y: a.y, vx: (dx / d) * spd, vy: (dy / d) * spd,
        r: a.kind === "sniper" ? 6.5 : 7.2, color: a.color, life: 4.5,
      });
    }
  }

  function bossShoot(b, dt) {
    b.shootTimer -= dt;
    if (b.shootTimer > 0) return;
    b.shootTimer = Math.max(0.55, 1.45 - wave * 0.038);
    const dx = playerX - b.x, dy = playerY - b.y, d = Math.hypot(dx, dy);
    if (d === 0) return;
    const spd = 275 + wave * 9;
    enemyBullets.push({ x: b.x, y: b.y, vx: dx / d * spd, vy: dy / d * spd, r: 13, color: [255, 115, 155], life: 5.5 });
    for (const off of [-0.38, 0.38]) {
      const cos = Math.cos(off), sin = Math.sin(off);
      enemyBullets.push({
        x: b.x, y: b.y,
        vx: (dx / d * cos - dy / d * sin) * spd * 0.78,
        vy: (dx / d * sin + dy / d * cos) * spd * 0.78,
        r: 9.5, color: [255, 158, 72], life: 5.5,
      });
    }
  }

  // ─── COLLISION RESOLUTION ────────────────────────────────────────────────────
  function resolveBulletHits() {
    const next = [];
    for (const b of bullets) {
      let consumed = false;
      if (boss && !consumed && dist(b.x, b.y, boss.x, boss.y) < boss.radius + 6) {
        boss.hp -= 1; bumpShake(2); consumed = true;
        particles.push({ type: "spark", x: b.x, y: b.y, vx: (Math.random() - 0.5) * 85, vy: -55 - Math.random() * 85, life: 0.22, maxLife: 0.22, color: [255, 175, 72], r: 4.5 });
        if (boss.hp <= 0) {
          for (const [ox, oy] of [[0, 0], [45, -22], [-32, 18]]) particles.push(...spawnExplosion(boss.x + ox, boss.y + oy, [255, 175, 72]));
          bumpShake(18);
          score += Math.round((420 + wave * 65) * comboMul());
          registerKill(); kills += 1;
          maybeDropPowerup(boss.x, boss.y);
          boss = null;
          waveBanner = 2.2; waveBannerText = "BOSS DESTROYED!";
        }
      }
      if (!consumed) {
        for (let i = 0; i < meteors.length; i++) {
          if (dist(b.x, b.y, meteors[i].x, meteors[i].y) < meteors[i].r + 6) {
            const m = meteors.splice(i, 1)[0];
            particles.push(...spawnExplosion(m.x, m.y, [148, 148, 175]));
            bumpShake(3); score += 8; consumed = true; break;
          }
        }
      }
      if (!consumed) {
        for (let i = 0; i < aliens.length; i++) {
          const a = aliens[i];
          if (dist(b.x, b.y, a.x, a.y) < a.radius + 5) {
            a.hp -= 1; consumed = true;
            particles.push({ type: "spark", x: b.x, y: b.y, vx: (Math.random() - 0.5) * 125, vy: -65 - Math.random() * 85, life: 0.18, maxLife: 0.18, color: a.color, r: 3.2 });
            if (a.hp <= 0) {
              particles.push(...spawnExplosion(a.x, a.y, a.color));
              bumpShake(4); registerKill(); kills += 1;
              const base = 10 + wave * 2 + (a.kind === "tank" ? 22 : a.kind === "sniper" ? 16 : a.kind === "scout" ? 8 : 12);
              score += Math.round(base * comboMul());
              maybeDropPowerup(a.x, a.y);
              aliens.splice(i, 1);
              if (kills > 0 && kills % 9 === 0) {
                wave += 1;
                waveBanner = 1.6; waveBannerText = `Wave ${wave}!`;
                if (wave % 5 === 0 && !boss) {
                  boss = makeBoss(wave);
                  waveBanner = 2.4; waveBannerText = "BOSS INCOMING!";
                }
              }
            }
            break;
          }
        }
      }
      if (!consumed) next.push(b);
    }
    bullets = next;
  }

  function updateEnemyBullets(dt) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const eb = enemyBullets[i];
      eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
      if (eb.life <= 0 || eb.y > HEIGHT + 25 || eb.y < -25 || eb.x < -25 || eb.x > WIDTH + 25) {
        enemyBullets.splice(i, 1); continue;
      }
      if (dist(eb.x, eb.y, playerX, playerY) < eb.r + playerR - 10) {
        enemyBullets.splice(i, 1);
        playerHit();
      }
    }
  }

  function updatePickups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += p.vy * dt;
      p.x += Math.sin(tGame * 3.1 + p.wobble) * 52 * dt;
      if (dist(p.x, p.y, playerX, playerY) < playerR + 26) {
        if (p.kind === "SHIELD") shieldCharges = Math.min(3, shieldCharges + 1);
        else if (p.kind === "RAPID") rapidUntil = tGame + 9;
        else if (p.kind === "SPREAD") spreadUntil = tGame + 8;
        else if (p.kind === "BOMB") {
          for (const a of aliens) { particles.push(...spawnExplosion(a.x, a.y, a.color)); kills += 1; registerKill(); score += Math.round(18 * comboMul()); }
          if (aliens.length > 0) bumpShake(9);
          aliens = [];
          waveBanner = 1.3; waveBannerText = "BOMB!";
        }
        particles.push(...spawnExplosion(p.x, p.y, [195, 255, 255]));
        powerups.splice(i, 1);
      } else if (p.y > HEIGHT + 32) {
        powerups.splice(i, 1);
      }
    }
  }

  function checkPlayerHits() {
    for (let i = meteors.length - 1; i >= 0; i--) {
      if (dist(meteors[i].x, meteors[i].y, playerX, playerY) < meteors[i].r + playerR) {
        meteors.splice(i, 1);
        playerHit();
        if (state === "gameover") return;
      }
    }
    for (let i = aliens.length - 1; i >= 0; i--) {
      const a = aliens[i];
      if (dist(a.x, a.y, playerX, playerY) < a.radius + playerR - 9) {
        aliens.splice(i, 1);
        particles.push(...spawnExplosion(a.x, a.y, a.color));
        playerHit();
        if (state === "gameover") return;
      }
      if (a.y > HEIGHT - 38) { triggerGameOver(); return; }
    }
    if (boss && dist(boss.x, boss.y, playerX, playerY) < boss.radius + playerR) {
      playerHit();
    }
  }

  // ─── MAIN TICK ───────────────────────────────────────────────────────────────
  let last = performance.now() / 1000;

  function tick(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(0.05, now - last);
    last = now;
    animT += dt;

    if (shakeT > 0) { shakeT -= dt; shake *= 0.87; if (shakeT <= 0) shake = 0; } else shake *= 0.8;
    const sx = (Math.random() - 0.5) * shake * 2;
    const sy = (Math.random() - 0.5) * shake * 2;

    ctx.setTransform(scaleX, 0, 0, scaleY, sx * scaleX, sy * scaleY);
    drawBackground();

    const starSpeed = state === "play" ? 1 + (wave - 1) * 0.032 : 0.32;

    if (state === "play") {
      tGame = now - runT0;
      waveBanner = Math.max(0, waveBanner - dt);
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }
      playerInvT = Math.max(0, playerInvT - dt);
      hitFlash = Math.max(0, hitFlash - dt);

      // Player movement
      const pace = stagePaceMul(wave);
      const spd = 445 * dt * pace;
      let moved = false;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) {
        playerX -= spd; tilt = Math.min(14, tilt + 135 * dt); moved = true;
      } else if (keys.has("ArrowRight") || keys.has("KeyD")) {
        playerX += spd; tilt = Math.max(-14, tilt - 135 * dt); moved = true;
      }
      if (!moved) {
        const target = Math.max(54, Math.min(WIDTH - 54, pointerX));
        const dx = target - playerX;
        if (Math.abs(dx) > 2) {
          playerX += Math.sign(dx) * Math.min(Math.abs(dx), spd * 1.12);
          tilt += Math.sign(dx) * 105 * dt;
          tilt = Math.max(-14, Math.min(14, tilt));
        } else tilt *= 0.87;
      } else pointerX = playerX;
      if (keys.has("ArrowLeft") || keys.has("KeyA") || keys.has("ArrowRight") || keys.has("KeyD")) pointerX = playerX;
      playerX = Math.max(54, Math.min(WIDTH - 54, playerX));
      if (!moved) tilt *= 0.87;

      shootCd = Math.max(0, shootCd - dt);
      if (keys.has("Space") || keys.has("Enter")) tryFire();

      if (boss) {
        if (boss.y < boss.anchorY) boss.y += boss.vy * dt;
        boss.x = WIDTH / 2 + Math.sin(tGame * 1.28 + (boss.phase || 0)) * (WIDTH * 0.38 - boss.radius);
        boss.ringAngle = (boss.ringAngle || 0) + dt * 1.45;
        bossShoot(boss, dt);
      }

      meteorTimer -= dt;
      if (meteorTimer <= 0) {
        const pM = stagePaceMul(wave);
        meteorTimer = (1.75 + Math.random() * 3.8) / Math.min(1.42, pM * 0.9);
        meteors.push({
          x: 42 + Math.random() * (WIDTH - 84), y: -55,
          vy: (82 + Math.random() * 72) * (0.84 + 0.16 * pM),
          r: 17 + Math.random() * 22, rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 2.6, seed: Math.random() * 10,
        });
      }

      const cap = boss ? Math.min(3, 2 + ((wave / 4) | 0)) : Math.min(14 + wave * 2, 38);
      spawnTimer -= dt;
      if (aliens.length < cap && spawnTimer <= 0 && !boss) {
        const pS = stagePaceMul(wave);
        spawnTimer = Math.max(0.2, (1.18 - wave * 0.05) / Math.min(1.3, pS * 0.95));
        aliens.push(makeAlien(wave));
      }

      for (const b of bullets) { b.y += b.vy * dt; if (b.vx) b.x += b.vx * dt; }
      bullets = bullets.filter(b => b.y > -32 && b.x > -55 && b.x < WIDTH + 55);

      const pA = stagePaceMul(wave);
      const baseSy = (44 + wave * 10.5 + wave * wave * 0.19) * pA;
      for (const a of aliens) {
        if (a.kind === "sniper" && a.anchoredY) {
          if (a.y < a.anchoredY) a.y += baseSy * a.speedMul * dt;
          a.x += Math.sin(tGame * 1.55 + a.phase) * a.sinAmp * dt;
        } else {
          a.y += baseSy * a.speedMul * dt;
          a.x += Math.sin(tGame * 2.18 + a.phase) * a.sinAmp * dt;
        }
        a.x = Math.max(a.radius + 12, Math.min(WIDTH - a.radius - 12, a.x));
        alienShoot(a, dt);
      }

      for (const m of meteors) { m.y += m.vy * dt; m.rot += m.vr * dt; }
      meteors = meteors.filter(m => m.y < HEIGHT + 108);

      resolveBulletHits();
      updateEnemyBullets(dt);
      updatePickups(dt);
      checkPlayerHits();

      particles = particles.filter(p => {
        p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
        p.life -= dt; p.vx = (p.vx || 0) * 0.982; p.vy = (p.vy || 0) * 0.982;
        if (p.rot !== undefined) p.rot += (p.vrot || 0) * dt;
        return p.life > 0;
      });
    } else {
      particles = particles.filter(p => { p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; p.life -= dt; return p.life > 0; });
    }

    drawAndUpdateStars(dt, starSpeed);

    if (state === "play" || state === "gameover") {
      for (const m of meteors) drawMeteor(m);
      drawEnemyBullets();
      drawBullets();
      for (const a of aliens) drawAlien(a);
      if (boss) drawBoss(boss);
      for (const p of powerups) drawPowerup(p);
      drawShip(playerX, playerY, tilt, wave);
      drawParticles();
      if (hitFlash > 0) {
        ctx.fillStyle = `rgba(255,22,22,${hitFlash * 0.38})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
    }

    if (state === "play") {
      drawHUD();
    } else if (state === "gameover") {
      ctx.fillStyle = "rgba(5,7,20,0.68)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else if (state === "menu") {
      drawMenu();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    requestAnimationFrame(tick);
  }

  // ─── INIT ────────────────────────────────────────────────────────────────────
  resizeGameCanvas();
  window.addEventListener("load", resizeGameCanvas);
  refreshMeta().then(() => {
    last = performance.now() / 1000;
    requestAnimationFrame(tick);
  });
})();
