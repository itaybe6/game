(() => {
  const API = "/api";
  const WIDTH = 960;
  const HEIGHT = 640;
  const SPACE = [12, 18, 42];
  const STAR_LOW = [180, 200, 255];
  const HUD = [230, 240, 255];

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const canvasRoot = canvas.parentElement;
  const serverLine = document.getElementById("server-line");
  const goOverlay = document.getElementById("go-overlay");
  const goStats = document.getElementById("go-stats");
  const playerNameInput = document.getElementById("player-name");
  const goMsg = document.getElementById("go-msg");
  const btnSave = document.getElementById("btn-save");
  const btnSkip = document.getElementById("btn-skip");

  let scaleX = 1;
  let scaleY = 1;

  function resizeGameCanvas() {
    if (!canvasRoot) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, canvasRoot.clientWidth);
    const ch = Math.max(1, canvasRoot.clientHeight);
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    scaleX = canvas.width / WIDTH;
    scaleY = canvas.height / HEIGHT;
  }

  window.addEventListener("resize", resizeGameCanvas);

  const keys = new Set();
  let pointerX = WIDTH / 2;
  let shake = 0;
  let shakeT = 0;
  let gameDt = 0.016;

  let state = "menu";

  function toCanvasCoords(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * WIDTH;
    const y = ((clientY - r.top) / r.height) * HEIGHT;
    return { x, y };
  }

  window.addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (state === "menu" && e.code === "Space" && !e.repeat) startRun();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function stagePaceMul(w) {
    const waveNum = Math.max(1, w);
    return 1 + Math.min(1.15, (waveNum - 1) * 0.085);
  }

  function makeStars(n = 120) {
    const stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT,
        speed: 18 + Math.random() * 92,
        r: 1 + (Math.random() > 0.65 ? 1 : 0),
      });
    }
    return stars;
  }

  function spawnExplosion(px, py, color) {
    const parts = [];
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 90 + Math.random() * 180;
      parts.push({
        x: px,
        y: py,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0.35 + Math.random() * 0.45,
        color,
        r: 3 + ((Math.random() * 4) | 0),
      });
    }
    for (let i = 0; i < 12; i++) {
      parts.push({
        x: px + (Math.random() - 0.5) * 14,
        y: py + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 90,
        vy: -30 - Math.random() * 110,
        life: 0.55 + Math.random() * 0.45,
        color: [255, 240, 200],
        r: 2,
      });
    }
    return parts;
  }

  function bumpShake(amount) {
    shake = Math.min(16, shake + amount);
    shakeT = 0.38;
  }

  let stars = makeStars();
  let leaderboard = null;
  let serverOk = false;

  let playerX = WIDTH / 2;
  let playerY = HEIGHT - 96;
  const playerR = 28;
  let tilt = 0;
  let bullets = [];
  let aliens = [];
  let meteors = [];
  let powerups = [];
  let particles = [];
  let boss = null;
  let spawnTimer = 0;
  let meteorTimer = 3;
  let shootCd = 0;
  let wave = 1;
  let kills = 0;
  let score = 0;
  let runT0 = 0;
  let waveBanner = 0;
  let waveBannerText = "";
  let tGame = 0;
  let goSaved = false;
  let shieldCharges = 0;
  let rapidUntil = 0;
  let spreadUntil = 0;

  function baseShootCd() {
    return tGame < rapidUntil ? 0.085 : 0.175;
  }

  function tryFire() {
    if (shootCd > 0) return;
    const cd = baseShootCd();
    const spread = tGame < spreadUntil;
    if (spread) {
      bullets.push({ x: playerX, y: playerY - 28, vy: -720 });
      bullets.push({ x: playerX - 22, y: playerY - 18, vy: -690, vx: -55 });
      bullets.push({ x: playerX + 22, y: playerY - 18, vy: -690, vx: 55 });
    } else {
      bullets.push({ x: playerX, y: playerY - 30, vy: -720, vx: 0 });
    }
    shootCd = cd;
  }

  canvas.addEventListener("mousemove", (e) => {
    if (state === "play") pointerX = toCanvasCoords(e.clientX, e.clientY).x;
  });
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (state !== "play") return;
      e.preventDefault();
      const t = e.touches[0];
      pointerX = toCanvasCoords(t.clientX, t.clientY).x;
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (state !== "play") return;
      e.preventDefault();
      const t = e.changedTouches[0];
      pointerX = toCanvasCoords(t.clientX, t.clientY).x;
      tryFire();
    },
    { passive: false }
  );

  function rollAlienKind(w) {
    const r = Math.random();
    if (w >= 3 && r < 0.14) return "tank";
    if (r < 0.26) return "scout";
    return "grunt";
  }

  function rollAlienShape(w) {
    const r = Math.random();
    if (w <= 2) return r < 0.82 ? "circle" : "diamond";
    if (w <= 4) {
      if (r < 0.38) return "circle";
      if (r < 0.68) return "diamond";
      return "hex";
    }
    if (w <= 6) {
      if (r < 0.22) return "circle";
      if (r < 0.48) return "diamond";
      if (r < 0.72) return "hex";
      return "star";
    }
    const hi = ["circle", "diamond", "hex", "star", "crystal"];
    return hi[(Math.random() * hi.length) | 0];
  }

  function makeAlien(w) {
    const kind = rollAlienKind(w);
    const shape = rollAlienShape(w);
    const x = 70 + Math.random() * (WIDTH - 140);
    const y = -12 - Math.random() * 36;
    const phase = Math.random() * Math.PI * 2;
    if (kind === "scout") {
      return {
        x,
        y,
        phase,
        kind,
        shape,
        radius: 19,
        hp: 1,
        maxHp: 1,
        speedMul: 1.42,
        sinAmp: 54,
        color: [110, 235, 255],
      };
    }
    if (kind === "tank") {
      return {
        x,
        y,
        phase,
        kind,
        shape,
        radius: 34,
        hp: 4,
        maxHp: 4,
        speedMul: 0.5,
        sinAmp: 26,
        color: [255, 130, 175],
      };
    }
    return {
      x,
      y,
      phase,
      kind: "grunt",
      shape,
      radius: 26,
      hp: 1,
      maxHp: 1,
      speedMul: 1,
      sinAmp: 42,
      color: [[170, 120, 255], [120, 220, 170], [255, 190, 120], [120, 190, 255]][(Math.random() * 4) | 0],
    };
  }

  function makeBoss(w) {
    return {
      x: WIDTH / 2,
      y: -120,
      phase: Math.random() * Math.PI * 2,
      hp: 48 + w * 12,
      maxHp: 48 + w * 12,
      radius: 74,
      vy: 22 + w * 0.8,
      anchorY: 118,
    };
  }

  function maybeDropPowerup(x, y) {
    if (Math.random() > 0.13) return;
    const kinds = ["SHIELD", "RAPID", "SPREAD"];
    const kind = kinds[(Math.random() * kinds.length) | 0];
    powerups.push({
      x,
      y,
      vy: 95 + Math.random() * 55,
      kind,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  async function ping() {
    try {
      const r = await fetch(`${API}/health`, { method: "GET" });
      return r.ok;
    } catch {
      return false;
    }
  }

  async function fetchScores(limit = 8) {
    try {
      const r = await fetch(`${API}/scores?limit=${limit}`);
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  async function submitScore(payload) {
    try {
      const r = await fetch(`${API}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return r.ok;
    } catch {
      return false;
    }
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

  async function refreshMeta() {
    serverOk = await ping();
    leaderboard = await fetchScores(8);
    setServerLine();
  }

  function hideGoOverlay() {
    goOverlay.classList.add("hidden");
    goOverlay.setAttribute("aria-hidden", "true");
    canvas.focus();
  }

  function showGoOverlay() {
    goStats.innerHTML = "";
    const lines = [
      `ניקוד: ${score}`,
      `חיסולים: ${kills}`,
      `שלב מקסימלי: ${wave}`,
      `זמן משחק: ${tGame.toFixed(1)} שניות`,
    ];
    for (const t of lines) {
      const li = document.createElement("li");
      li.textContent = t;
      goStats.appendChild(li);
    }
    playerNameInput.value = "";
    goMsg.textContent = "";
    goSaved = false;
    goOverlay.classList.remove("hidden");
    goOverlay.setAttribute("aria-hidden", "false");
    playerNameInput.focus();
  }

  function triggerGameOver() {
    particles.push(...spawnExplosion(playerX, playerY, [255, 120, 160]));
    bumpShake(12);
    state = "gameover";
    showGoOverlay();
  }

  function consumeShieldOrDie() {
    if (shieldCharges > 0) {
      shieldCharges -= 1;
      bumpShake(5);
      particles.push(...spawnExplosion(playerX, playerY, [120, 220, 255]));
      return true;
    }
    triggerGameOver();
    return false;
  }

  btnSave.addEventListener("click", async () => {
    if (goSaved) return;
    const name = (playerNameInput.value || "אנונימי").trim() || "אנונימי";
    const ok = await submitScore({
      player_name: name,
      score: Math.floor(score),
      kills: Math.floor(kills),
      wave_reached: Math.max(1, Math.floor(wave)),
      duration_seconds: Math.round(tGame * 100) / 100,
    });
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
    playerX = WIDTH / 2;
    playerY = HEIGHT - 96;
    bullets = [];
    aliens = [];
    meteors = [];
    powerups = [];
    particles = [];
    boss = null;
    spawnTimer = 0;
    meteorTimer = 2.2;
    shootCd = 0;
    wave = 1;
    kills = 0;
    score = 0;
    runT0 = performance.now() / 1000;
    waveBanner = 1.15;
    waveBannerText = "שלב 1 — קצב בסיסי";
    tGame = 0;
    tilt = 0;
    shieldCharges = 0;
    rapidUntil = 0;
    spreadUntil = 0;
    state = "play";
    canvas.focus();
  }

  function shipThemeForWave(w) {
    const s = Math.max(1, Math.min(8, w));
    const themes = [
      { body: [255, 140, 190], accent: [120, 220, 255], glow: "#ffd0e8", fin: "classic" },
      { body: [130, 220, 255], accent: [255, 180, 230], glow: "#d8f8ff", fin: "classic" },
      { body: [255, 200, 120], accent: [180, 120, 255], glow: "#fff0c8", fin: "twin" },
      { body: [160, 255, 190], accent: [255, 120, 160], glow: "#e0ffe8", fin: "delta" },
      { body: [220, 140, 255], accent: [120, 255, 220], glow: "#f0d8ff", fin: "wide" },
      { body: [255, 150, 120], accent: [100, 200, 255], glow: "#ffe8d8", fin: "twin" },
      { body: [100, 255, 200], accent: [255, 100, 180], glow: "#c8ffe8", fin: "delta" },
      { body: [240, 240, 255], accent: [255, 80, 200], glow: "#ffffff", fin: "saucer" },
    ];
    return themes[s - 1];
  }

  function drawShipEngines(yBase, accRgb, bodyRgb, waveNum) {
    const flicker = 0.65 + 0.35 * Math.sin(tGame * 22);
    const len = 28 + flicker * 12;
    const hw = 9 + waveNum * 0.25;
    for (const side of [-1, 1]) {
      const ox = side * 24;
      const gy = ctx.createLinearGradient(ox, yBase + 4, ox, yBase + len + 16);
      gy.addColorStop(0, `rgba(${accRgb.join(",")},0.98)`);
      gy.addColorStop(0.4, `rgba(${bodyRgb.join(",")},0.6)`);
      gy.addColorStop(1, "rgba(60,120,255,0)");
      ctx.fillStyle = gy;
      ctx.beginPath();
      ctx.moveTo(ox - hw, yBase + 4);
      ctx.lineTo(ox, yBase + len + 12);
      ctx.lineTo(ox + hw, yBase + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.beginPath();
      ctx.ellipse(ox, yBase + 8, 4.2, 6.5 + flicker * 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawShip(x, y, tiltDeg, waveNum) {
    const th = shipThemeForWave(waveNum);
    const bodyRgb = th.body;
    const accRgb = th.accent;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((tiltDeg * Math.PI) / 180);
    const w = 86;
    const h = 52;

    drawShipEngines(h / 2 - 2, accRgb, bodyRgb, waveNum);

    ctx.shadowColor = th.glow;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    if (th.fin === "saucer") {
      ctx.ellipse(0, 4, w / 2 + 4, h / 2 - 6, 0, 0, Math.PI * 2);
    } else if (th.fin === "delta") {
      ctx.moveTo(0, -h / 2 - 4);
      ctx.lineTo(w / 2 + 2, h / 2 - 4);
      ctx.lineTo(0, h / 2 - 8);
      ctx.lineTo(-w / 2 - 2, h / 2 - 4);
      ctx.closePath();
    } else if (th.fin === "wide") {
      ctx.ellipse(0, 2, w / 2 + 10, h / 2 - 4, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    }
    const g = ctx.createRadialGradient(-14, -10, 6, 0, 2, 58);
    g.addColorStop(0, th.glow);
    g.addColorStop(0.45, `rgb(${bodyRgb.join(",")})`);
    g.addColorStop(1, `rgb(${Math.floor(bodyRgb[0] * 0.45)},${Math.floor(bodyRgb[1] * 0.42)},${Math.floor(bodyRgb[2] * 0.55)})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = waveNum >= 6 ? "rgba(180,255,255,0.55)" : "rgba(255,255,255,0.32)";
    ctx.lineWidth = waveNum >= 6 ? 3 : 2;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 16, -4);
    ctx.lineTo(w / 2 - 16, -4);
    ctx.stroke();

    ctx.fillStyle = `rgb(${accRgb.join(",")})`;
    ctx.beginPath();
    if (th.fin === "twin") {
      ctx.moveTo(0, -h / 2 - 8);
      ctx.lineTo(14, -2);
      ctx.lineTo(-14, -2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-22, -h / 2 + 8);
      ctx.lineTo(-8, 6);
      ctx.lineTo(-28, 10);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(22, -h / 2 + 8);
      ctx.lineTo(8, 6);
      ctx.lineTo(28, 10);
      ctx.closePath();
    } else {
      ctx.moveTo(0, -h / 2 - 6);
      ctx.lineTo(18, -4);
      ctx.lineTo(-18, -4);
      ctx.closePath();
    }
    ctx.fill();

    const cg = ctx.createLinearGradient(-10, -h / 2 - 2, 12, -h / 2 + 14);
    cg.addColorStop(0, "rgba(200,240,255,0.55)");
    cg.addColorStop(0.5, "rgba(120,200,255,0.25)");
    cg.addColorStop(1, "rgba(40,80,120,0.15)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, -h / 2 + 10, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${Math.floor(bodyRgb[0] * 0.35)},${Math.floor(bodyRgb[1] * 0.35)},${Math.floor(bodyRgb[2] * 0.45)},0.92)`;
    ctx.beginPath();
    roundRect(ctx, -w / 2 + 10, 2, 18, 18, 6);
    ctx.fill();
    ctx.beginPath();
    roundRect(ctx, w / 2 - 28, 2, 18, 18, 6);
    ctx.fill();

    ctx.fillStyle = "rgba(255,60,120,0.75)";
    ctx.beginPath();
    ctx.arc(-w / 2 + 19, 11, 3, 0, Math.PI * 2);
    ctx.arc(w / 2 - 19, 11, 3, 0, Math.PI * 2);
    ctx.fill();

    if (shieldCharges > 0) {
      ctx.strokeStyle = "rgba(120,240,255,0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, w / 2 + 10 + Math.sin(tGame * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function alienSilhouettePath(x, y, rad, shape, rotation = 0) {
    ctx.beginPath();
    if (shape === "circle" || !shape) {
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      return;
    }
    if (shape === "diamond") {
      const s = rad * 1.06;
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
      return;
    }
    if (shape === "hex") {
      for (let i = 0; i < 6; i++) {
        const ang = rotation + (i / 6) * Math.PI * 2 - Math.PI / 2;
        const px = x + Math.cos(ang) * rad;
        const py = y + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      return;
    }
    if (shape === "star") {
      const pts = 5;
      const inner = rad * 0.42;
      const outer = rad * 1.02;
      for (let i = 0; i < pts * 2; i++) {
        const rr = i % 2 === 0 ? outer : inner;
        const ang = rotation + (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
        const px = x + Math.cos(ang) * rr;
        const py = y + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      return;
    }
    if (shape === "crystal") {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const ang = rotation + (i / n) * Math.PI * 2;
        const jitter = 0.72 + 0.28 * Math.sin(i * 3.1 + rotation * 2);
        const rr = rad * jitter;
        const px = x + Math.cos(ang) * rr;
        const py = y + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      return;
    }
    ctx.arc(x, y, rad, 0, Math.PI * 2);
  }

  function drawEvilAlienFace(x, y, rad, a) {
    const kind = a.kind || "grunt";
    const blink = 0.85 + 0.15 * Math.sin(tGame * 5 + a.phase);
    const eo = Math.max(5, rad * 0.3);
    const eyeR = rad * 0.24 * blink;
    const pup = rad * 0.11;

    ctx.fillStyle = "rgba(40,0,20,0.5)";
    ctx.beginPath();
    ctx.moveTo(x - eo - 4, y - 4);
    ctx.lineTo(x - eo + 6, y - 10);
    ctx.lineTo(x - 2, y - 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + eo + 4, y - 4);
    ctx.lineTo(x + eo - 6, y - 10);
    ctx.lineTo(x + 2, y - 6);
    ctx.closePath();
    ctx.fill();

    const eyeGlow = ctx.createRadialGradient(x - eo, y - 3, 1, x - eo, y - 2, eyeR + 2);
    eyeGlow.addColorStop(0, "#ffefa8");
    eyeGlow.addColorStop(0.55, "#ff3060");
    eyeGlow.addColorStop(1, "#400018");
    ctx.fillStyle = eyeGlow;
    ctx.beginPath();
    ctx.ellipse(x - eo, y - 2, eyeR * 0.85, eyeR, -0.15, 0, Math.PI * 2);
    ctx.ellipse(x + eo, y - 2, eyeR * 0.85, eyeR, 0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0a0208";
    ctx.beginPath();
    ctx.arc(x - eo + 2, y + 1, pup, 0, Math.PI * 2);
    ctx.arc(x + eo - 2, y + 1, pup, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(x - eo - 3, y - 5, rad * 0.06, 0, Math.PI * 2);
    ctx.arc(x + eo + 3, y - 5, rad * 0.06, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(80,0,30,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - eo * 0.5, y + rad * 0.08);
    ctx.lineTo(x, y + rad * 0.16);
    ctx.lineTo(x + eo * 0.5, y + rad * 0.08);
    ctx.stroke();

    const teethN = kind === "tank" ? 7 : 5;
    ctx.fillStyle = "rgba(255,240,230,0.92)";
    for (let i = 0; i < teethN; i++) {
      const t = i / (teethN - 1) - 0.5;
      const tx = x + t * rad * 0.72;
      const ty = y + rad * 0.28 + Math.abs(t) * 4;
      ctx.beginPath();
      ctx.moveTo(tx - 4, ty);
      ctx.lineTo(tx, ty + 8 + (kind === "tank" ? 4 : 0));
      ctx.lineTo(tx + 4, ty);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,60,90,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + rad * 0.26, rad * 0.52, (205 * Math.PI) / 180, (335 * Math.PI) / 180);
    ctx.stroke();

    if (kind === "scout") {
      ctx.strokeStyle = "rgba(255,200,120,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - rad * 0.55);
      ctx.lineTo(x - 3, y - rad * 0.95);
      ctx.lineTo(x + 3, y - rad * 0.95);
      ctx.closePath();
      ctx.stroke();
    }
  }

  function drawAlienExtras(a, rad, rot) {
    const { x, y } = a;
    const kind = a.kind || "grunt";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot * 0.4);
    if (kind === "tank") {
      ctx.strokeStyle = "rgba(60,20,40,0.55)";
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const ry = -rad * 0.4 + i * (rad * 0.35);
        ctx.beginPath();
        ctx.moveTo(-rad * 0.85, ry);
        ctx.lineTo(rad * 0.85, ry);
        ctx.stroke();
      }
    } else if (kind === "scout") {
      ctx.strokeStyle = "rgba(255,160,200,0.55)";
      ctx.lineWidth = 2;
      for (let s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * rad * 0.35, -rad * 0.2);
        ctx.quadraticCurveTo(s * rad * 1.05, -rad * 0.55, s * rad * 0.75, -rad * 0.05);
        ctx.stroke();
      }
    } else {
      const tent = 4;
      ctx.strokeStyle = "rgba(180,100,255,0.45)";
      ctx.lineWidth = 2;
      for (let i = 0; i < tent; i++) {
        const ang = (i / tent) * Math.PI * 2 + tGame * 1.5 + a.phase;
        const len = rad * (0.55 + 0.08 * Math.sin(tGame * 3 + i));
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * rad * 0.5, Math.sin(ang) * rad * 0.5);
        ctx.quadraticCurveTo(
          Math.cos(ang) * rad * 0.95,
          Math.sin(ang) * rad * 0.95,
          Math.cos(ang) * (rad + len),
          Math.sin(ang) * (rad + len)
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawAlien(a) {
    const { x, y, radius: rad, color } = a;
    const shape = a.shape || "circle";
    const rot = a.phase * 0.15 + tGame * (shape === "crystal" ? 0.7 : 0.25);
    ctx.save();
    ctx.shadowColor = `rgb(${Math.min(255, color[0] + 40)},${color[1]},${color[2]})`;
    ctx.shadowBlur = shape === "star" || shape === "crystal" ? 16 : 10;
    alienSilhouettePath(x, y, rad, shape, rot);
    const ag = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, 3, x, y, rad * 1.15);
    ag.addColorStop(0, "#ffffff66");
    ag.addColorStop(0.28, `rgb(${color.join(",")})`);
    ag.addColorStop(0.72, `rgb(${Math.floor(color[0] * 0.35)},${Math.floor(color[1] * 0.28)},${Math.floor(color[2] * 0.42)})`);
    ag.addColorStop(1, "#140818");
    ctx.fillStyle = ag;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle =
      shape === "star" || shape === "crystal"
        ? "rgba(255,210,150,0.9)"
        : "rgba(255,80,120,0.55)";
    ctx.lineWidth = shape === "hex" ? 3.5 : 2.5;
    ctx.stroke();
    ctx.restore();

    drawAlienExtras(a, rad, rot);

    alienSilhouettePath(x, y, rad * 0.98, shape, rot);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    drawEvilAlienFace(x, y, rad, a);
    if (a.maxHp > 1) {
      const ratio = a.hp / a.maxHp;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x - rad, y - rad - 10, rad * 2, 5);
      ctx.fillStyle = ratio > 0.35 ? "#7cf0ff" : "#ff7eb3";
      ctx.fillRect(x - rad, y - rad - 10, rad * 2 * ratio, 5);
    }
  }

  function drawBoss(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const rad = b.radius;
    const pulse = 0.92 + 0.08 * Math.sin(tGame * 2.2 + b.phase);

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + tGame * 0.6;
      const dist = rad * 1.08;
      const sx = Math.cos(ang) * dist;
      const sy = Math.sin(ang) * dist;
      const gr = ctx.createRadialGradient(sx, sy, 2, sx, sy, 18);
      gr.addColorStop(0, "rgba(255,120,160,0.9)");
      gr.addColorStop(1, "rgba(80,0,40,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(sx, sy, 10 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 0, rad * 1.02, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,140,90,0.35)";
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    const ag = ctx.createRadialGradient(-22, -26, 10, 0, 0, rad);
    ag.addColorStop(0, "#ffc8e8");
    ag.addColorStop(0.35, "#a05090");
    ag.addColorStop(0.7, "#402058");
    ag.addColorStop(1, "#120818");
    ctx.fillStyle = ag;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,220,160,0.95)";
    ctx.lineWidth = 4;
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = i % 2 === 0 ? "rgba(90,30,60,0.9)" : "rgba(40,20,50,0.85)";
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (rad * 0.55), Math.sin(a) * (rad * 0.55));
      ctx.lineTo(Math.cos(a + 0.25) * (rad * 1.05), Math.sin(a + 0.25) * (rad * 1.05));
      ctx.lineTo(Math.cos(a - 0.25) * (rad * 1.05), Math.sin(a - 0.25) * (rad * 1.05));
      ctx.closePath();
      ctx.fill();
    }

    drawEvilAlienFace(0, 0, rad, { kind: "tank", phase: b.phase });
    const ratio = b.hp / b.maxHp;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(-rad, -rad - 14, rad * 2, 7);
    ctx.fillStyle = "#7cf0ff";
    ctx.fillRect(-rad, -rad - 14, rad * 2 * ratio, 7);
    ctx.restore();
  }

  function drawMeteor(m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.rot);
    ctx.fillStyle = "#4a4a62";
    ctx.strokeStyle = "rgba(200,200,230,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const pts = 7;
    for (let i = 0; i < pts; i++) {
      const ang = (i / pts) * Math.PI * 2;
      const rr = m.r * (0.78 + 0.22 * Math.sin(i * 2.1 + m.seed));
      const px = Math.cos(ang) * rr;
      const py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawPowerup(p) {
    const s = 14 + Math.sin(tGame * 5 + p.wobble) * 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(tGame * 2.2 + p.wobble);
    let fill = "#fff";
    if (p.kind === "SHIELD") fill = "#7cf0ff";
    if (p.kind === "RAPID") fill = "#ffd080";
    if (p.kind === "SPREAD") fill = "#c8a0ff";
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBullets() {
    for (const b of bullets) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 9);
      g.addColorStop(0, "#fff8c8");
      g.addColorStop(1, "#ffc04000");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,200,60,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawMenu() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 52px Segoe UI, Heebo, sans-serif";
    const tg = ctx.createLinearGradient(WIDTH / 2 - 140, 0, WIDTH / 2 + 140, 0);
    tg.addColorStop(0, "#ff9ecf");
    tg.addColorStop(1, "#7cf0ff");
    ctx.fillStyle = tg;
    ctx.fillText("חלליות חמודות", WIDTH / 2, 115);

    ctx.font = "24px Segoe UI, Heebo, sans-serif";
    ctx.fillStyle = `rgb(${HUD.join(",")})`;
    const lines = [
      "חצים / A-D · רווח לירייה · עכבר/מגע",
      "אסטרואידים, טנקים, בייגלים מהירים — שלב חדש כל 9 חיסולים · בוס כל 5 שלבים",
      "אספקות: מגן / ירייה מהירה / שלוש כיוונים",
      "",
      "לחץ רווח כדי להתחיל",
    ];
    let y = 185;
    for (const line of lines) {
      ctx.fillText(line, WIDTH / 2, y);
      y += 30;
    }

    ctx.textAlign = "right";
    ctx.font = "22px Segoe UI, Heebo, sans-serif";
    ctx.fillText("לוח עליון:", WIDTH - 60, 360);
    if (leaderboard && leaderboard.length) {
      let yy = 390;
      leaderboard.slice(0, 8).forEach((row, i) => {
        const txt = `${i + 1}. ${row.player_name} — ${row.score} (שלב ${row.wave_reached})`;
        ctx.fillText(txt, WIDTH - 60, yy);
        yy += 26;
      });
    } else {
      ctx.fillStyle = "rgb(160,170,200)";
      ctx.fillText("(אין נתונים או השרת לא זמין)", WIDTH - 60, 390);
    }
    ctx.restore();
  }

  function resolveBulletHits() {
    const nextBullets = [];
    for (const b of bullets) {
      let consumed = false;

      if (boss) {
        if (dist(b.x, b.y, boss.x, boss.y) < boss.radius + 6) {
          boss.hp -= 1;
          bumpShake(2);
          consumed = true;
          if (boss.hp <= 0) {
            particles.push(...spawnExplosion(boss.x, boss.y, [255, 200, 120]));
            bumpShake(10);
            score += 320 + wave * 55;
            kills += 1;
            maybeDropPowerup(boss.x, boss.y);
            boss = null;
            waveBanner = 1.6;
            waveBannerText = "בוס הושמד!";
          }
        }
      }

      if (!consumed) {
        for (let i = 0; i < meteors.length; i++) {
          const m = meteors[i];
          if (dist(b.x, b.y, m.x, m.y) < m.r + 6) {
            meteors.splice(i, 1);
            particles.push(...spawnExplosion(m.x, m.y, [160, 160, 190]));
            bumpShake(3);
            consumed = true;
            score += 6;
            break;
          }
        }
      }

      if (!consumed) {
        for (let i = 0; i < aliens.length; i++) {
          const a = aliens[i];
          if (dist(b.x, b.y, a.x, a.y) < a.radius + 6) {
            a.hp -= 1;
            consumed = true;
            if (a.hp <= 0) {
              particles.push(...spawnExplosion(a.x, a.y, a.color));
              bumpShake(4);
              kills += 1;
              score += 10 + wave * 2 + (a.kind === "tank" ? 18 : a.kind === "scout" ? 6 : 12) + Math.min(36, (kills * 0.12) | 0);
              maybeDropPowerup(a.x, a.y);
              aliens.splice(i, 1);
              if (kills > 0 && kills % 9 === 0) {
                wave += 1;
                waveBanner = 1.35;
                waveBannerText = `שלב ${wave}! המהירות עולה`;
                if (wave % 5 === 0 && wave >= 5 && !boss) {
                  boss = makeBoss(wave);
                  waveBanner = 2;
                  waveBannerText = "בוס מתקרב!";
                }
              }
            }
            break;
          }
        }
      }

      if (!consumed) nextBullets.push(b);
    }
    bullets = nextBullets;
  }

  function updatePickups() {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += p.vy * gameDt;
      p.x += Math.sin(tGame * 3 + p.wobble) * 55 * gameDt;
      if (dist(p.x, p.y, playerX, playerY) < playerR + 22) {
        if (p.kind === "SHIELD") shieldCharges = Math.min(3, shieldCharges + 1);
        if (p.kind === "RAPID") rapidUntil = tGame + 9;
        if (p.kind === "SPREAD") spreadUntil = tGame + 7;
        particles.push(...spawnExplosion(p.x, p.y, [200, 255, 255]));
        powerups.splice(i, 1);
      } else if (p.y > HEIGHT + 30) {
        powerups.splice(i, 1);
      }
    }
  }

  function checkPlayerHits() {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      if (dist(m.x, m.y, playerX, playerY) < m.r + playerR) {
        meteors.splice(i, 1);
        if (!consumeShieldOrDie()) return;
      }
    }
    for (let i = aliens.length - 1; i >= 0; i--) {
      const a = aliens[i];
      if (dist(a.x, a.y, playerX, playerY) < a.radius + playerR) {
        aliens.splice(i, 1);
        particles.push(...spawnExplosion(a.x, a.y, a.color));
        if (!consumeShieldOrDie()) return;
      }
      if (a.y > HEIGHT - 48) {
        triggerGameOver();
        return;
      }
    }
    if (boss && dist(boss.x, boss.y, playerX, playerY) < boss.radius + playerR) {
      if (!consumeShieldOrDie()) return;
    }
  }

  let last = performance.now() / 1000;

  function tick(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(0.05, now - last);
    last = now;

    if (shakeT > 0) {
      shakeT -= dt;
      shake *= 0.9;
      if (shakeT <= 0) shake = 0;
    } else {
      shake *= 0.85;
    }
    const sx = (Math.random() - 0.5) * shake * 2;
    const sy = (Math.random() - 0.5) * shake * 2;

    ctx.setTransform(scaleX, 0, 0, scaleY, sx, sy);
    ctx.fillStyle = `rgb(${SPACE.join(",")})`;
    ctx.fillRect(-20, -20, WIDTH + 40, HEIGHT + 40);

    ctx.strokeStyle = "rgba(124,240,255,0.035)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx < WIDTH; gx += 48) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, HEIGHT);
      ctx.stroke();
    }
    for (let gy = 0; gy < HEIGHT; gy += 48) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(WIDTH, gy);
      ctx.stroke();
    }

    if (state === "menu") {
      for (const s of stars) {
        s.y += s.speed * dt * 0.35;
        if (s.y > HEIGHT + 4) {
          s.y = -4 - Math.random() * 20;
          s.x = Math.random() * WIDTH;
        }
      }
    } else if (state === "play") {
      gameDt = dt;
      tGame = now - runT0;
      waveBanner = Math.max(0, waveBanner - dt);

      const starBoost = 1 + (wave - 1) * 0.028;
      for (const s of stars) {
        s.y += s.speed * dt * starBoost;
        if (s.y > HEIGHT + 4) {
          s.y = -4 - Math.random() * 20;
          s.x = Math.random() * WIDTH;
        }
      }

      const pace = stagePaceMul(wave);
      const spd = 430 * dt * pace;
      let moved = false;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) {
        playerX -= spd;
        tilt = Math.min(12, tilt + 120 * dt);
        moved = true;
      } else if (keys.has("ArrowRight") || keys.has("KeyD")) {
        playerX += spd;
        tilt = Math.max(-12, tilt - 120 * dt);
        moved = true;
      }
      if (!moved) {
        const target = Math.max(46, Math.min(WIDTH - 46, pointerX));
        const dx = target - playerX;
        if (Math.abs(dx) > 2) {
          playerX += Math.sign(dx) * Math.min(Math.abs(dx), spd * 1.12);
          tilt += Math.sign(dx) * 95 * dt;
          tilt = Math.max(-12, Math.min(12, tilt));
        } else tilt *= 0.88;
      } else pointerX = playerX;
      if (keys.has("ArrowLeft") || keys.has("KeyA") || keys.has("ArrowRight") || keys.has("KeyD")) pointerX = playerX;
      playerX = Math.max(46, Math.min(WIDTH - 46, playerX));
      if (!keys.has("ArrowLeft") && !keys.has("KeyA") && !keys.has("ArrowRight") && !keys.has("KeyD")) tilt *= 0.88;

      shootCd = Math.max(0, shootCd - dt);
      if (keys.has("Space") || keys.has("Enter")) tryFire();

      if (boss) {
        if (boss.y < boss.anchorY) boss.y += boss.vy * dt * Math.min(1.45, stagePaceMul(wave) * 0.92);
        boss.x = WIDTH / 2 + Math.sin(tGame * 1.25 + boss.phase) * (WIDTH * 0.36 - boss.radius);
      }

      meteorTimer -= dt;
      if (meteorTimer <= 0) {
        const paceM = stagePaceMul(wave);
        meteorTimer = (2.2 + Math.random() * 4.5) / Math.min(1.35, paceM * 0.92);
        meteors.push({
          x: 40 + Math.random() * (WIDTH - 80),
          y: -40,
          vy: (95 + Math.random() * 75) * (0.88 + 0.12 * paceM),
          r: 22 + Math.random() * 16,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 2.2,
          seed: Math.random() * 10,
        });
      }

      spawnTimer -= dt;
      const cap = boss ? Math.min(4, 3 + ((wave / 3) | 0)) : Math.min(10 + wave * 2, 32);
      if (aliens.length < cap && spawnTimer <= 0 && !boss) {
        const paceSp = stagePaceMul(wave);
        spawnTimer = Math.max(0.26, (1.28 - wave * 0.055) / Math.min(1.28, paceSp * 0.95));
        aliens.push(makeAlien(wave));
      }

      for (const b of bullets) {
        b.y += b.vy * dt;
        if (b.vx) b.x += b.vx * dt;
      }
      bullets = bullets.filter((b) => b.y > -24 && b.x > -40 && b.x < WIDTH + 40);

      const paceA = stagePaceMul(wave);
      const baseSy = (48 + wave * 11 + wave * wave * 0.22) * paceA;
      for (const a of aliens) {
        const syAlien = baseSy * a.speedMul;
        a.y += syAlien * dt;
        a.x += Math.sin(tGame * 2.15 + a.phase) * a.sinAmp * dt;
        a.x = Math.max(a.radius, Math.min(WIDTH - a.radius, a.x));
      }

      for (const m of meteors) {
        m.y += m.vy * dt;
        m.rot += m.vr * dt;
      }
      meteors = meteors.filter((m) => m.y < HEIGHT + 80);

      resolveBulletHits();
      updatePickups();
      checkPlayerHits();

      particles = particles.filter((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        return p.life > 0;
      });
    } else if (state === "gameover") {
      for (const s of stars) {
        s.y += s.speed * dt * 0.25;
        if (s.y > HEIGHT + 4) {
          s.y = -4 - Math.random() * 20;
          s.x = Math.random() * WIDTH;
        }
      }
      particles = particles.filter((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        return p.life > 0;
      });
    }

    for (const s of stars) {
      ctx.fillStyle = `rgb(${STAR_LOW.join(",")})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state === "menu") {
      drawMenu();
    } else if (state === "play") {
      for (const m of meteors) drawMeteor(m);
      drawBullets();
      for (const a of aliens) drawAlien(a);
      if (boss) drawBoss(boss);
      for (const p of powerups) drawPowerup(p);
      drawShip(playerX, playerY, tilt, wave);
      for (const p of particles) {
        ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${Math.min(1, p.life * 2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = "22px Segoe UI, Heebo, sans-serif";
      ctx.fillStyle = `rgb(${HUD.join(",")})`;
      ctx.textAlign = "right";
      const buff = [];
      if (shieldCharges) buff.push(`מגן×${shieldCharges}`);
      if (tGame < rapidUntil) buff.push("מהיר");
      if (tGame < spreadUntil) buff.push("פיזור");
      const buffStr = buff.length ? `   ${buff.join(" · ")}` : "";
      ctx.fillText(`ניקוד ${score}   חיסולים ${kills}   שלב ${wave}   זמן ${tGame.toFixed(1)}ש${buffStr}`, WIDTH - 14, 32);

      if (waveBanner > 0 && waveBannerText) {
        ctx.textAlign = "center";
        ctx.fillStyle = "rgb(255, 230, 160)";
        ctx.fillText(waveBannerText, WIDTH / 2, 64);
      }
    } else if (state === "gameover") {
      for (const m of meteors) drawMeteor(m);
      drawBullets();
      for (const a of aliens) drawAlien(a);
      if (boss) drawBoss(boss);
      drawShip(playerX, playerY, tilt * 0.28, wave);
      for (const p of particles) {
        ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${Math.min(1, p.life * 2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(10, 12, 30, 0.74)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    requestAnimationFrame(tick);
  }

  resizeGameCanvas();
  refreshMeta().then(() => {
    last = performance.now() / 1000;
    requestAnimationFrame(tick);
  });
})();
