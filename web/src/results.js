// ═══ Results Dashboard (Chart.js) ═══
import { Chart, registerables } from "chart.js";
Chart.register(...registerables);

let chartInstances = [];

function destroyCharts() {
  chartInstances.forEach((c) => { try { c.destroy(); } catch {} });
  chartInstances = [];
}

export function openResultsDashboard(store) {
  const players = store.players || {};
  const keys = Object.keys(players);
  if (!keys.length) { alert("No players found."); return; }

  const modal = document.getElementById("results-modal");
  modal.classList.remove("hidden");

  const select = document.getElementById("results-player-select");
  select.innerHTML = "";
  keys.forEach((k) => {
    const p = players[k];
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = `${p.name || "Unknown"} (Age ${p.age || "?"})`;
    select.appendChild(opt);
  });

  const current = store.last_player_key;
  if (current && keys.includes(current)) select.value = current;

  const render = () => renderDashboard(players[select.value]);
  select.onchange = render;
  render();
}

function renderDashboard(player) {
  destroyCharts();
  if (!player) return;

  const sessions = player.sessions || [];
  const lifetime = player.lifetime || {};

  document.getElementById("results-title").textContent =
    `Lifetime Results for ${player.name || "Unknown"} (Age ${player.age || "?"})`;

  const totalRounds = Number(lifetime.rounds_played || 0);
  const totalCorrect = Number(lifetime.rounds_correct || 0);
  const acc = totalRounds ? Math.round((100 * totalCorrect) / totalRounds) : 0;
  const bestScore = Number(lifetime.best_score || 0);
  const avgResp = totalRounds ? (Number(lifetime.total_response_time_ms || 0) / totalRounds / 1000).toFixed(1) : "0.0";
  const totalLapses = Number(lifetime.total_lapse_count || 0);

  document.getElementById("results-stats").textContent =
    `Sessions: ${sessions.length}  |  Rounds: ${totalRounds}  |  Accuracy: ${acc}%  |  Best Score: ${bestScore}  |  Avg Response: ${avgResp}s  |  Total Lapses: ${totalLapses}`;

  // Aggregate data
  const allHistory = [];
  const allLapses = [];
  const peakLevels = [];
  sessions.forEach((s) => {
    allHistory.push(...(s.level_history || []));
    allLapses.push(...(s.lapses || []));
    peakLevels.push(s.highest_level_reached || 1);
  });

  const rounds = allHistory.map((_, i) => i + 1);
  const respSecs = allHistory.map((h) => (h.response_time_ms || 0) / 1000);
  const levels = allHistory.map((h) => h.level || 0);

  // Mode stats
  const modeMap = {};
  allHistory.forEach((h) => {
    let mode = h.game_type_label || h.mode || "Unknown";
    if (mode.includes("Mental Reversal")) mode = "Reversal";
    if (mode.includes("Grid Rotation")) mode = mode.replace("Grid Rotation", "Rot");
    if (!modeMap[mode]) modeMap[mode] = { total: 0, correct: 0 };
    modeMap[mode].total++;
    if (h.correct) modeMap[mode].correct++;
  });
  const modes = Object.keys(modeMap);
  const modeAccs = modes.map((m) => (100 * modeMap[m].correct) / modeMap[m].total);

  // Level summary
  const lvlMap = {};
  allHistory.forEach((h) => {
    const lvl = h.level || 0;
    if (!lvlMap[lvl]) lvlMap[lvl] = { total: 0, correct: 0, resp: [] };
    lvlMap[lvl].total++;
    if (h.correct) lvlMap[lvl].correct++;
    lvlMap[lvl].resp.push((h.response_time_ms || 0) / 1000);
  });
  const sLevels = Object.keys(lvlMap).map(Number).sort((a, b) => a - b);
  const sAvgResp = sLevels.map((l) => lvlMap[l].resp.reduce((a, b) => a + b, 0) / lvlMap[l].resp.length);
  const sAcc = sLevels.map((l) => (100 * lvlMap[l].correct) / lvlMap[l].total);

  const lapseDurs = allLapses.map((l) => (l.duration_ms || 0) / 1000);

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.05)" } },
      y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.05)" } },
    },
  };

  // Chart 1: Response Time Trend
  chartInstances.push(new Chart(document.getElementById("chart-response-time"), {
    type: "line",
    data: {
      labels: rounds,
      datasets: [{ data: respSecs, borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)", fill: true, pointRadius: 2, borderWidth: 1.5, tension: 0.3 }],
    },
    options: { ...chartOpts, plugins: { ...chartOpts.plugins, title: { display: true, text: "Response Time Trend (All Rounds)", color: "#e2e8f0", font: { size: 12 } } } },
  }));

  // Chart 2: Level Progression
  chartInstances.push(new Chart(document.getElementById("chart-level-prog"), {
    type: "line",
    data: {
      labels: rounds,
      datasets: [{ data: levels, borderColor: "#f03b20", backgroundColor: "rgba(240,59,32,0.1)", fill: true, pointRadius: 2, borderWidth: 1.5, tension: 0.1 }],
    },
    options: { ...chartOpts, plugins: { ...chartOpts.plugins, title: { display: true, text: "Level Progression (All Rounds)", color: "#e2e8f0", font: { size: 12 } } } },
  }));

  // Chart 3: Accuracy by Mode
  chartInstances.push(new Chart(document.getElementById("chart-mode-acc"), {
    type: "bar",
    data: {
      labels: modes,
      datasets: [{ data: modeAccs, backgroundColor: "#22c55e", borderRadius: 4 }],
    },
    options: { ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, max: 110 } }, plugins: { ...chartOpts.plugins, title: { display: true, text: "Accuracy by Game Mode", color: "#e2e8f0", font: { size: 12 } } } },
  }));

  // Chart 4: Peak Level per Session
  chartInstances.push(new Chart(document.getElementById("chart-peak-level"), {
    type: "bar",
    data: {
      labels: peakLevels.map((_, i) => `S${i + 1}`),
      datasets: [{ data: peakLevels, backgroundColor: "#8b5cf6", borderRadius: 4 }],
    },
    options: { ...chartOpts, plugins: { ...chartOpts.plugins, title: { display: true, text: "Peak Level per Session", color: "#e2e8f0", font: { size: 12 } } } },
  }));

  // Chart 5: Attention Lapses
  if (lapseDurs.length) {
    chartInstances.push(new Chart(document.getElementById("chart-lapses"), {
      type: "bar",
      data: {
        labels: lapseDurs.map((_, i) => i + 1),
        datasets: [{ data: lapseDurs, backgroundColor: "#ef4444", borderRadius: 4 }],
      },
      options: { ...chartOpts, plugins: { ...chartOpts.plugins, title: { display: true, text: `Attention Lapses (Total: ${lapseDurs.length})`, color: "#e2e8f0", font: { size: 12 } } } },
    }));
  } else {
    const ctx5 = document.getElementById("chart-lapses").getContext("2d");
    ctx5.fillStyle = "#22c55e";
    ctx5.font = "bold 14px Inter, sans-serif";
    ctx5.textAlign = "center";
    ctx5.fillText("No lapses — Excellent focus!", ctx5.canvas.width / 2, ctx5.canvas.height / 2);
  }

  // Chart 6: Avg Response by Level
  chartInstances.push(new Chart(document.getElementById("chart-resp-by-level"), {
    type: "bar",
    data: {
      labels: sLevels.map((l) => `L${l}`),
      datasets: [{ data: sAvgResp, backgroundColor: "#06b6d4", borderRadius: 4 }],
    },
    options: { ...chartOpts, plugins: { ...chartOpts.plugins, title: { display: true, text: "Avg Response Time by Level", color: "#e2e8f0", font: { size: 12 } } } },
  }));

  // Level summary text
  const txt = sLevels.map((l, i) => `L${l}: acc ${sAcc[i].toFixed(0)}%, avg ${sAvgResp[i].toFixed(2)}s`).join("  |  ");
  document.getElementById("results-level-summary").textContent = txt || "No data.";
}
