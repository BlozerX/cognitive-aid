import { LEVELS, GAME_MODES, GAME_CATEGORIES, SHAPE_CONFIGS } from "./constants.js";
import { drawShape, isPointInShape } from "./shapes.js";
import { openResultsDashboard } from "./results.js";
import { RESULTS_PASSWORD } from "./constants.js";

export class GameUI {
  constructor() {
    this.engine = null; // Injected after creation
    this.els = {
      playerName: document.getElementById("player-name"),
      playerAge: document.getElementById("player-age"),
      currentPlayerLabel: document.getElementById("current-player-label"),
      gameCategory: document.getElementById("game-category"),
      gameMode: document.getElementById("game-mode"),
      btnStart: document.getElementById("btn-start"),
      btnReset: document.getElementById("btn-reset"),
      btnResults: document.getElementById("btn-results"),
      btnDeletePlayer: document.getElementById("btn-delete-player"),
      
      statusMode: document.getElementById("status-mode"),
      statusSubmode: document.getElementById("status-submode"),
      
      statLevel: document.getElementById("stat-level"),
      statScore: document.getElementById("stat-score"),
      statBest: document.getElementById("stat-best"),
      statStars: document.getElementById("stat-stars"),
      statLives: document.getElementById("stat-lives"),
      statAccuracy: document.getElementById("stat-accuracy"),
      
      infoAvgResp: document.getElementById("info-avg-resp"),
      infoLapses: document.getElementById("info-lapses"),
      infoLapseTotal: document.getElementById("info-lapse-total"),
      infoLifetimeAcc: document.getElementById("info-lifetime-acc"),
      
      messageText: document.getElementById("message-text"),
      timerText: document.getElementById("timer-text"),
      
      gridContainer: document.getElementById("grid-container"),
      gridWrapper: document.getElementById("grid-wrapper"),
      shapesCanvas: document.getElementById("shapes-canvas"),
      
      popupOverlay: document.getElementById("popup-overlay"),
      popupBox: document.getElementById("popup-box"),
      popupText: document.getElementById("popup-text"),
    };

    this.ctx = this.els.shapesCanvas.getContext("2d");
    this.floatAnimId = null;
    this.floatingShapes = [];
    
    this.setupListeners();
  }

  setEngine(engine) {
    this.engine = engine;
  }

  setupListeners() {
    this.els.gameCategory.addEventListener("change", () => {
      this.updateModeOptions();
      if (this.engine) this.rebuildGrid();
    });

    this.els.btnStart.addEventListener("click", () => {
      if (!this.engine) return;
      this.engine.startGame(
        this.els.playerName.value,
        this.els.playerAge.value,
        this.els.gameCategory.value,
        this.els.gameMode.value
      );
    });

    this.els.btnReset.addEventListener("click", () => {
      if (this.engine) this.engine.resetGame();
    });

    this.els.btnDeletePlayer.addEventListener("click", () => {
      if (!this.engine) return;
      if (confirm("Are you sure you want to delete this player's data permanently?")) {
        if (this.engine.deleteCurrentPlayer()) {
          this.els.playerName.value = "";
          this.els.playerAge.value = "";
          this.updatePlayerInfo("", "");
        }
      }
    });

    this.els.btnResults.addEventListener("click", () => {
      const pwd = prompt("Enter results password:");
      if (pwd === RESULTS_PASSWORD) {
        openResultsDashboard(this.engine.store);
      } else if (pwd !== null) {
        alert("Incorrect password.");
      }
    });

    // Modals
    document.getElementById("results-close").addEventListener("click", () => {
      document.getElementById("results-modal").classList.add("hidden");
    });

    document.addEventListener("keydown", (e) => {
      if (this.engine) this.engine.recordAppActivity();
      if (this.engine && this.engine.waitingForLetter && /^[a-zA-Z]$/.test(e.key)) {
        this.engine.handleKeyPress(e.key);
      }
    });

    document.addEventListener("mousemove", () => {
      if (this.engine) this.engine.recordAppActivity();
    });
    document.addEventListener("click", () => {
      if (this.engine) this.engine.recordAppActivity();
    });

    // Resize canvas
    window.addEventListener("resize", () => {
      if (this.engine && this.engine.gameCategory === "objects" && this.engine.phase !== "idle" && this.engine.phase !== "finished") {
        this.resizeCanvas();
      }
    });
  }

