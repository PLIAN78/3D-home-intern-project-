import type { ProceduralPattern } from "@/lib/models/materials";

/**
 * Canvas-generated textures so the MVP needs no binary assets. Each pattern
 * paints a colour canvas and a matching greyscale height canvas (bump map).
 * Swap for scanned product textures later via MaterialOption.textureUrl.
 */

export interface PaintedTexture {
  color: HTMLCanvasElement;
  bump: HTMLCanvasElement | null;
}

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade([r, g, b]: RGB, f: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

function grey(v: number) {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${c},${c},${c})`;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

class Painter {
  readonly c: CanvasRenderingContext2D;
  readonly h: CanvasRenderingContext2D;
  constructor(readonly color: HTMLCanvasElement, readonly bump: HTMLCanvasElement, readonly size: number) {
    this.c = color.getContext("2d")!;
    this.h = bump.getContext("2d")!;
  }
  rect(x: number, y: number, w: number, h: number, color: string, height: number) {
    this.c.fillStyle = color;
    this.c.fillRect(x, y, w, h);
    this.h.fillStyle = grey(height);
    this.h.fillRect(x, y, w, h);
  }
  /** Draw a rect that wraps across tile edges so patterns tile seamlessly. */
  rectWrapped(x: number, y: number, w: number, h: number, color: string, height: number) {
    const S = this.size;
    for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
      if (x + ox + w < 0 || x + ox > S || y + oy + h < 0 || y + oy > S) continue;
      this.rect(x + ox, y + oy, w, h, color, height);
    }
  }
  noise(amount: number, rand: () => number, scale = 2) {
    const S = this.size;
    for (let i = 0; i < (S * S) / (scale * scale * 2); i++) {
      const x = rand() * S;
      const y = rand() * S;
      const v = rand();
      this.c.fillStyle = v > 0.5 ? `rgba(255,255,255,${amount * (v - 0.5)})` : `rgba(0,0,0,${amount * (0.5 - v)})`;
      this.c.fillRect(x, y, scale, scale);
    }
  }
}

function newCanvas(size: number) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

export function paintPattern(pattern: ProceduralPattern, baseHex: string, accentHex: string | undefined, seed = 7): PaintedTexture | null {
  if (pattern === "plain") return null;
  const S = 512;
  const color = newCanvas(S);
  const bump = newCanvas(S);
  const P = new Painter(color, bump, S);
  const base = hexToRgb(baseHex);
  const accent = hexToRgb(accentHex ?? baseHex);
  const rand = rng(seed * 997 + pattern.length * 31);
  const accentCss = shade(accent, 1);

  switch (pattern) {
    case "brick": {
      // 4 bricks × 6 courses per tile, running bond.
      P.rect(0, 0, S, S, accentCss, 70);
      const cols = 4;
      const rows = 6;
      const bw = S / cols;
      const bh = S / rows;
      const mortar = 10;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? bw / 2 : 0;
        for (let c = -1; c < cols; c++) {
          const v = 0.82 + rand() * 0.32;
          P.rectWrapped(c * bw + off + mortar / 2, r * bh + mortar / 2, bw - mortar, bh - mortar, shade(base, v), 170 + rand() * 50);
        }
      }
      P.noise(0.18, rand, 2);
      break;
    }
    case "stone": {
      P.rect(0, 0, S, S, accentCss, 40);
      let y = 0;
      while (y < S) {
        const h = 40 + Math.floor(rand() * 70);
        let x = -Math.floor(rand() * 120);
        while (x < S) {
          const w = 70 + Math.floor(rand() * 170);
          const v = 0.7 + rand() * 0.5;
          P.rectWrapped(x + 4, y + 4, w - 8, Math.min(h, S - y) - 8, shade(base, v), 140 + rand() * 100);
          x += w;
        }
        y += h;
      }
      P.noise(0.3, rand, 3);
      break;
    }
    case "lap-siding": {
      const boards = 3;
      const bh = S / boards;
      for (let i = 0; i < boards; i++) {
        const y = i * bh;
        const grad = P.c.createLinearGradient(0, y, 0, y + bh);
        grad.addColorStop(0, shade(base, 0.86));
        grad.addColorStop(0.12, shade(base, 1.02));
        grad.addColorStop(1, shade(base, 0.96));
        P.c.fillStyle = grad;
        P.c.fillRect(0, y, S, bh);
        const hg = P.h.createLinearGradient(0, y, 0, y + bh);
        hg.addColorStop(0, grey(40));
        hg.addColorStop(1, grey(220));
        P.h.fillStyle = hg;
        P.h.fillRect(0, y, S, bh);
        P.rect(0, y, S, 3, shade(accent, 0.8), 20);
      }
      P.noise(0.06, rand, 2);
      break;
    }
    case "board-batten": {
      P.rect(0, 0, S, S, shade(base, 1), 120);
      const n = 3;
      for (let i = 0; i < n; i++) {
        const x = (i * S) / n;
        P.rect(x, 0, 6, S, shade(accent, 0.7), 60);
        P.rect(x + 6, 0, 22, S, shade(base, 1.18), 230);
      }
      P.noise(0.08, rand, 2);
      break;
    }
    case "stucco": {
      P.rect(0, 0, S, S, shade(base, 1), 128);
      for (let i = 0; i < 9000; i++) {
        const x = rand() * S;
        const y = rand() * S;
        const v = rand();
        const r = 1 + rand() * 3;
        P.c.fillStyle = v > 0.5 ? shade(base, 1.06) : shade(accent, 0.95);
        P.c.beginPath();
        P.c.arc(x, y, r, 0, Math.PI * 2);
        P.c.fill();
        P.h.fillStyle = grey(v * 255);
        P.h.beginPath();
        P.h.arc(x, y, r, 0, Math.PI * 2);
        P.h.fill();
      }
      break;
    }
    case "shingle": {
      P.rect(0, 0, S, S, accentCss, 30);
      const rows = 5;
      const rh = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rand() * 80;
        while (x < S) {
          const w = 50 + rand() * 90;
          const v = 0.75 + rand() * 0.5;
          P.rectWrapped(x + 2, r * rh + 4, w - 4, rh - 4, shade(base, v), 120 + rand() * 120);
          x += w;
        }
        P.rect(0, r * rh + rh - 8, S, 8, shade(accent, 0.7), 10);
      }
      P.noise(0.35, rand, 2);
      break;
    }
    case "wood-plank": {
      const rows = 8;
      const rh = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rand() * S * 0.5;
        while (x < S) {
          const w = S * (0.35 + rand() * 0.5);
          const v = 0.85 + rand() * 0.28;
          P.rectWrapped(x, r * rh, w - 2, rh - 2, shade(base, v), 200);
          // grain
          for (let g = 0; g < 6; g++) {
            const gy = r * rh + 3 + rand() * (rh - 6);
            P.c.strokeStyle = `rgba(0,0,0,${0.04 + rand() * 0.06})`;
            P.c.lineWidth = 1 + rand() * 1.5;
            P.c.beginPath();
            P.c.moveTo(Math.max(0, x), gy);
            P.c.bezierCurveTo(x + w * 0.3, gy + (rand() - 0.5) * 6, x + w * 0.6, gy + (rand() - 0.5) * 6, Math.min(S, x + w), gy);
            P.c.stroke();
          }
          x += w;
        }
        P.rect(0, r * rh + rh - 2, S, 2, shade(accent, 0.8), 60);
      }
      break;
    }
    case "tile": {
      P.rect(0, 0, S, S, accentCss, 60);
      const n = 2;
      const t = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P.rect(i * t + 3, j * t + 3, t - 6, t - 6, shade(base, 0.96 + rand() * 0.08), 200);
      P.noise(0.05, rand, 3);
      break;
    }
    case "slab": {
      P.rect(0, 0, S, S, shade(base, 1), 128);
      for (let v = 0; v < 7; v++) {
        P.c.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${0.15 + rand() * 0.35})`;
        P.c.lineWidth = 1 + rand() * 3;
        P.c.beginPath();
        let x = rand() * S;
        let y = 0;
        P.c.moveTo(x, y);
        while (y < S) {
          x += (rand() - 0.5) * 60;
          y += 20 + rand() * 40;
          P.c.lineTo(x, y);
        }
        P.c.stroke();
      }
      P.noise(0.05, rand, 2);
      break;
    }
    case "concrete": {
      P.rect(0, 0, S, S, shade(base, 1), 128);
      P.noise(0.12, rand, 3);
      P.noise(0.08, rand, 8);
      break;
    }
    case "grass": {
      P.rect(0, 0, S, S, shade(base, 1), 128);
      for (let i = 0; i < 16000; i++) {
        const x = rand() * S;
        const y = rand() * S;
        P.c.fillStyle = shade(rand() > 0.5 ? base : accent, 0.8 + rand() * 0.45);
        P.c.fillRect(x, y, 1.5, 3 + rand() * 3);
      }
      break;
    }
    case "garage-panel": {
      // Fit-UV: 4 sections × 4 raised panels.
      P.rect(0, 0, S, S, shade(base, 1), 160);
      const rows = 4;
      const cols = 4;
      const rh = S / rows;
      const cw = S / cols;
      for (let r = 0; r < rows; r++) {
        P.rect(0, r * rh, S, 3, shade(accent, 0.75), 40);
        for (let c = 0; c < cols; c++) {
          P.rect(c * cw + 12, r * rh + 14, cw - 24, rh - 28, shade(accent, 1), 110);
          P.rect(c * cw + 18, r * rh + 20, cw - 36, rh - 40, shade(base, 1.03), 220);
        }
      }
      break;
    }
    case "garage-modern": {
      P.rect(0, 0, S, S, shade(base, 1), 160);
      const rows = 4;
      const rh = S / rows;
      for (let r = 1; r < rows; r++) P.rect(0, r * rh - 2, S, 4, shade(base, 0.6), 30);
      // frosted glass strip in the top section (canvas y=0 is the top of the door)
      P.rect(20, 20, S - 40, rh - 40, shade(accent, 1.1), 120);
      for (let c = 1; c < 6; c++) P.rect((c * S) / 6 - 3, 20, 6, rh - 40, shade(base, 1), 160);
      break;
    }
    case "door-panel": {
      P.rect(0, 0, S, S, shade(base, 1), 180);
      const insets: [number, number, number, number][] = [
        [0.12, 0.06, 0.34, 0.22], [0.54, 0.06, 0.34, 0.22],
        [0.12, 0.34, 0.34, 0.26], [0.54, 0.34, 0.34, 0.26],
        [0.12, 0.66, 0.34, 0.28], [0.54, 0.66, 0.34, 0.28],
      ];
      for (const [x, y, w, h] of insets) {
        P.rect(x * S, y * S, w * S, h * S, shade(accent, 1), 90);
        P.rect(x * S + 8, y * S + 8, w * S - 16, h * S - 16, shade(base, 1.08), 200);
      }
      break;
    }
    case "door-modern": {
      P.rect(0, 0, S, S, shade(base, 1), 180);
      for (let i = 1; i < 10; i++) P.rect((i * S) / 10, 0, 3, S, shade(accent, 1), 60);
      P.rect(S * 0.72, S * 0.08, S * 0.12, S * 0.84, "rgb(170,190,205)", 120);
      break;
    }
    case "shaker": {
      // One cabinet door per tile: frame + recessed centre panel.
      P.rect(0, 0, S, S, shade(accent, 0.8), 40);
      P.rect(6, 6, S - 12, S - 12, shade(base, 1), 200);
      P.rect(70, 70, S - 140, S - 140, shade(accent, 1.02), 120);
      P.rect(80, 80, S - 160, S - 160, shade(base, 0.97), 140);
      P.rect(S - 50, S / 2 - 50, 10, 100, "rgb(80,80,82)", 255);
      break;
    }
  }
  return { color, bump };
}
