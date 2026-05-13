// ═══ Game Constants ═══
export const APP_TITLE = "Cognitive Aid";
export const LAPSE_THRESHOLD_MS = 8000;
export const LAPSE_MAX_DURATION_MS = 60000;
export const GAME_DURATION_MS = 4 * 60 * 1000;
export const RESULTS_PASSWORD = "btp123";

export const GAME_CATEGORIES = {
  numbers: "Grid",
  objects: "Objects",
};

export const GAME_MODES = {
  normal: "Normal",
  reverse: "Mental Reversal",
  rotate_90: "Grid Rotation 90°",
  rotate_180: "Grid Rotation 180°",
  reverse_rot90: "Reversal + Rotation 90°",
  reverse_rot180: "Reversal + Rotation 180°",
  letter_assoc: "Letter Association",
  letter_reverse: "Letter + Reversal",
  mixed: "Mixed (changes each level)",
};

export const OBJECTS_ALLOWED_MODES = { normal: "Normal", reverse: "Mental Reversal" };

export const MIXED_MODE_POOL = ["normal", "reverse", "rotate_90", "rotate_180", "letter_assoc"];
export const LETTER_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const TRIALS_TO_ADVANCE = 5;
export const TRIALS_TO_RECOVER = 4;
export const LEVELS_PER_GRID_TIER = 4;
export const GRID_TIERS = [3, 4, 5];

export const LEVELS = [
  { level: 1, count: 1, show_ms: 1000, gap_ms: 500 },
  { level: 2, count: 2, show_ms: 920, gap_ms: 430 },
  { level: 3, count: 3, show_ms: 850, gap_ms: 380 },
  { level: 4, count: 4, show_ms: 780, gap_ms: 330 },
  { level: 5, count: 5, show_ms: 710, gap_ms: 290 },
  { level: 6, count: 6, show_ms: 650, gap_ms: 250 },
  { level: 7, count: 7, show_ms: 590, gap_ms: 220 },
  { level: 8, count: 8, show_ms: 530, gap_ms: 200 },
  { level: 9, count: 9, show_ms: 470, gap_ms: 180 },
];

export const SHAPE_CONFIGS = {
  1: { color: "#87ceeb", size: 220, seed: 137 },
  2: { color: "#87ceeb", size: 180, seed: 274 },
  3: { color: "#87ceeb", size: 260, seed: 411 },
  4: { color: "#87ceeb", size: 200, seed: 548 },
  5: { color: "#87ceeb", size: 240, seed: 685 },
  6: { color: "#87ceeb", size: 210, seed: 822 },
  7: { color: "#87ceeb", size: 250, seed: 959 },
  8: { color: "#87ceeb", size: 190, seed: 1096 },
  9: { color: "#87ceeb", size: 230, seed: 1233 },
};