  updateModeOptions() {
    const cat = this.els.gameCategory.value;
    const modeSelect = this.els.gameMode;
    const current = modeSelect.value;
    
    modeSelect.innerHTML = "";
    if (cat === "objects") {
      modeSelect.innerHTML = `<option value="normal">Normal</option><option value="reverse">Mental Reversal</option>`;
      if (current !== "normal" && current !== "reverse") modeSelect.value = "normal";
      else modeSelect.value = current;
    } else {
      Object.entries(GAME_MODES).forEach(([val, label]) => {
        modeSelect.innerHTML += `<option value="${val}">${label}</option>`;
      });
      modeSelect.value = current;
    }
  }

  updatePlayerInfo(name, age) {
    if (name && age) {
      this.els.playerName.value = name;
      this.els.playerAge.value = age;
      this.els.currentPlayerLabel.textContent = `Current player: ${name}, age ${age}`;
    } else {
      this.els.currentPlayerLabel.textContent = "No player selected";
    }
  }

  updateTimer(timeStr) {
    this.els.timerText.textContent = timeStr;
  }

  showMessage(msg) {
    this.els.messageText.textContent = msg;
  }

  showPopup(msg, type) {
    this.els.popupText.textContent = msg;
    this.els.popupBox.className = "popup-box " + type;
    this.els.popupOverlay.classList.remove("hidden");
    setTimeout(() => {
      this.els.popupOverlay.classList.add("hidden");
    }, 1500);
  }

  promptForLetter(step, total) {
    this.showMessage(`Step ${step}/${total}: Type the letter for the selected cell!`);
  }

  promptForNextCell(step, total) {
    this.showMessage(`Step ${step}/${total}: Click the next cell...`);
  }

  showLetterOnCell(number, letter) {
    const cell = document.getElementById(`cell-${number}`);
    if (cell && this.engine.gameCategory === "numbers") {
      cell.innerHTML = `<span class="cell-letter" style="display:inline-block; transform: rotate(-${this.engine.rotationDegrees}deg)">${letter}</span>`;
    }
  }

  updateStats() {
    if (!this.engine) return;
    const s = this.engine.currentSession;
    const p = this.engine.activePlayer;

    const currentLvl = LEVELS[this.engine.levelIndex].level;
    this.els.statLevel.textContent = this.engine.gameCategory === "numbers" && this.engine.gridSize > 3 && this.engine.started
      ? `${currentLvl} (${this.engine.gridSize}×${this.engine.gridSize})`
      : currentLvl;
    
    this.els.statScore.textContent = this.engine.score;
    this.els.statBest.textContent = this.engine.bestScore;
    this.els.statStars.textContent = this.engine.stars;
    this.els.statLives.textContent = Array.from({length:3}).map((_,i)=>i<this.engine.lives?"❤":"♡").join(" ");

    const sAcc = s.rounds_played ? Math.round((s.rounds_correct / s.rounds_played) * 100) : 0;
    this.els.statAccuracy.textContent = `${sAcc}%`;

    const lAcc = p && p.lifetime.rounds_played ? Math.round((p.lifetime.rounds_correct / p.lifetime.rounds_played) * 100) : 0;
    this.els.infoLifetimeAcc.textContent = `${lAcc}%`;

    const avg = s.response_times_ms.length ? Math.round(s.response_times_ms.reduce((a,b)=>a+b,0) / s.response_times_ms.length) : 0;
    this.els.infoAvgResp.textContent = `${(avg/1000).toFixed(1)}s`;
    this.els.infoLapses.textContent = s.lapse_count;
    this.els.infoLapseTotal.textContent = `${(s.total_lapse_duration_ms/1000).toFixed(1)}s`;

    // Status
    const catLabel = GAME_CATEGORIES[this.engine.gameCategory];
    const modeLabel = GAME_MODES[this.engine.gameMode];
    this.els.statusMode.textContent = `${catLabel} — ${modeLabel}`;
    
    if (this.engine.gameMode === "mixed") {
      this.els.statusSubmode.textContent = `Active: ${GAME_MODES[this.engine.currentActiveMode]}`;
    } else {
      this.els.statusSubmode.textContent = "";
    }
  }

  onGameStart() {
    this.updateModeOptions();
    this.rebuildGrid();
    this.updateStats();
  }

  onGameReset() {
    this.els.timerText.textContent = "";
    this.els.messageText.textContent = "Enter player details, choose a game type, and click Start Game.";
    this.stopFloatAnimation();
    this.els.gridWrapper.style.transform = `rotate(0deg)`;
  }

  onGameFinished() {
    this.els.timerText.textContent = "";
    this.stopFloatAnimation();
    this.els.gridWrapper.style.transform = `rotate(0deg)`;
  }

