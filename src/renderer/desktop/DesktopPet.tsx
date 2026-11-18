import { useEffect, useRef } from 'react';

import { drawDesktopWallpaper, drawPetSprite, petMuzzle, type PetPose } from './desktopArt';

const PAUSE_STORAGE_KEY = 'game-os.pet-paused.v1';
const STAGE_HEIGHT = 144;
const SHOT_DURATION_MS = 760;

interface Bullet {
  x: number;
  y: number;
  direction: 1 | -1;
  age: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  remaining: number;
}

export function DesktopWallpaper() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) drawDesktopWallpaper(canvasRef.current, { contrast: 0.65 });
  }, []);

  return <canvas ref={canvasRef} className="desktop-wallpaper" width={640} height={440} aria-hidden="true" />;
}

export function DesktopPet() {
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!stageRef.current) return;
    return mountPet(stageRef.current);
  }, []);

  return (
    <div ref={stageRef} className="desktop-pet-stage" aria-label="像素游侠桌宠">
      <canvas className="desktop-pet-effects" data-pet-effects aria-hidden="true" />
      <button
        type="button"
        className="desktop-pet-actor"
        data-pet-actor
        aria-label="像素游侠，点击发射能量弹"
        title="点击开火"
      >
        <canvas width={64} height={64} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="desktop-pet-pause"
        data-pet-pause
        aria-label="暂停桌宠漫步"
        aria-pressed={false}
        title="暂停漫步"
      >
        Ⅱ
      </button>
      <span className="desktop-pet-sr" data-pet-live role="status" aria-live="polite" />
    </div>
  );
}

