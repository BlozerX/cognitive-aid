// ═══ Data persistence via localStorage ═══

const STORAGE_KEY = "grid_memory_game_data";

export function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { players: {}, last_player_key: "" };
    const data = JSON.parse(raw);
    if (typeof data !== "object" || !data) return { players: {}, last_player_key: "" };
    data.players = data.players || {};
    data.last_player_key = data.last_player_key || "";
    return data;
  } catch {
    return { players: {}, last_player_key: "" };
  }
}

export function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function emptySessionStats() {
  return {
    started_at: "",
    rounds_played: 0,
    rounds_correct: 0,
    response_times_ms: [],
    lapse_count: 0,
    total_lapse_duration_ms: 0,
    longest_lapse_ms: 0,
    lapses: [],
    level_history: [],
    game_duration_ms: 0,
    mode: "",
    category: "numbers",
    highest_level_reached: 1,
  };
}

export function createEmptyPlayer(name, age) {
  const now = new Date().toISOString().slice(0, 19);
  return {
    name, age,
    created_at: now,
    updated_at: now,
    lifetime: {
      rounds_played: 0, rounds_correct: 0,
      total_response_time_ms: 0, average_response_time_ms: 0,
      total_lapse_count: 0, total_lapse_duration_ms: 0,
      average_lapse_duration_ms: 0, longest_lapse_ms: 0,
      sessions_played: 0, best_score: 0,
    },
    sessions: [],
  };
}

export function normalizePlayerKey(name, age) {
  return `${name.trim().toLowerCase()}__${String(age).trim()}`;
}