  showGameOver(expected) {
    this.showMessage(`Game over. Correct order was ${expected.join(", ")}.`);
    this.stopFloatAnimation();
  }

  prepareRound() {
    this.updateStats();
    this.els.gridWrapper.style.transform = `rotate(0deg)`;
    this.rebuildGrid(); // Clear previous selections and letters
    this.showMessage("Watch the sequence...");

    if (this.engine.gameCategory === "objects") {
      this.startFloatAnimation();
    }
  }

  onInputPhaseStarted() {
    this.showMessage(this.engine.isLetterMode() ? "Step 1: Click the first cell..." : "Your turn! Repeat the sequence.");
  }

  // --- Grid & DOM ---
  rebuildGrid() {
    this.els.gridWrapper.innerHTML = "";
    const isObjects = this.engine.gameCategory === "objects";
    const totalCells = isObjects ? 9 : this.engine.gridSize * this.engine.gridSize;

    if (isObjects) {
      this.els.gridWrapper.className = "grid-3";
      this.els.shapesCanvas.style.display = "none";
      this.els.gridWrapper.style.display = "grid";
    } else {
      this.els.gridWrapper.className = `grid-${this.engine.gridSize}`;
      this.els.shapesCanvas.style.display = "none";
      this.els.gridWrapper.style.display = "grid";
    }

    for (let number = 1; number <= totalCells; number++) {
      const cell = document.createElement("div");
      cell.className = "grid-cell" + (isObjects ? " no-border" : "");
      cell.id = `cell-${number}`;
      
      if (isObjects) {
        // Draw shape directly to a small inline canvas for the grid
        const sc = document.createElement("canvas");
        sc.width = 100;
        sc.height = 100;
        drawShape(sc.getContext("2d"), number, 50, 50);
        cell.appendChild(sc);
      }

      cell.addEventListener("mousedown", () => {
        if (this.engine) this.engine.handleCellClick(number);
      });
      this.els.gridWrapper.appendChild(cell);
    }
  }

  highlightCell(number, letter = null) {
    if (this.engine.gameCategory === "objects" && this.floatAnimId) {
      // It's floating canvas
      const shape = this.floatingShapes.find(s => s.number === number);
      if (shape) shape.highlight = true;
      return;
    }
    const cell = document.getElementById(`cell-${number}`);
    if (cell) {
      cell.classList.add("highlight");
      if (letter && this.engine.gameCategory === "numbers") {
        cell.innerHTML = `<span class="cell-letter" style="display:inline-block; transform: rotate(-${this.engine.rotationDegrees}deg)">${letter}</span>`;
      }
    }
  }

  clearHighlight(number) {
    if (this.engine.gameCategory === "objects" && this.floatAnimId) {
      const shape = this.floatingShapes.find(s => s.number === number);
      if (shape) shape.highlight = false;
      return;
    }
    const cell = document.getElementById(`cell-${number}`);
    if (cell) cell.classList.remove("highlight");
  }

  updateCellSelection(number) {
    const cell = document.getElementById(`cell-${number}`);
    if (cell) {
      cell.classList.remove("highlight");
      cell.classList.add("selected");
    }
  }

  animateGridRotation(degrees, mode, callback) {
    if (mode === "objects" && this.floatAnimId) {
      // Fallback if still floating (shouldn't happen, but just in case)
      callback();
      return;
    }
    this.els.gridWrapper.style.transform = `rotate(${this.engine.rotationDegrees + degrees}deg)`;
    setTimeout(callback, 600); // match CSS transition duration
  }

  // --- Canvas Floating Animation ---
  resizeCanvas() {
    const rect = this.els.gridContainer.getBoundingClientRect();
    this.els.shapesCanvas.width = Math.max(rect.width, 800);
    this.els.shapesCanvas.height = Math.max(rect.height, 600); // larger minimum height
  }

