import { GameUI } from "./ui.js";
import { MemoryGameEngine } from "./engine.js";

document.addEventListener("DOMContentLoaded", () => {
  const ui = new GameUI();
  const engine = new MemoryGameEngine(ui);
  ui.setEngine(engine);
  ui.updateModeOptions();
});
