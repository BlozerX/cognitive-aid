// ═══ Shape Generator (canvas-based blob shapes) ═══
import { SHAPE_CONFIGS } from "./constants.js";

// Simple seeded RNG
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateBlobPath(size, seed) {
  const rng = seededRandom(seed);
  const cx = size / 2, cy = size / 2;
  const baseR = size / 2 * 0.85;
  const numPoints = Math.floor(rng() * 10) + 12;
  const angles = [];
  const radii = [];
  for (let i = 0; i < numPoints; i++) {
    angles.push((2 * Math.PI * i) / numPoints);
    radii.push(baseR * (0.3 + rng() * 0.7));
  }

  const points = [];
  for (let i = 0; i < numPoints; i++) {
    for (let t = 0; t < 4; t++) {
      const frac = t / 4;
      const iNext = (i + 1) % numPoints;
      let angle = angles[i] + frac * (angles[iNext] - angles[i] + (angles[iNext] < angles[i] ? 2 * Math.PI : 0));
      const r = radii[i] + frac * (radii[iNext] - radii[i]);
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
  }
  return points;
}

export function drawShape(ctx, number, x, y, tint) {
  const cfg = SHAPE_CONFIGS[number];
  if (!cfg) return;
  const size = cfg.size;
  const points = generateBlobPath(size, cfg.seed);

  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();

  const fillColor = tint || cfg.color;
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = fillColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// Check if a point is inside a shape's bounding circle
export function isPointInShape(px, py, shapeX, shapeY, size) {
  const cx = shapeX + size / 2;
  const cy = shapeY + size / 2;
  const dist = Math.hypot(px - cx, py - cy);
  return dist < size / 2;
}
