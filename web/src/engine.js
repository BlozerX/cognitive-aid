import {
  LEVELS, GAME_MODES, GAME_CATEGORIES, MIXED_MODE_POOL, LETTER_POOL,
  TRIALS_TO_ADVANCE, TRIALS_TO_RECOVER, LEVELS_PER_GRID_TIER, GRID_TIERS,
  LAPSE_THRESHOLD_MS, LAPSE_MAX_DURATION_MS, GAME_DURATION_MS
} from "./constants.js";
import { loadStore, saveStore, emptySessionStats, createEmptyPlayer, normalizePlayerKey } from "./store.js";
import { openResultsDashboard } from "./results.js";

export class MemoryGameEngine {
  constructor(ui) {
    this.ui = ui; // UI controller injected
    this.store = loadStore();
    this.activePlayerKey = null;
    this.activePlayer = null;

    // State variables
    this.started = false;
    this.phase = "idle";
    this.levelIndex = 0; // 0-indexed, corresponds to level 1
    this.sequence = [];
    this.selected = [];
    this.score = 0;
    this.stars = 0;
    this.lives = 3;
    this.bestScore = 0;

    // Progression
    this.consecutiveCorrect = 0;
    this.recoveryMode = false;
    this.recoveryTargetLevel = 0;
    this.gridTierIndex = 0;
    this.gridSize = GRID_TIERS[0];
    this.levelsCompletedInTier = 0;

    // Modes & Categories
    this.gameCategory = "numbers";
    this.gameMode = "normal";
    this.currentActiveMode = "normal"; // Resolves 'mixed'
    
    // Letter Assoc
    this.letterAssignments = {};
    this.waitingForLetter = false;
    this.letterStepIndex = 0;

    // Sessions & Tracking
    this.currentSession = emptySessionStats();
    this.roundInputStartMs = null;
    this.sessionStartMs = null;
    this.pendingPersisted = false;
    this.stopAfterRound = false;

    // Timers
    this.lastAppActivityMs = Date.now();
    this.currentIdleLapseStartMs = null;
    this.globalLapseWatchJob = null;
    this.showJob = null;
    this.nextRoundJob = null;
    this.sessionTimerJob = null;

    // Animation & View state
    this.rotationDegrees = 0;
    
    this.init();
  }

  init() {
    this.loadLastPlayer();
    this.startGlobalLapseWatch();
  }

  loadLastPlayer() {
    const key = this.store.last_player_key;
    const p = this.store.players[key];
    if (p) {
      this.activePlayerKey = key;
      this.activePlayer = p;
      this.bestScore = p.lifetime?.best_score || 0;
      this.ui.updatePlayerInfo(p.name, p.age);
    }
  }

  savePlayer() {
    if (this.activePlayerKey) {
      this.store.players[this.activePlayerKey] = this.activePlayer;
      this.store.last_player_key = this.activePlayerKey;
      saveStore(this.store);
    }
  }

  startGame(name, age, category, mode) {
    if (!name || !age) {
      this.ui.showMessage("Please enter player name and age first.");
      return;
    }
    const key = normalizePlayerKey(name, age);
    if (!this.store.players[key]) {
      this.store.players[key] = createEmptyPlayer(name, age);
    } else {
      this.store.players[key].name = name;
      this.store.players[key].age = age;
      this.store.players[key].updated_at = new Date().toISOString().slice(0, 19);
    }

    this.activePlayerKey = key;
    this.activePlayer = this.store.players[key];
    this.savePlayer();

    this.gameCategory = category;
    this.gameMode = mode;
    this.started = true;
    this.phase = "idle";
    this.levelIndex = 1; // Start from level 2 (index 1) like Python
    this.score = 0;
    this.stars = 0;
    this.lives = 3;
    this.bestScore = this.activePlayer.lifetime?.best_score || 0;

    this.consecutiveCorrect = 0;
    this.recoveryMode = false;
    this.recoveryTargetLevel = 0;
    this.gridTierIndex = 0;
    this.gridSize = GRID_TIERS[0];
    this.levelsCompletedInTier = 0;

    this.letterAssignments = {};
    this.waitingForLetter = false;
    this.letterStepIndex = 0;
    this.rotationDegrees = 0;
    this.currentActiveMode = (mode === "mixed") ? MIXED_MODE_POOL[Math.floor(Math.random() * MIXED_MODE_POOL.length)] : mode;

    this.currentSession = emptySessionStats();
    this.currentSession.started_at = new Date().toISOString().slice(0, 19);
    this.currentSession.mode = mode;
    this.currentSession.category = category;
    this.currentSession.highest_level_reached = LEVELS[this.levelIndex].level;
    this.pendingPersisted = false;
    this.sessionStartMs = Date.now();
    this.stopAfterRound = false;

    this.ui.onGameStart();
    this.recordAppActivity();
    this.startSessionTimer();
    this.startRound();
  }

