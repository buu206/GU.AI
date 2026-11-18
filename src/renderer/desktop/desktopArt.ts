/** Original pixel artwork, ported from the approved GAME//OS desktop prototype. */
export type PetPose = 'walk' | 'idle' | 'shoot';
export interface PetSpriteOptions {
  pose?: PetPose;
  frame?: number;
  direction?: 1 | -1;
  flash?: boolean;
}
interface SpriteState {
  pose: PetPose;
  frame: number;
  direction: 1 | -1;
  flash: boolean;
  bob: number;
  recoil: number;
}
type LegPose = [number, number, number, boolean];

  // Original pixel-city wallpaper. Every redraw is deterministic.
  // Draw at 320 × 220, then scale exactly 2× to the public 640 × 440 canvas.
  export function drawDesktopWallpaper(canvas: HTMLCanvasElement, options: { contrast?: number } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const amount = Number(options && options.contrast);
    const contrast = Number.isFinite(amount) ? Math.max(0.15, Math.min(1, amount)) : 0.6;
    const source = canvas.ownerDocument.createElement('canvas');
    source.width = 320;
    source.height = 220;
    const context = source.getContext('2d');
    if (!context) return;
    const ctx = context;
    ctx.imageSmoothingEnabled = false;
    let seed = 271119;
    const random = function () {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    function box(x: number, y: number, width: number, height: number, color: string, alpha?: number) {
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
      ctx.globalAlpha = 1;
    }
    function pixelLine(x1: number, y1: number, x2: number, y2: number, color: string, alpha?: number) {
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        box(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 1, 1, color, alpha);
      }
    }

    // A quiet sky: discrete bands rather than smooth illustration gradients.
    box(0, 0, 320, 220, '#0c0a1d');
    box(0, 38, 320, 53, '#110c25');
    box(0, 91, 320, 43, '#170e2b');
    box(0, 134, 320, 31, '#211132');
    box(0, 165, 320, 55, '#0a0c20');
    box(184, 93, 136, 1, '#271333', 0.3);
    box(0, 137, 320, 1, '#3c183e', 0.35 * contrast);

    // Sparse stars around the desktop edges; the centre stays visually calm.
    for (let i = 0; i < 40; i++) {
      const x = 8 + Math.floor(random() * 304);
      const y = 7 + Math.floor(random() * 119);
      if (x > 64 && x < 224 && y > 34) continue;
      if (Math.hypot(x - 263, y - 51) < 34) continue;
      box(x, y, 1, 1, i % 3 === 0 ? '#e0a9f4' : '#79afbd', contrast * (0.22 + random() * 0.5));
    }
    [[39, 24], [198, 18], [301, 95]].forEach(function (p, index) {
      const color = index === 1 ? '#e591d1' : '#8ae0dc';
      box(p[0], p[1], 1, 1, color, 0.9 * contrast);
      box(p[0] - 2, p[1], 1, 1, color, 0.35 * contrast);
      box(p[0] + 2, p[1], 1, 1, color, 0.35 * contrast);
      box(p[0], p[1] - 2, 1, 1, color, 0.35 * contrast);
      box(p[0], p[1] + 2, 1, 1, color, 0.35 * contrast);
    });
    box(83, 19, 14, 1, '#70305d', 0.5 * contrast);
    box(97, 18, 4, 1, '#d16f9d', 0.5 * contrast);

    // The low-resolution sunset disc is deliberately offset from the terminal.
    const sunX = 263;
    const sunY = 53;
    const radius = 27;
    const sunBands: Array<[number, string]> = [
      [0, '#f8a77d'], [9, '#ef7a8a'], [17, '#e65d9d'],
      [25, '#c745a1'], [33, '#a63898'], [41, '#7a2b85'], [49, '#56216b']
    ];
    for (let dy = -radius; dy <= radius; dy++) {
      const row = dy + radius;
      if (row >= 31 && (row % 5 === 0 || (row > 43 && row % 5 === 1))) continue;
      const halfWidth = Math.floor(Math.sqrt(radius * radius - dy * dy));
      let color = sunBands[0][1];
      sunBands.forEach(function (band) { if (row >= band[0]) color = band[1]; });
      box(sunX - halfWidth, sunY + dy, halfWidth * 2 + 1, 1, color, 0.65 + contrast * 0.28);
    }
    box(231, 75, 12, 1, '#b248a0', 0.3 * contrast);
    box(282, 67, 23, 1, '#c259a2', 0.4 * contrast);
    box(293, 69, 10, 1, '#6c2d79', 0.45 * contrast);
    box(227, 36, 16, 1, '#a36aa3', 0.3 * contrast);

    // Far skyline. Its restrained silhouette supports a foreground UI window.
    let x = 0;
    while (x < 320) {
      const width = 4 + Math.floor(random() * 11);
      const height = 4 + Math.floor(random() * 20);
      const top = 155 - height;
      box(x, top, width, height + 9, '#291b3c');
      if (random() > 0.65) box(x + Math.floor(width / 2), top - 5, 1, 5, '#312244');
      if (random() > 0.55) box(x + 1, top + 2, Math.max(1, width - 3), 1, '#6a3a66', contrast * 0.4);
      x += width + 2;
    }

    function building(left: number, top: number, width: number, base: number, accent: string, seedOffset: number) {
      box(left + 2, top - 2, width - 4, 3, '#19142f');
      box(left, top, width, base - top, '#121127');
      box(left + width - 3, top + 3, 3, base - top - 3, '#0c0c20');
      box(left + 1, top + 2, 1, base - top - 3, accent, 0.24 * contrast);
      box(left + 2, top + 2, width - 5, 1, accent, 0.4 * contrast);
      for (let row = top + 7; row < base - 4; row += 6) {
        for (let col = left + 4; col < left + width - 5; col += 5) {
          const mask = ((row * 17 + col * 13 + seedOffset) % 11);
          if (mask > 5) continue;
          box(col, row, 2, 2, mask < 2 ? accent : '#566680', contrast * (mask < 2 ? 0.6 : 0.25));
        }
      }
    }

    // A few closer towers anchor the sides without crowding the input area.
    building(-5, 119, 24, 167, '#dd54ad', 2);
    box(3, 111, 9, 8, '#15132b');
    pixelLine(7, 104, 7, 111, '#635278', 0.6 * contrast);
    box(6, 103, 3, 1, '#eb70bc', 0.8 * contrast);
    building(24, 137, 21, 167, '#5ac7cf', 8);
    building(50, 145, 14, 168, '#ba4fbd', 10);
    building(205, 143, 19, 169, '#4da9bb', 7);
    building(230, 130, 25, 169, '#b14e9a', 1);
    building(261, 117, 22, 170, '#66c6cf', 11);
    box(266, 109, 12, 8, '#19152d');
    box(271, 101, 1, 8, '#656083', 0.65 * contrast);
    box(270, 100, 3, 1, '#ec729f', 0.75 * contrast);
    building(290, 137, 29, 170, '#cb56ae', 3);

    // Rooftop equipment and signs contain abstract pixels, never text.
    box(233, 139, 8, 17, '#48213e');
    box(234, 140, 6, 15, '#c74491', 0.5 * contrast);
    [[235, 142, 4, 1], [236, 144, 1, 3], [235, 148, 4, 1], [235, 151, 1, 2], [237, 152, 2, 1]]
      .forEach(function (p) { box(p[0], p[1], p[2], p[3], '#f49cbf', contrast * 0.7); });
    box(29, 148, 11, 4, '#43b2c2', 0.5 * contrast);
    box(31, 149, 2, 1, '#b5f2ec', 0.6 * contrast);
    box(36, 149, 2, 1, '#b5f2ec', 0.6 * contrast);

    // Thin shore and pixel reflections at the horizon.
    box(0, 169, 320, 3, '#18142e');
    box(0, 172, 320, 1, '#905189', 0.35 * contrast);
    box(0, 174, 320, 1, '#4a98ad', 0.2 * contrast);
    for (let i = 0; i < 27; i++) {
      const rx = Math.floor(random() * 320);
      const ry = 176 + Math.floor(random() * 19);
      const rw = 3 + Math.floor(random() * 9);
      box(rx, ry, rw, 1, i % 2 ? '#a43a8e' : '#266779', contrast * (0.15 + random() * 0.23));
    }

    // A sparse perspective grid gives the whole screen a retro-computer depth.
    const horizon = 177;
    const vanishingX = 158;
    const floorBottom = 220;
    for (let bottomX = -200; bottomX <= 520; bottomX += 47) {
      const horizonX = vanishingX + (bottomX - vanishingX) * 0.035;
      pixelLine(horizonX, horizon, bottomX, floorBottom, '#38547c', 0.34 * contrast);
    }
    [181, 187, 196, 208].forEach(function (y, i) {
      box(0, y, 320, 1, i % 2 ? '#413271' : '#28526f', contrast * (0.22 + i * 0.045));
    });
    // Tiny lit corner pieces make the wallpaper feel assembled from pixels.
    pixelLine(5, 207, 19, 207, '#51d6d0', 0.45 * contrast);
    pixelLine(5, 207, 5, 215, '#51d6d0', 0.45 * contrast);
    box(8, 210, 3, 2, '#51d6d0', 0.2 * contrast);
    box(300, 201, 9, 2, '#be4cb1', 0.35 * contrast);
    box(297, 204, 12, 1, '#be4cb1', 0.2 * contrast);
    box(307, 207, 2, 5, '#be4cb1', 0.4 * contrast);

    canvas.width = 640;
    canvas.height = 440;
    const output = canvas.getContext('2d');
    if (!output) return;
    output.imageSmoothingEnabled = false;
    output.clearRect(0, 0, 640, 440);
    output.drawImage(source, 0, 0, 640, 440);
    canvas.style.imageRendering = 'pixelated';
  }


  const palette: Record<string, string> = {
    ink: '#111124', dark: '#24203e', violet: '#493756', steel: '#6c779d',
    silver: '#c9d8e6', white: '#f3f7ef', pink: '#df5bac', blush: '#ff93dc',
    plum: '#883b7c', cyan: '#65eee3', ice: '#d0fff2', teal: '#2b8599',
    orange: '#ffb86b', skin: '#e6b2a0'
  };

  function spriteState(options: PetSpriteOptions): SpriteState {
    const o = options || {};
    const pose = o.pose ?? 'idle';
    const frame = Math.abs(Math.floor(Number(o.frame) || 0)) % 4;
    return {
      pose, frame, direction: o.direction === -1 ? -1 : 1, flash: !!o.flash,
      bob: pose === 'walk' ? (frame % 2 ? -1 : 0) : pose === 'idle' && frame === 2 ? -1 : 0,
      recoil: pose === 'shoot' && frame % 2 ? -1 : 0
    };
  }

  export function petMuzzle(options: PetSpriteOptions) {
    const s = spriteState(options);
    const x = (s.pose === 'shoot' ? 56 : 53) + s.recoil;
    return { x: s.direction === -1 ? 64 - x : x, y: (s.pose === 'shoot' ? 32 : 39) + s.bob };
  }

  export function drawPetSprite(canvas: HTMLCanvasElement, options: PetSpriteOptions = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    if (canvas.width !== 64) canvas.width = 64;
    if (canvas.height !== 64) canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return;
    paintPetSprite(context, options);
  }

  /** Shared pixel instructions for the desktop canvas and bundled SVG artwork. */
  export type PetPixelContext = Pick<CanvasRenderingContext2D,
    'fillStyle' | 'imageSmoothingEnabled' | 'save' | 'restore'
    | 'clearRect' | 'translate' | 'scale' | 'fillRect'> & {
      setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    };

  export function paintPetSprite(
    ctx: PetPixelContext,
    options: PetSpriteOptions = {},
    paletteOverrides: Readonly<Record<string, string>> = {},
  ) {
    const colors = { ...palette, ...paletteOverrides };
    const s = spriteState(options);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 64, 64);
    ctx.imageSmoothingEnabled = false;
    if (s.direction === -1) { ctx.translate(64, 0); ctx.scale(-1, 1); }
    const r = function (x: number, y: number, w: number, h: number, color: string) {
      ctx.fillStyle = colors[color] || color;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };

    // Hinged trousers and thick shoes give each of the four walking poses a silhouette.
    function leg(hip: number, knee: number, ankle: number, front: boolean, lifted: boolean) {
      const lift = lifted ? 2 : 0;
      for (let i = 0; i < 7; i++) {
        const x = Math.round(hip + (knee - hip) * i / 6);
        r(x, 44 + i, 7, 1, 'ink');
        r(x + 1, 44 + i, 5, 1, front ? 'violet' : 'dark');
      }
      for (let i = 0; i < 7 - lift; i++) {
        const x = Math.round(knee + (ankle - knee) * i / (6 - lift));
        r(x, 50 + i, 7, 1, 'ink');
        r(x + 1, 50 + i, 5, 1, front ? 'dark' : 'violet');
      }
      r(knee + 1, 49, 4, 3, front ? 'steel' : 'violet');
      r(knee + 1, 49, 3, 1, front ? 'cyan' : 'teal');
      r(ankle - 1, 55 - lift, 8, 4, 'ink');
      r(ankle, 55 - lift, 5, 2, 'steel');
      r(ankle - 1, 57 - lift, 11, 3, 'ink');
      r(ankle, 57 - lift, 8, 1, front ? 'silver' : 'steel');
      r(ankle, 59 - lift, 9, 1, front ? 'cyan' : 'teal');
    }
    const strides: Array<[LegPose, LegPose]> = [
      [[30, 34, 38, false], [24, 21, 19, false]],
      [[30, 33, 30, true], [25, 25, 26, false]],
      [[29, 23, 20, false], [25, 30, 35, false]],
      [[29, 27, 27, false], [25, 24, 22, true]]
    ];
    const legs: [LegPose, LegPose] = s.pose === 'walk' ? strides[s.frame] : [[25, 23, 23, false], [31, 33, s.pose === 'shoot' ? 36 : 33, false]];
    leg(legs[0][0], legs[0][1], legs[0][2], false, legs[0][3]);
    leg(legs[1][0], legs[1][1], legs[1][2], true, legs[1][3]);

    ctx.save();
    ctx.translate(s.recoil, s.bob);
    // A split scarf, orange ear module and cyan eye band are the recurring IP marks.
    const tail = s.pose === 'walk' ? [0, -1, 1, 0][s.frame] : 0;
    r(15, 29 + tail, 10, 5, 'ink');
    r(13, 32 + tail, 8, 4, 'ink');
    r(15, 30 + tail, 9, 3, 'pink');
    r(14, 33 + tail, 6, 2, 'plum');
    r(16, 30 + tail, 6, 1, 'blush');
    // Compact battery pack behind the shoulder.
    r(17, 31, 8, 13, 'ink');
    r(18, 32, 5, 10, 'violet');
    r(18, 33, 2, 7, 'teal');
    r(18, 34, 2, 4, 'cyan');
    r(20, 41, 3, 2, 'steel');

    const arm = s.pose === 'walk' ? [1, 0, -1, 0][s.frame] : 0;
    r(20 + arm, 34, 7, 11, 'ink');
    r(21 + arm, 35, 4, 6, 'plum');
    r(21 + arm, 41, 5, 4, 'dark');
    r(22 + arm, 41, 3, 2, 'steel');
    // Boxy cropped jacket, asymmetric neon piping and zipper.
    r(23, 30, 14, 16, 'ink');
    r(22, 33, 17, 10, 'ink');
    r(24, 31, 11, 3, 'blush');
    r(24, 34, 12, 9, 'pink');
    r(23, 35, 3, 7, 'plum');
    r(26, 33, 3, 10, 'dark');
    r(27, 34, 1, 8, 'cyan');
    r(31, 35, 4, 2, 'blush');
    r(32, 39, 3, 2, 'plum');
    r(24, 43, 13, 3, 'dark');
    r(25, 43, 10, 1, 'steel');
    r(29, 44, 3, 2, 'orange');

    // Broad visor head, warm chin and a bright, broken silver fringe.
    r(23, 12, 14, 3, 'ink');
    r(20, 15, 20, 10, 'ink');
    r(21, 24, 18, 5, 'ink');
    r(25, 28, 10, 3, 'ink');
    r(24, 15, 13, 11, 'skin');
    r(26, 25, 11, 4, 'skin');
    r(27, 29, 6, 2, 'skin');
    r(34, 27, 3, 1, 'violet');
    r(22, 13, 11, 3, 'silver');
    r(25, 11, 9, 3, 'silver');
    r(27, 11, 5, 1, 'white');
    r(32, 13, 5, 4, 'silver');
    r(21, 16, 15, 4, 'silver');
    r(22, 15, 5, 3, 'white');
    r(20, 18, 5, 5, 'silver');
    r(21, 21, 3, 3, 'steel');
    r(25, 18, 5, 3, 'silver');
    r(25, 18, 2, 4, 'white');
    r(32, 17, 6, 3, 'steel');
    r(24, 21, 16, 5, 'dark');
    r(27, 21, 12, 3, 'cyan');
    r(28, 21, 5, 1, 'ice');
    r(37, 22, 3, 2, 'ice');
    r(26, 24, 12, 1, 'teal');
    r(21, 23, 5, 6, 'ink');
    r(22, 23, 3, 5, 'orange');
    r(23, 24, 1, 2, 'white');
    r(21, 28, 5, 1, 'plum');
    r(24, 30, 3, 2, 'cyan');

    // The forward arm lifts the blaster on a click; the whole upper body recoils.
    const firing = s.pose === 'shoot';
    if (firing) {
      r(34, 32, 7, 8, 'ink');
      r(35, 33, 5, 5, 'pink');
      r(35, 33, 4, 1, 'blush');
      r(38, 34, 9, 6, 'ink');
      r(39, 35, 6, 3, 'steel');
      r(40, 35, 4, 1, 'silver');
    } else {
      r(34, 33, 7, 9, 'ink');
      r(35, 34, 5, 5, 'pink');
      r(35, 34, 4, 1, 'blush');
      r(36, 39, 7, 5, 'ink');
      r(37, 40, 5, 3, 'steel');
      r(38, 40, 3, 1, 'silver');
    }
    const gx = firing ? 42 : 39;
    const gy = firing ? 29 : 36;
    r(gx + 1, gy + 5, 4, 6, 'ink');
    r(gx + 2, gy + 6, 2, 4, 'violet');
    r(gx, gy, 12, 7, 'ink');
    r(gx + 11, gy + 2, 3, 4, 'ink');
    r(gx + 1, gy + 1, 10, 4, 'steel');
    r(gx + 2, gy + 1, 7, 1, 'silver');
    r(gx + 1, gy + 3, 4, 2, 'dark');
    r(gx + 5, gy + 2, 4, 2, 'cyan');
    r(gx + 11, gy + 2, 2, 3, 'teal');
    r(gx + 13, gy + 2, 1, 3, 'cyan');
    if (firing && s.flash) {
      r(56, 30, 5, 5, 'cyan');
      r(58, 28, 2, 9, 'cyan');
      r(60, 31, 3, 3, 'ice');
      r(56, 31, 5, 3, 'ice');
      r(57, 32, 6, 1, 'white');
    }
    ctx.restore();
    ctx.restore();
  }