  startFloatAnimation() {
    this.els.gridWrapper.style.display = "none";
    this.els.shapesCanvas.style.display = "block";
    this.resizeCanvas();

    const w = this.els.shapesCanvas.width;
    const h = this.els.shapesCanvas.height;
    const n = LEVELS[this.engine.levelIndex].level;
    const numMoving = n >= 4 ? 9 : 2 * n;

    this.floatingShapes = [];
    const colW = w / 3;
    const rowH = h / 3;

    for (let i = 1; i <= 9; i++) {
      const r = Math.floor((i - 1) / 3);
      const c = (i - 1) % 3;
      const size = SHAPE_CONFIGS[i].size;
      let x = c * colW + (colW - size) / 2;
      let y = r * rowH + (rowH - size) / 2;
      let dx = 0, dy = 0;
      if (i <= numMoving) {
        dx = (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random());
        dy = (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random());
      }
      this.floatingShapes.push({ number: i, x, y, dx, dy, size, highlight: false });
    }

    if (!this.floatAnimId) {
      const loop = () => {
        this.updateFloatPhysics();
        this.drawFloatCanvas();
        this.floatAnimId = requestAnimationFrame(loop);
      };
      this.floatAnimId = requestAnimationFrame(loop);
    }

    // Canvas click handling (if user clicks while floating, which shouldn't happen based on state, but just in case)
    this.els.shapesCanvas.onclick = (e) => {
      if (this.engine.phase !== "input") return;
      const rect = this.els.shapesCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      // Hit test reverse order to click top ones
      for (let i = this.floatingShapes.length - 1; i >= 0; i--) {
        const s = this.floatingShapes[i];
        if (isPointInShape(mx, my, s.x, s.y, s.size)) {
          this.engine.handleCellClick(s.number);
          break;
        }
      }
    };
  }

  stopFloatAnimation() {
    if (this.floatAnimId) {
      cancelAnimationFrame(this.floatAnimId);
      this.floatAnimId = null;
    }
    this.els.shapesCanvas.style.display = "none";
    this.els.gridWrapper.style.display = "grid";
  }

  updateFloatPhysics() {
    const w = this.els.shapesCanvas.width;
    const h = this.els.shapesCanvas.height;

    for (const s of this.floatingShapes) {
      if (s.dx === 0 && s.dy === 0) continue;
      s.x += s.dx;
      s.y += s.dy;

      // Wall bounce
      if (s.x <= 0 || s.x + s.size >= w) { s.dx *= -1; s.x = Math.max(0, Math.min(s.x, w - s.size)); }
      if (s.y <= 0 || s.y + s.size >= h) { s.dy *= -1; s.y = Math.max(0, Math.min(s.y, h - s.size)); }
    }

    // Shape collision (basic elastic)
    for (let i = 0; i < this.floatingShapes.length; i++) {
      for (let j = i + 1; j < this.floatingShapes.length; j++) {
        const s1 = this.floatingShapes[i];
        const s2 = this.floatingShapes[j];
        const c1x = s1.x + s1.size/2, c1y = s1.y + s1.size/2;
        const c2x = s2.x + s2.size/2, c2y = s2.y + s2.size/2;
        const dist = Math.hypot(c1x - c2x, c1y - c2y);
        const minDist = (s1.size + s2.size) / 2 * 0.95;

        if (dist < minDist) {
          if (s1.dx === 0 && s1.dy === 0 && s2.dx === 0 && s2.dy === 0) continue;
          const overlap = minDist - dist;
          const angle = Math.atan2(c2y - c1y, c2x - c1x);
          
          if (s1.dx === 0 && s1.dy === 0) {
            s2.dx *= -1; s2.dy *= -1;
            s2.x += Math.cos(angle) * overlap; s2.y += Math.sin(angle) * overlap;
          } else if (s2.dx === 0 && s2.dy === 0) {
            s1.dx *= -1; s1.dy *= -1;
            s1.x -= Math.cos(angle) * overlap; s1.y -= Math.sin(angle) * overlap;
          } else {
            // Swap velocities
            [s1.dx, s2.dx] = [s2.dx, s1.dx];
            [s1.dy, s2.dy] = [s2.dy, s1.dy];
            s1.x -= Math.cos(angle) * overlap / 2; s1.y -= Math.sin(angle) * overlap / 2;
            s2.x += Math.cos(angle) * overlap / 2; s2.y += Math.sin(angle) * overlap / 2;
          }
        }
      }
    }
  }

  drawFloatCanvas() {
    this.ctx.clearRect(0, 0, this.els.shapesCanvas.width, this.els.shapesCanvas.height);
    for (const s of this.floatingShapes) {
      let tint = null;
      if (s.highlight) tint = "#f59e0b";
      else if (this.engine.selected.includes(s.number)) tint = "#ea580c";
      
      const c = document.createElement("canvas");
      c.width = s.size + 10; c.height = s.size + 10;
      drawShape(c.getContext("2d"), s.number, s.size/2, s.size/2, tint);
      this.ctx.drawImage(c, s.x - 5, s.y - 5);
    }
  }
}
