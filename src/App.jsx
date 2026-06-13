import { useState, useEffect, useRef, useCallback } from "react";

const GAME_W = 480;
const GAME_H = 600;
const PLAYER_W = 40;
const PLAYER_H = 30;
const BULLET_W = 4;
const BULLET_H = 14;
const ENEMY_W = 36;
const ENEMY_H = 28;
const STAR_COUNT = 60;

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function genStars() {
  return Array.from({ length: STAR_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * GAME_W,
    y: Math.random() * GAME_H,
    r: randomBetween(0.5, 2),
    speed: randomBetween(0.3, 1.2),
    opacity: randomBetween(0.3, 1),
  }));
}

function spawnEnemy(wave) {
  const cols = Math.min(3 + Math.floor(wave / 2), 7);
  const spacing = GAME_W / (cols + 1);
  return Array.from({ length: cols }, (_, i) => ({
    id: Math.random(),
    x: spacing * (i + 1) - ENEMY_W / 2,
    y: -ENEMY_H - Math.random() * 80,
    speed: randomBetween(1.2 + wave * 0.15, 2.2 + wave * 0.2),
    hp: wave > 3 ? 2 : 1,
  }));
}

export default function SpaceShooter() {
  const [phase, setPhase] = useState("title"); // title | playing | dead
  const [score, setScore] = useState(0);
  const [hiScore, setHiScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [wave, setWave] = useState(1);

  const stateRef = useRef(null);
  const animRef = useRef(null);
  const canvasRef = useRef(null);
  const keysRef = useRef({});
  const lastShotRef = useRef(0);
  const invincibleRef = useRef(0);

  const initState = useCallback((w) => ({
    player: { x: GAME_W / 2 - PLAYER_W / 2, y: GAME_H - 70 },
    bullets: [],
    enemies: spawnEnemy(w),
    explosions: [],
    stars: genStars(),
    score: 0,
    lives: 3,
    wave: w,
    waveClearing: false,
  }), []);

  const startGame = useCallback(() => {
    stateRef.current = initState(1);
    lastShotRef.current = 0;
    invincibleRef.current = 0;
    setScore(0);
    setLives(3);
    setWave(1);
    setPhase("playing");
  }, [initState]);

  // Keyboard
  useEffect(() => {
    const down = (e) => { keysRef.current[e.key] = true; };
    const up = (e) => { keysRef.current[e.key] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Touch / mobile controls
  const touchDir = useRef(0); // -1 left, 1 right, 0 none
  const touchFire = useRef(false);

  // Game loop
  useEffect(() => {
    if (phase !== "playing") {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let lastTime = performance.now();

    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 16.67, 3);
      lastTime = now;
      const s = stateRef.current;
      if (!s) return;

      const keys = keysRef.current;
      const speed = 4;

      // Player move
      if (keys["ArrowLeft"] || keys["a"] || touchDir.current === -1) s.player.x -= speed * dt;
      if (keys["ArrowRight"] || keys["d"] || touchDir.current === 1) s.player.x += speed * dt;
      s.player.x = Math.max(0, Math.min(GAME_W - PLAYER_W, s.player.x));

      // Shoot
      const now2 = now;
      if ((keys[" "] || keys["ArrowUp"] || touchFire.current) && now2 - lastShotRef.current > 200) {
        lastShotRef.current = now2;
        s.bullets.push({
          id: Math.random(),
          x: s.player.x + PLAYER_W / 2 - BULLET_W / 2,
          y: s.player.y,
        });
      }

      // Move bullets
      s.bullets = s.bullets
        .map(b => ({ ...b, y: b.y - 9 * dt }))
        .filter(b => b.y > -BULLET_H);

      // Move stars
      s.stars = s.stars.map(st => ({
        ...st,
        y: (st.y + st.speed * dt) % GAME_H,
      }));

      // Move enemies
      s.enemies = s.enemies.map(e => ({ ...e, y: e.y + e.speed * dt }));

      // Bullet-enemy collisions
      const hitEnemyIds = new Set();
      const hitBulletIds = new Set();
      for (const b of s.bullets) {
        for (const e of s.enemies) {
          if (hitEnemyIds.has(e.id)) continue;
          if (b.x < e.x + ENEMY_W && b.x + BULLET_W > e.x && b.y < e.y + ENEMY_H && b.y + BULLET_H > e.y) {
            hitBulletIds.add(b.id);
            e.hp -= 1;
            if (e.hp <= 0) {
              hitEnemyIds.add(e.id);
              s.score += 10 * s.wave;
              s.explosions.push({ id: Math.random(), x: e.x + ENEMY_W / 2, y: e.y + ENEMY_H / 2, t: 0 });
            }
          }
        }
      }
      s.bullets = s.bullets.filter(b => !hitBulletIds.has(b.id));
      s.enemies = s.enemies.filter(e => !hitEnemyIds.has(e.id));

      // Enemy reaches bottom or hits player
      if (invincibleRef.current > 0) invincibleRef.current -= dt;
      for (const e of s.enemies) {
        if (e.y + ENEMY_H > GAME_H) {
          s.enemies = s.enemies.filter(x => x.id !== e.id);
          s.lives -= 1;
          s.explosions.push({ id: Math.random(), x: e.x + ENEMY_W / 2, y: GAME_H - 40, t: 0 });
          invincibleRef.current = 60;
        } else if (
          invincibleRef.current <= 0 &&
          e.x < s.player.x + PLAYER_W && e.x + ENEMY_W > s.player.x &&
          e.y < s.player.y + PLAYER_H && e.y + ENEMY_H > s.player.y
        ) {
          s.lives -= 1;
          s.enemies = s.enemies.filter(x => x.id !== e.id);
          s.explosions.push({ id: Math.random(), x: s.player.x + PLAYER_W / 2, y: s.player.y, t: 0 });
          invincibleRef.current = 90;
        }
      }

      // Explosions age
      s.explosions = s.explosions.map(ex => ({ ...ex, t: ex.t + dt })).filter(ex => ex.t < 20);

      // Wave clear
      if (s.enemies.length === 0 && !s.waveClearing) {
        s.waveClearing = true;
        const nextWave = s.wave + 1;
        setTimeout(() => {
          if (stateRef.current) {
            stateRef.current.wave = nextWave;
            stateRef.current.enemies = spawnEnemy(nextWave);
            stateRef.current.waveClearing = false;
            setWave(nextWave);
          }
        }, 1200);
      }

      // Sync React state sparingly
      setScore(s.score);
      setLives(s.lives);

      if (s.lives <= 0) {
        setHiScore(prev => Math.max(prev, s.score));
        setPhase("dead");
        return;
      }

      // Draw
      ctx.fillStyle = "#070b14";
      ctx.fillRect(0, 0, GAME_W, GAME_H);

      // Stars
      for (const st of s.stars) {
        ctx.globalAlpha = st.opacity;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Bullets
      for (const b of s.bullets) {
        const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + BULLET_H);
        grad.addColorStop(0, "#00ffcc");
        grad.addColorStop(1, "#006644");
        ctx.fillStyle = grad;
        ctx.shadowColor = "#00ffcc";
        ctx.shadowBlur = 8;
        ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);
        ctx.shadowBlur = 0;
      }

      // Enemies (alien saucers)
      for (const e of s.enemies) {
        const cx = e.x + ENEMY_W / 2;
        const cy = e.y + ENEMY_H / 2;
        ctx.save();
        ctx.translate(cx, cy);
        // Body
        ctx.fillStyle = e.hp > 1 ? "#cc44ff" : "#ff4466";
        ctx.shadowColor = e.hp > 1 ? "#cc44ff" : "#ff4466";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.ellipse(0, 4, 18, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // Dome
        ctx.fillStyle = e.hp > 1 ? "#ee99ff" : "#ff99aa";
        ctx.beginPath();
        ctx.ellipse(0, -2, 10, 8, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Player
      const px = s.player.x;
      const py = s.player.y;
      const blink = invincibleRef.current > 0 && Math.floor(invincibleRef.current / 5) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(px + PLAYER_W / 2, py + PLAYER_H / 2);
        // Engine glow
        ctx.fillStyle = "#ff6600";
        ctx.shadowColor = "#ff6600";
        ctx.shadowBlur = 12;
        ctx.fillRect(-6, 10, 12, 8);
        ctx.shadowBlur = 0;
        // Ship body
        ctx.fillStyle = "#00ccff";
        ctx.shadowColor = "#00ccff";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(14, 12);
        ctx.lineTo(6, 8);
        ctx.lineTo(-6, 8);
        ctx.lineTo(-14, 12);
        ctx.closePath();
        ctx.fill();
        // Cockpit
        ctx.fillStyle = "#aaeeff";
        ctx.beginPath();
        ctx.ellipse(0, -2, 5, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Explosions
      for (const ex of s.explosions) {
        const prog = ex.t / 20;
        ctx.globalAlpha = 1 - prog;
        const r = prog * 30;
        const grad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, r);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.4, "#ffcc00");
        grad.addColorStop(1, "rgba(255,80,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Wave clear banner
      if (s.waveClearing) {
        ctx.fillStyle = "rgba(0,255,200,0.15)";
        ctx.fillRect(0, GAME_H / 2 - 30, GAME_W, 60);
        ctx.fillStyle = "#00ffcc";
        ctx.font = "bold 28px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.shadowColor = "#00ffcc";
        ctx.shadowBlur = 16;
        ctx.fillText(`WAVE ${s.wave} CLEAR!`, GAME_W / 2, GAME_H / 2 + 10);
        ctx.shadowBlur = 0;
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase]);

  // Mobile touch handlers
  const handleTouchStart = (dir) => (e) => {
    e.preventDefault();
    touchDir.current = dir;
    if (dir === 0) touchFire.current = true;
  };
  const handleTouchEnd = (dir) => (e) => {
    e.preventDefault();
    if (dir !== 0) touchDir.current = 0;
    else touchFire.current = false;
  };

  const heartStr = Array.from({ length: 3 }, (_, i) => i < lives ? "♥" : "♡").join(" ");

  return (
    <div style={{
      minHeight: "100vh",
      background: "#020509",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Courier New', monospace",
      color: "#00ffcc",
      userSelect: "none",
    }}>
      {phase === "title" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, fontWeight: "bold", letterSpacing: 6, color: "#00ffcc", textShadow: "0 0 24px #00ffcc" }}>
            VOID STRIKE
          </div>
          <div style={{ color: "#666", marginTop: 8, fontSize: 13, letterSpacing: 2 }}>SPACE SHOOTER</div>
          <div style={{ marginTop: 40, color: "#aaa", fontSize: 13, lineHeight: 2 }}>
            ← → or A/D to move<br />
            SPACE or ↑ to shoot
          </div>
          <button
            onClick={startGame}
            style={{
              marginTop: 40,
              padding: "14px 48px",
              fontSize: 18,
              fontFamily: "inherit",
              background: "transparent",
              border: "2px solid #00ffcc",
              color: "#00ffcc",
              letterSpacing: 4,
              cursor: "pointer",
              textShadow: "0 0 8px #00ffcc",
              boxShadow: "0 0 16px #00ffcc44",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => e.target.style.background = "#00ffcc22"}
            onMouseLeave={e => e.target.style.background = "transparent"}
          >
            LAUNCH
          </button>
          {hiScore > 0 && <div style={{ marginTop: 24, color: "#ff4466", fontSize: 13 }}>HI-SCORE: {hiScore}</div>}
        </div>
      )}

      {phase === "dead" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, fontWeight: "bold", color: "#ff4466", textShadow: "0 0 20px #ff4466", letterSpacing: 4 }}>GAME OVER</div>
          <div style={{ marginTop: 20, fontSize: 22, color: "#00ffcc" }}>Score: {score}</div>
          <div style={{ marginTop: 6, fontSize: 14, color: "#ff4466" }}>Hi-Score: {hiScore}</div>
          <button
            onClick={startGame}
            style={{
              marginTop: 36,
              padding: "12px 40px",
              fontSize: 16,
              fontFamily: "inherit",
              background: "transparent",
              border: "2px solid #ff4466",
              color: "#ff4466",
              letterSpacing: 4,
              cursor: "pointer",
              boxShadow: "0 0 12px #ff446644",
            }}
          >
            RETRY
          </button>
        </div>
      )}

      {phase === "playing" && (
        <div>
          {/* HUD */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            width: GAME_W,
            padding: "6px 4px",
            fontSize: 13,
            letterSpacing: 2,
          }}>
            <span style={{ color: "#ff4466" }}>{heartStr}</span>
            <span>WAVE {wave}</span>
            <span>SCORE {score}</span>
          </div>

          <canvas
            ref={canvasRef}
            width={GAME_W}
            height={GAME_H}
            style={{ display: "block", border: "1px solid #0a2a2a" }}
          />

          {/* Mobile controls */}
          <div style={{ display: "flex", gap: 12, marginTop: 12, justifyContent: "center" }}>
            {[
              { label: "◀", dir: -1 },
              { label: "▶", dir: 1 },
              { label: "🔥 FIRE", dir: 0 },
            ].map(({ label, dir }) => (
              <button
                key={label}
                onTouchStart={handleTouchStart(dir)}
                onTouchEnd={handleTouchEnd(dir)}
                onMouseDown={handleTouchStart(dir)}
                onMouseUp={handleTouchEnd(dir)}
                style={{
                  padding: dir === 0 ? "14px 28px" : "14px 22px",
                  fontSize: 18,
                  fontFamily: "inherit",
                  background: dir === 0 ? "#00ffcc22" : "transparent",
                  border: `2px solid ${dir === 0 ? "#00ffcc" : "#334"}`,
                  color: dir === 0 ? "#00ffcc" : "#667",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}