function mountPet(stage: HTMLDivElement): (() => void) | undefined {
  const actorElement = stage.querySelector<HTMLButtonElement>('[data-pet-actor]');
  const spriteElement = actorElement?.querySelector('canvas');
  const effectsElement = stage.querySelector<HTMLCanvasElement>('[data-pet-effects]');
  const toggleElement = stage.querySelector<HTMLButtonElement>('[data-pet-pause]');
  const liveElement = stage.querySelector<HTMLSpanElement>('[data-pet-live]');
  const context = effectsElement?.getContext('2d');
  if (!actorElement || !spriteElement || !effectsElement || !toggleElement || !liveElement || !context) return;
  // Stable non-null bindings are also used by the event and animation callbacks.
  const actor = actorElement;
  const sprite = spriteElement;
  const effects = effectsElement;
  const toggle = toggleElement;
  const live = liveElement;
  const ctx = context;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  let width = 0;
  let size = 128;
  let x = 0;
  let direction: 1 | -1 = 1;
  let elapsed = 0;
  let lastTime = 0;
  let frameId = 0;
  let accumulator = 0;
  let paused = readPaused();
  let keyboardFocus = false;
  let visible = true;
  let disposed = false;
  let motionOverride = false;
  let shooting = 0;
  let shotClock = 0;
  let rounds = 0;
  let flash = 0;
  let bullets: Bullet[] = [];
  let sparks: Spark[] = [];
  let paintKey = '';
  let hasPosition = false;

  function resting() {
    return paused || (reduced.matches && !motionOverride);
  }

  function updateControls() {
    const still = resting();
    toggle.textContent = still ? '▷' : 'Ⅱ';
    toggle.setAttribute('aria-label', still ? '让桌宠继续漫步' : '暂停桌宠漫步');
    toggle.setAttribute('aria-pressed', String(still));
    toggle.title = still ? '继续漫步' : '暂停漫步';
  }

  function drawCharacter(force = false) {
    const pose: PetPose = shooting > 0
      ? 'shoot'
      : resting() || keyboardFocus ? 'idle' : 'walk';
    const frame = pose === 'shoot'
      ? Math.floor((SHOT_DURATION_MS - shooting) / 85) % 4
      : pose === 'walk' ? Math.floor(elapsed / 145) % 4 : 0;
    const key = pose + ':' + frame + ':' + direction + ':' + (flash > 0);
    actor.dataset.state = pose;
    stage.dataset.paused = String(resting());
    actor.style.transform = 'translateX(' + Math.round(x / 2) * 2 + 'px)';
    if (force || paintKey !== key) {
      drawPetSprite(sprite, { pose, frame, direction, flash: flash > 0 });
      paintKey = key;
    }
  }

  function fit() {
    width = stage.clientWidth;
    size = actor.offsetWidth || 128;
    effects.width = Math.max(1, Math.ceil(width / 2));
    effects.height = STAGE_HEIGHT / 2;
    ctx.imageSmoothingEnabled = false;
    if (!hasPosition && width > 0) {
      x = Math.max(8, (width - size) * 0.61);
      hasPosition = true;
    }
    x = Math.max(8, Math.min(x, Math.max(8, width - size - 52)));
    drawCharacter(true);
    drawEffects();
  }

  function emit() {
    const scale = size / 64;
    const point = petMuzzle({
      pose: 'shoot',
      frame: Math.floor((SHOT_DURATION_MS - shooting) / 85) % 4,
      direction,
    });
    bullets.push({
      x: x + point.x * scale,
      y: STAGE_HEIGHT - size + point.y * scale,
      direction,
      age: 0,
    });
    flash = 85;
  }

  function fire() {
    if (shooting > 0) return;
    // Near a desktop edge, fire inward so the interaction remains visible.
    if (x > width - size - 85) direction = -1;
    else if (x < 85) direction = 1;
    shooting = SHOT_DURATION_MS;
    shotClock = 0;
    rounds = reduced.matches ? 1 : 3;
    emit();
    rounds -= 1;
    live.textContent = '像素游侠发射能量弹。';
    drawCharacter(true);
    wake();
  }

  function spark(px: number, py: number) {
    for (let index = 0; index < 6; index += 1) {
      sparks.push({
        x: px,
        y: py,
        vx: (index % 2 ? -1 : 1) * (24 + index * 9),
        vy: (index - 2.5) * 24,
        remaining: 210,
      });
    }
  }

  function drawEffects() {
    ctx.clearRect(0, 0, effects.width, effects.height);
    for (const bullet of bullets) {
      const bx = Math.round(bullet.x / 2);
      const by = Math.round(bullet.y / 2);
      const tail = bullet.direction === 1 ? bx - 15 : bx;
      ctx.fillStyle = '#277c8c';
      ctx.fillRect(tail, by - 1, 15, 3);
      ctx.fillStyle = '#51d8df';
      ctx.fillRect(bullet.direction === 1 ? bx - 9 : bx, by - 1, 9, 3);
      ctx.fillStyle = '#d0fff4';
      ctx.fillRect(bx - 2, by - 2, 5, 4);
    }
    for (const item of sparks) {
      ctx.fillStyle = item.remaining > 100 ? '#a8fff0' : '#dc75be';
      ctx.fillRect(Math.round(item.x / 2), Math.round(item.y / 2), 2, 2);
    }
  }

  function step(milliseconds: number) {
    elapsed += milliseconds;
    const seconds = milliseconds / 1000;
    if (shooting > 0) {
      shooting = Math.max(0, shooting - milliseconds);
      shotClock += milliseconds;
      if (rounds > 0 && shotClock >= 155) {
        shotClock -= 155;
        emit();
        rounds -= 1;
      }
    } else if (!resting() && !keyboardFocus) {
      x += direction * 35 * seconds;
      const maximum = Math.max(8, width - size - 52);
      if (x >= maximum) {
        x = maximum;
        direction = -1;
      } else if (x <= 8) {
        x = 8;
        direction = 1;
      }
    }
    flash = Math.max(0, flash - milliseconds);
    bullets = bullets.filter((bullet) => {
      bullet.x += bullet.direction * (reduced.matches ? 220 : 430) * seconds;
      bullet.age += milliseconds;
      if (bullet.x < 6 || bullet.x > width - 6) {
        spark(Math.max(6, Math.min(width - 6, bullet.x)), bullet.y);
        return false;
      }
      return bullet.age < 2400;
    });
    sparks = sparks.filter((item) => {
      item.remaining -= milliseconds;
      item.x += item.vx * seconds;
      item.y += item.vy * seconds;
      return item.remaining > 0;
    });
    drawCharacter();
    drawEffects();
  }

  function loop(time: number) {
    frameId = 0;
    if (disposed || !stage.isConnected) return;
    if (!visible || document.hidden) {
      lastTime = 0;
      return;
    }
    const delta = lastTime ? Math.min(70, time - lastTime) : 0;
    lastTime = time;
    accumulator += delta;
    if (accumulator >= 32) {
      step(accumulator);
      accumulator = 0;
    }
    if ((!resting() && !keyboardFocus) || shooting > 0 || bullets.length > 0 || sparks.length > 0) {
      frameId = requestAnimationFrame(loop);
    } else {
      lastTime = 0;
    }
  }

  function wake() {
    if (!disposed && !frameId && visible && !document.hidden) {
      lastTime = 0;
      frameId = requestAnimationFrame(loop);
    }
  }

  function suspend() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastTime = 0;
  }

  function onToggle() {
    if (resting()) {
      motionOverride = true;
      paused = false;
    } else {
      paused = true;
    }
    try {
      localStorage.setItem(PAUSE_STORAGE_KEY, JSON.stringify(paused));
    } catch {
      // The pet remains usable when storage is unavailable.
    }
    live.textContent = paused ? '桌宠已暂停漫步。' : '桌宠继续漫步。';
    updateControls();
    drawCharacter(true);
    wake();
  }

  function onFocus() {
    keyboardFocus = actor.matches(':focus-visible');
    drawCharacter(true);
    wake();
  }

  function onBlur() {
    keyboardFocus = false;
    wake();
  }

  function onPointer() {
    keyboardFocus = false;
  }

  function onVisibility() {
    if (document.hidden) suspend();
    else wake();
  }

  function onMotion() {
    motionOverride = false;
    updateControls();
    drawCharacter(true);
    wake();
  }

  actor.addEventListener('click', fire);
  actor.addEventListener('focus', onFocus);
  actor.addEventListener('blur', onBlur);
  actor.addEventListener('pointerdown', onPointer);
  toggle.addEventListener('click', onToggle);
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onMotion);
  const resize = new ResizeObserver(fit);
  resize.observe(stage);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
    if (visible) wake();
    else suspend();
  }, { threshold: 0 });
  intersection.observe(stage);
  fit();
  updateControls();
  drawCharacter(true);
  wake();

  return () => {
    disposed = true;
    suspend();
    resize.disconnect();
    intersection.disconnect();
    actor.removeEventListener('click', fire);
    actor.removeEventListener('focus', onFocus);
    actor.removeEventListener('blur', onBlur);
    actor.removeEventListener('pointerdown', onPointer);
    toggle.removeEventListener('click', onToggle);
    document.removeEventListener('visibilitychange', onVisibility);
    reduced.removeEventListener('change', onMotion);
  };
}

function readPaused(): boolean {
  try {
    return localStorage.getItem(PAUSE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