  startSessionTimer() {
    this.stopSessionTimer();
    const update = () => {
      if (!this.started || !this.sessionStartMs) return;
      const elapsed = Date.now() - this.sessionStartMs;
      const remaining = Math.max(GAME_DURATION_MS - elapsed, 0);
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      this.ui.updateTimer(`${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`);

      if (elapsed >= GAME_DURATION_MS) {
        this.stopAfterRound = true;
        if (this.phase === "idle" || this.phase === "result") {
          this.finishGameDueToTime();
          return;
        }
      }
      this.sessionTimerJob = setTimeout(update, 250);
    };
    update();
  }

  stopSessionTimer() {
    if (this.sessionTimerJob) clearTimeout(this.sessionTimerJob);
    this.sessionTimerJob = null;
  }

  getEffectiveMode() {
    return this.gameMode === "mixed" ? this.currentActiveMode : this.gameMode;
  }
  isLetterMode() { return ["letter_assoc", "letter_reverse"].includes(this.getEffectiveMode()); }
  isRotationMode() { return ["rotate_90", "rotate_180", "reverse_rot90", "reverse_rot180"].includes(this.getEffectiveMode()); }
  isReverseMode() { return ["reverse", "reverse_rot90", "reverse_rot180", "letter_reverse"].includes(this.getEffectiveMode()); }
  getRotationDegreesForMode() {
    const m = this.getEffectiveMode();
    if (m === "rotate_90" || m === "reverse_rot90") return 90;
    if (m === "rotate_180" || m === "reverse_rot180") return 180;
    return 0;
  }

  startRound(newLevelIndex = null) {
    if (newLevelIndex !== null) {
      this.levelIndex = Math.min(newLevelIndex, LEVELS.length - 1);
    }
    this.cancelJobs();
    this.rotationDegrees = 0;
    
    if (this.gameMode === "mixed") {
      this.currentActiveMode = MIXED_MODE_POOL[Math.floor(Math.random() * MIXED_MODE_POOL.length)];
    }

    const currentLevel = LEVELS[this.levelIndex];
    const isObjects = this.gameCategory === "objects";
    const totalCells = isObjects ? 9 : this.gridSize * this.gridSize;
    const count = Math.min(currentLevel.count, totalCells);

    // Generate sequence
    const cells = Array.from({length: totalCells}, (_, i) => i + 1);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    this.sequence = cells.slice(0, count);
    this.selected = [];
    this.roundInputStartMs = null;
    this.waitingForLetter = false;
    this.letterStepIndex = 0;
    this.phase = "show_sequence";

    if (this.isLetterMode()) {
      const letters = [...LETTER_POOL];
      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
      this.letterAssignments = {};
      for (let i = 0; i < count; i++) {
        this.letterAssignments[this.sequence[i]] = letters[i];
      }
    } else {
      this.letterAssignments = {};
    }

    this.ui.prepareRound();
    this.showSequenceStep(0);
  }

