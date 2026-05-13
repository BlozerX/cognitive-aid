import { GameUI } from "./src/ui.js";
import { MemoryGameEngine } from "./src/engine.js";

document.addEventListener("DOMContentLoaded", () => {
  const ui = new GameUI();
  const engine = new MemoryGameEngine(ui);
  ui.setEngine(engine);
  ui.updateModeOptions();
});