  showSequenceStep(index) {
    if (this.phase !== "show_sequence") return;
    
    if (index >= this.sequence.length) {
      const isObjects = this.gameCategory === "objects";
      const extraDelay = isObjects ? 1000 : 0;
      const rotDeg = this.getRotationDegreesForMode();

      if (rotDeg > 0) {
        this.phase = "rotate_pause";
        this.nextRoundJob = setTimeout(() => {
          this.ui.animateGridRotation(rotDeg, isObjects ? "objects" : "boxes", () => {
            this.rotationDegrees = (this.rotationDegrees + rotDeg) % 360;
            this.enterInputPhase();
          });
        }, extraDelay);
      } else {
        if (extraDelay) {
          this.nextRoundJob = setTimeout(() => this.enterInputPhase(), extraDelay);
        } else {
          this.enterInputPhase();
        }
      }
      return;
    }

    const number = this.sequence[index];
    this.ui.highlightCell(number, this.letterAssignments[number]);
    const showMs = LEVELS[this.levelIndex].show_ms;
    
    this.showJob = setTimeout(() => {
      this.ui.clearHighlight(number);
      const gapMs = LEVELS[this.levelIndex].gap_ms;
      this.showJob = setTimeout(() => this.showSequenceStep(index + 1), gapMs);
    }, showMs);
  }

  enterInputPhase() {
    this.phase = "input";
    this.roundInputStartMs = Date.now();
    this.ui.onInputPhaseStarted();
  }

  handleCellClick(number) {
    if (this.phase !== "input" || this.waitingForLetter || this.selected.includes(number)) return;
    
    this.recordAppActivity();
    this.selected.push(number);
    this.ui.updateCellSelection(number);

    const expectedSeq = this.getExpectedSequence();
    const stepIndex = this.selected.length - 1;

    if (this.selected[stepIndex] !== expectedSeq[stepIndex]) {
      this.evaluateAttempt(this.selected.slice());
      return;
    }

    if (this.isLetterMode()) {
      this.waitingForLetter = true;
      this.letterStepIndex = stepIndex;
      this.ui.promptForLetter(stepIndex + 1, expectedSeq.length);
      return;
    }

    const currentLevel = LEVELS[this.levelIndex];
    const totalCells = this.gameCategory === "objects" ? 9 : this.gridSize * this.gridSize;
    const count = Math.min(currentLevel.count, totalCells);

    if (this.selected.length === count) {
      this.evaluateAttempt(this.selected.slice());
    }
  }

  handleKeyPress(char) {
    if (!this.waitingForLetter || this.phase !== "input") return;
    const typed = char.toUpperCase();
    if (!/^[A-Z]$/.test(typed)) return;
    
    this.recordAppActivity();
    const expectedSeq = this.getExpectedSequence();
    const expectedCell = expectedSeq[this.letterStepIndex];
    const expectedLetter = this.letterAssignments[expectedCell] || "";
    
    this.waitingForLetter = false;

    if (typed === expectedLetter) {
      this.ui.showLetterOnCell(expectedCell, expectedLetter);
      this.letterStepIndex++;
      if (this.letterStepIndex >= expectedSeq.length) {
        this.evaluateAttempt(this.selected.slice());
      } else {
        this.ui.promptForNextCell(this.letterStepIndex + 1, expectedSeq.length);
      }
    } else {
      this.selected.push(-1);
      this.evaluateAttempt(this.selected.slice());
    }
  }

  getExpectedSequence() {
    return this.isReverseMode() ? [...this.sequence].reverse() : [...this.sequence];
  }

  evaluateAttempt(attempt) {
    const responseTimeMs = this.roundInputStartMs ? Date.now() - this.roundInputStartMs : 0;
    const expected = this.getExpectedSequence();
    const correct = JSON.stringify(attempt) === JSON.stringify(expected);
    const levelNumber = LEVELS[this.levelIndex].level;
    const effectiveMode = this.getEffectiveMode();

    this.currentSession.rounds_played++;
    if (correct) this.currentSession.rounds_correct++;
    this.currentSession.response_times_ms.push(responseTimeMs);
    this.currentSession.highest_level_reached = Math.max(this.currentSession.highest_level_reached, levelNumber);

    this.currentSession.level_history.push({
      level: levelNumber,
      correct: correct,
      response_time_ms: responseTimeMs,
      sequence_length: this.sequence.length,
      mode: this.gameMode,
      effective_mode: effectiveMode,
      game_type_label: GAME_MODES[effectiveMode] || effectiveMode,
      expected_sequence: [...expected],
      shown_sequence: [...this.sequence],
      player_sequence: [...attempt],
      grid_rotation_degrees: this.rotationDegrees,
      grid_size: this.gridSize,
      consecutive_correct_before: this.consecutiveCorrect,
    });

    this.phase = "result";

    if (correct) {
      this.score += LEVELS[this.levelIndex].count * 10;
      this.stars++;
    } else {
      this.lives--;
    }

    this.ui.updateStats();

    if (this.lives <= 0) {
      this.ui.showGameOver(expected);
      this.finishGame();
      return;
    }

    this.handleRoundCompletion(correct);
  }

  handleRoundCompletion(correct) {
    const currentLevelNumber = LEVELS[this.levelIndex].level;
    const isObjects = this.gameCategory === "objects";

    if (this.stopAfterRound) {
      this.finishGameDueToTime();
      return;
    }

    if (correct) {
      this.consecutiveCorrect++;
      const required = this.recoveryMode ? TRIALS_TO_RECOVER : TRIALS_TO_ADVANCE;
      this.ui.showPopup("Correct!", "success");

      if (this.consecutiveCorrect >= required) {
        if (this.recoveryMode) {
          this.recoveryMode = false;
          const target = this.recoveryTargetLevel;
          this.recoveryTargetLevel = 0;
          this.consecutiveCorrect = 0;
          this.levelIndex = Math.min(target, LEVELS.length - 1);
          this.ui.showMessage(`Recovery complete! Back to level ${LEVELS[this.levelIndex].level}.`);
        } else {
          this.consecutiveCorrect = 0;
          if (this.levelIndex < LEVELS.length - 1) {
            this.levelIndex++;
            this.levelsCompletedInTier++;
            this.currentSession.highest_level_reached = Math.max(this.currentSession.highest_level_reached, LEVELS[this.levelIndex].level);

            if (!isObjects && this.levelsCompletedInTier >= LEVELS_PER_GRID_TIER) {
              if (this.gridTierIndex < GRID_TIERS.length - 1) {
                this.nextRoundJob = setTimeout(() => this.expandGridTier(), 1500);
                return;
              }
            }
            this.ui.showMessage(`Level ${currentLevelNumber} cleared! Moving to level ${LEVELS[this.levelIndex].level}.`);
          } else {
            this.ui.showMessage(`Amazing! Max level reached. Continuing at level ${currentLevelNumber}.`);
          }
        }
      } else {
        this.ui.showMessage(`✓ Correct! (${this.consecutiveCorrect}/${required} for ${this.recoveryMode ? 'recovery' : 'next level'})`);
      }
    } else {
      const trialPosition = this.consecutiveCorrect + 1;
      this.consecutiveCorrect = 0;

      if (trialPosition >= 3) {
        this.ui.showMessage(`Mistake on trial ${trialPosition}. Restarting level ${currentLevelNumber}.`);
        this.ui.showPopup(`Incorrect.\nRestarting level ${currentLevelNumber}.`, "error");
      } else {
        if (this.recoveryMode) {
          this.recoveryTargetLevel = this.levelIndex;
        } else {
          this.recoveryMode = true;
          this.recoveryTargetLevel = this.levelIndex;
        }
        if (this.levelIndex > 0) this.levelIndex--;
        const demoted = LEVELS[this.levelIndex].level;
        this.ui.showMessage(`Mistake on trial ${trialPosition}. Dropped to level ${demoted}. Get ${TRIALS_TO_RECOVER} correct to recover.`);
        this.ui.showPopup(`Incorrect.\nDropped to level ${demoted}.\nComplete ${TRIALS_TO_RECOVER} correct trials to recover.`, "error");
      }
    }
    this.nextRoundJob = setTimeout(() => this.startRound(), 1500);
  }

  expandGridTier() {
    this.gridTierIndex++;
    this.gridSize = GRID_TIERS[this.gridTierIndex];
    this.levelsCompletedInTier = 0;
    this.levelIndex = 0; // Reset levels for new grid tier
    this.consecutiveCorrect = 0;
    this.ui.rebuildGrid();
    this.ui.showMessage(`Grid expanded to ${this.gridSize}×${this.gridSize}! Levels reset. Keep going!`);
    this.nextRoundJob = setTimeout(() => this.startRound(), 2000);
  }

  finishGameDueToTime() {
    this.ui.showMessage("4 minutes completed. Saving results now.");
    this.finishGame();
  }

  finishGame() {
    if (this.pendingPersisted) return;
    if (this.sessionStartMs) {
      this.currentSession.game_duration_ms = Date.now() - this.sessionStartMs;
    }
    this.started = false;
    this.phase = "finished";
    this.stopSessionTimer();
    this.cancelJobs();
    this.ui.onGameFinished();
    this.persistSessionData(this.score);
    this.pendingPersisted = true;
  }

  persistSessionData(finalScore) {
    if (!this.activePlayerKey) return;
    const player = this.store.players[this.activePlayerKey];
    if (!player) return;

    const rp = this.currentSession.rounds_played;
    const rc = this.currentSession.rounds_correct;
    const rt = this.currentSession.response_times_ms.reduce((a,b)=>a+b, 0);
    const avgRt = rp ? Math.round(rt / rp) : 0;
    const lc = this.currentSession.lapse_count;
    const td = this.currentSession.total_lapse_duration_ms;
    const ad = lc ? Math.round(td / lc) : 0;

    const entry = {
      started_at: this.currentSession.started_at,
      ended_at: new Date().toISOString().slice(0, 19),
      score: finalScore,
      accuracy_percent: rp ? Math.round((rc/rp)*100) : 0,
      rounds_played: rp,
      rounds_correct: rc,
      total_response_time_ms: rt,
      average_response_time_ms: avgRt,
      lapse_count: lc,
      total_lapse_duration_ms: td,
      average_lapse_duration_ms: ad,
      longest_lapse_ms: this.currentSession.longest_lapse_ms,
      lapses: [...this.currentSession.lapses],
      level_history: [...this.currentSession.level_history],
      game_duration_ms: this.currentSession.game_duration_ms,
      mode: this.currentSession.mode,
      mode_label: GAME_MODES[this.currentSession.mode] || this.currentSession.mode,
      category: this.currentSession.category,
      category_label: GAME_CATEGORIES[this.currentSession.category] || "Grid",
      highest_level_reached: this.currentSession.highest_level_reached,
    };

    const lt = player.lifetime;
    lt.rounds_played += rp;
    lt.rounds_correct += rc;
    lt.total_response_time_ms += rt;
    lt.total_lapse_count += lc;
    lt.total_lapse_duration_ms += td;
    lt.longest_lapse_ms = Math.max(lt.longest_lapse_ms, this.currentSession.longest_lapse_ms);
    lt.sessions_played++;
    lt.best_score = Math.max(lt.best_score, finalScore);
    lt.average_response_time_ms = lt.rounds_played ? Math.round(lt.total_response_time_ms / lt.rounds_played) : 0;
    lt.average_lapse_duration_ms = lt.total_lapse_count ? Math.round(lt.total_lapse_duration_ms / lt.total_lapse_count) : 0;

    player.sessions.push(entry);
    player.updated_at = new Date().toISOString().slice(0, 19);
    
    this.bestScore = lt.best_score;
    this.savePlayer();
    this.ui.updateStats();
  }

  // --- Lapses ---
  startGlobalLapseWatch() {
    this.stopGlobalLapseWatch();
    const check = () => {
      const now = Date.now();
      const idleMs = now - this.lastAppActivityMs;
      if (idleMs >= LAPSE_THRESHOLD_MS && !this.currentIdleLapseStartMs) {
        this.currentIdleLapseStartMs = this.lastAppActivityMs;
      }
      if (this.currentIdleLapseStartMs) {
        if (now - this.currentIdleLapseStartMs >= LAPSE_MAX_DURATION_MS) {
          this.recordLapse(this.currentIdleLapseStartMs, LAPSE_MAX_DURATION_MS, "no_input_idle");
          this.currentIdleLapseStartMs = now;
          this.lastAppActivityMs = now;
        }
      }
      this.globalLapseWatchJob = setTimeout(check, 500);
    };
    check();
  }

  stopGlobalLapseWatch() {
    if (this.globalLapseWatchJob) clearTimeout(this.globalLapseWatchJob);
    this.globalLapseWatchJob = null;
  }

  recordAppActivity() {
    const now = Date.now();
    if (this.currentIdleLapseStartMs) {
      const dur = Math.min(now - this.currentIdleLapseStartMs, LAPSE_MAX_DURATION_MS);
      this.recordLapse(this.currentIdleLapseStartMs, dur, "no_input_idle");
      this.currentIdleLapseStartMs = null;
    }
    this.lastAppActivityMs = now;
  }

  recordLapse(startMs, durationMs, trigger) {
    if (durationMs <= 0) return;
    this.currentSession.lapses.push({
      started_at: new Date(startMs).toISOString().slice(0, 19),
      duration_ms: durationMs,
      trigger
    });
    this.currentSession.lapse_count++;
    this.currentSession.total_lapse_duration_ms += durationMs;
    this.currentSession.longest_lapse_ms = Math.max(this.currentSession.longest_lapse_ms, durationMs);
    this.ui.updateStats();
  }

  // --- Reset / Clean ---
  cancelJobs() {
    if (this.showJob) clearTimeout(this.showJob);
    if (this.nextRoundJob) clearTimeout(this.nextRoundJob);
    this.showJob = null;
    this.nextRoundJob = null;
  }

  resetGame() {
    this.recordAppActivity();
    if (this.started && this.currentSession.rounds_played > 0 && !this.pendingPersisted) {
      if (this.sessionStartMs) this.currentSession.game_duration_ms = Date.now() - this.sessionStartMs;
      this.persistSessionData(this.score);
      this.pendingPersisted = true;
    }

    this.cancelJobs();
    this.stopSessionTimer();
    this.ui.onGameReset();
    
    this.started = false;
    this.phase = "idle";
    this.levelIndex = 1;
    this.sequence = [];
    this.selected = [];
    this.score = 0;
    this.stars = 0;
    this.lives = 3;
    this.sessionStartMs = null;
    this.stopAfterRound = false;

    this.consecutiveCorrect = 0;
    this.recoveryMode = false;
    this.recoveryTargetLevel = 0;
    this.gridTierIndex = 0;
    this.gridSize = GRID_TIERS[0];
    this.levelsCompletedInTier = 0;

    this.letterAssignments = {};
    this.waitingForLetter = false;
    this.letterStepIndex = 0;
    this.currentActiveMode = "normal";
    this.rotationDegrees = 0;

    this.currentSession = emptySessionStats();
    this.ui.rebuildGrid();
    this.ui.updateStats();
  }

  deleteCurrentPlayer() {
    if (!this.activePlayerKey) return false;
    delete this.store.players[this.activePlayerKey];
    this.store.last_player_key = "";
    saveStore(this.store);
    this.activePlayerKey = null;
    this.activePlayer = null;
    this.bestScore = 0;
    this.resetGame();
    return true;
  }
}
