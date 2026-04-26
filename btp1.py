import json
import os
import time
import tkinter as tk
from tkinter import messagebox, simpledialog, ttk
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
import random

import matplotlib
matplotlib.use("TkAgg")
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure

APP_TITLE = "Number Memory Grid"
DATA_FILE = os.path.join(os.path.expanduser("~"), "Downloads", "memory_game_player_data.json")
LAPSE_THRESHOLD_MS = 8000
LAPSE_MAX_DURATION_MS = 60000
GAME_DURATION_MS = 4 * 60 * 1000
WINDOW_WIDTH = 1180
WINDOW_HEIGHT = 820
RESULTS_PASSWORD = "btp123"

GAME_MODES = {
    "normal": "Normal",
    "reverse": "Mental Reversal",
    "rotate": "Grid Rotation",
    "reverse_rotate": "Mental Reversal + Grid Rotation",
}

LEVELS = [
    {"level": 1, "count": 1, "show_ms": 1000, "gap_ms": 500},
    {"level": 2, "count": 2, "show_ms": 920, "gap_ms": 430},
    {"level": 3, "count": 3, "show_ms": 850, "gap_ms": 380},
    {"level": 4, "count": 4, "show_ms": 780, "gap_ms": 330},
    {"level": 5, "count": 5, "show_ms": 710, "gap_ms": 290},
    {"level": 6, "count": 6, "show_ms": 650, "gap_ms": 250},
    {"level": 7, "count": 7, "show_ms": 590, "gap_ms": 220},
    {"level": 8, "count": 8, "show_ms": 530, "gap_ms": 200},
    {"level": 9, "count": 9, "show_ms": 470, "gap_ms": 180},
]


@dataclass
class LapseEntry:
    started_at: str
    duration_ms: int
    trigger: str


class MemoryGameApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        self.root.minsize(1050, 760)
        self.root.configure(bg="#eef6fb")
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        self.style = ttk.Style()
        self.style.theme_use("clam")
        self.style.configure("Title.TLabel", font=("Arial", 24, "bold"), background="#eef6fb", foreground="#243447")
        self.style.configure("Subtitle.TLabel", font=("Arial", 11), background="#eef6fb", foreground="#4b5d73")
        self.style.configure("Action.TButton", font=("Arial", 11, "bold"), padding=8)

        self.player_store: Dict[str, object] = self.load_store()
        self.active_player_key: Optional[str] = None
        self.active_player: Optional[Dict[str, object]] = None

        self.started = False
        self.phase = "idle"  # idle, show_sequence, rotate_pause, input, result, finished
        self.level_index = 0
        self.sequence: List[int] = []
        self.selected: List[int] = []
        self.score = 0
        self.stars = 0
        self.lives = 3
        self.best_score = 0
        self.rounds_per_level = 1
        self.message_text = tk.StringVar(value="Enter player details, choose a game type, and click Start Game.")
        self.timer_text = tk.StringVar(value="")
        self.reduced_distraction = tk.BooleanVar(value=True)
        self.player_name_var = tk.StringVar()
        self.player_age_var = tk.StringVar()
        self.game_mode_var = tk.StringVar(value="normal")

        self.current_session = self.empty_session_stats()
        self.round_input_start_ms: Optional[int] = None
        self.pending_persisted = False

        self.last_app_activity_ms = int(time.time() * 1000)
        self.current_idle_lapse_start_ms: Optional[int] = None
        self.global_lapse_watch_job: Optional[str] = None

        self.show_job: Optional[str] = None
        self.next_round_job: Optional[str] = None
        self.session_timer_job: Optional[str] = None
        self.session_start_ms: Optional[int] = None
        self.stop_after_round = False

        self.number_buttons: Dict[int, tk.Button] = {}
        self.button_positions: Dict[int, tuple[int, int]] = {}
        self.rotation_degrees = 0

        self.level_value_var = tk.StringVar(value="1")
        self.score_value_var = tk.StringVar(value="0")
        self.best_value_var = tk.StringVar(value="0")
        self.progress_var = tk.IntVar(value=0)
        self.stars_var = tk.StringVar(value="0")
        self.lives_var = tk.StringVar(value="❤ ❤ ❤")
        self.current_player_var = tk.StringVar(value="No player selected")
        self.session_accuracy_var = tk.StringVar(value="0%")
        self.lifetime_accuracy_var = tk.StringVar(value="0%")
        self.avg_response_var = tk.StringVar(value="0.0s")
        self.lapse_count_var = tk.StringVar(value="0")
        self.lapse_total_var = tk.StringVar(value="0.0s")
        self.avg_lapse_var = tk.StringVar(value="0.0s")
        self.current_mode_display_var = tk.StringVar(value=GAME_MODES["normal"])

        self.build_ui()
        self.load_last_player()

        self.root.bind_all("<Any-KeyPress>", self.record_app_activity, add="+")
        self.root.bind_all("<Any-ButtonPress>", self.record_app_activity, add="+")
        self.root.bind_all("<Motion>", self.record_app_activity, add="+")
        self.start_global_lapse_watch()

    def build_ui(self) -> None:
        outer = tk.Frame(self.root, bg="#eef6fb")
        outer.pack(fill="both", expand=True, padx=12, pady=12)

        left_container = tk.Frame(outer, bg="#eef6fb")
        right = tk.Frame(outer, bg="#eef6fb")
        left_container.pack(side="left", fill="both", expand=True, padx=(0, 10))
        right.pack(side="right", fill="y")

        # Scrollable left side
        left_canvas = tk.Canvas(left_container, bg="#eef6fb", highlightthickness=0)
        left_scrollbar = ttk.Scrollbar(left_container, orient="vertical", command=left_canvas.yview)
        left = tk.Frame(left_canvas, bg="#eef6fb")

        left_scrollbar.pack(side="right", fill="y")
        left_canvas.pack(side="left", fill="both", expand=True)
        left_canvas.configure(yscrollcommand=left_scrollbar.set)

        left_window = left_canvas.create_window((0, 0), window=left, anchor="nw")

        def on_left_configure(event):
            left_canvas.configure(scrollregion=left_canvas.bbox("all"))

        def on_canvas_configure(event):
            left_canvas.itemconfigure(left_window, width=event.width)

        left.bind("<Configure>", on_left_configure)
        left_canvas.bind("<Configure>", on_canvas_configure)

        title_frame = tk.Frame(left, bg="#eef6fb")
        title_frame.pack(fill="x", pady=(0, 10))
        ttk.Label(title_frame, text="Number Memory Grid", style="Title.TLabel").pack(anchor="center")
        ttk.Label(
            title_frame,
            text="Choose one of four working-memory game modes. The game runs for 4 minutes.",
            style="Subtitle.TLabel",
        ).pack(anchor="center", pady=(5, 0))

        player_card = tk.Frame(left, bg="#ffffff", bd=1, relief="solid")
        player_card.pack(fill="x", pady=(0, 12))
        tk.Label(
            player_card,
            text="Player details",
            font=("Arial", 14, "bold"),
            bg="#ffffff",
            fg="#243447"
        ).pack(anchor="w", padx=14, pady=(12, 8))

        form_row = tk.Frame(player_card, bg="#ffffff")
        form_row.pack(fill="x", padx=14, pady=(0, 10))

        name_col = tk.Frame(form_row, bg="#ffffff")
        age_col = tk.Frame(form_row, bg="#ffffff")
        mode_col = tk.Frame(form_row, bg="#ffffff")

        name_col.pack(side="left", fill="x", expand=True, padx=(0, 8))
        age_col.pack(side="left", fill="x", expand=True, padx=(0, 8))
        mode_col.pack(side="left", fill="x", expand=True)

        tk.Label(name_col, text="Name", font=("Arial", 10, "bold"), bg="#ffffff", fg="#243447").pack(anchor="w")
        tk.Entry(name_col, textvariable=self.player_name_var, font=("Arial", 12), relief="solid", bd=1).pack(fill="x", ipady=6, pady=(4, 0))

        tk.Label(age_col, text="Age", font=("Arial", 10, "bold"), bg="#ffffff", fg="#243447").pack(anchor="w")
        age_entry = tk.Entry(age_col, textvariable=self.player_age_var, font=("Arial", 12), relief="solid", bd=1)
        age_entry.pack(fill="x", ipady=6, pady=(4, 0))
        age_entry.bind("<KeyRelease>", self.only_digits_in_age)

        tk.Label(mode_col, text="Game type", font=("Arial", 10, "bold"), bg="#ffffff", fg="#243447").pack(anchor="w")
        mode_menu = ttk.OptionMenu(
            mode_col,
            self.game_mode_var,
            "normal",
            *GAME_MODES.keys(),
            command=self.on_mode_change,
        )
        mode_menu.pack(fill="x", pady=(4, 0), ipady=2)

        tk.Label(
            player_card,
            textvariable=self.current_player_var,
            font=("Arial", 10),
            bg="#f5f8fb",
            fg="#36485c",
            padx=10,
            pady=8
        ).pack(fill="x", padx=14, pady=(0, 8))

        tk.Label(
            player_card,
            textvariable=self.current_mode_display_var,
            font=("Arial", 10, "bold"),
            bg="#f5f8fb",
            fg="#243447",
            padx=10,
            pady=8
        ).pack(fill="x", padx=14, pady=(0, 10))

        action_top = tk.Frame(player_card, bg="#ffffff")
        action_top.pack(fill="x", padx=14, pady=(0, 14))
        ttk.Button(action_top, text="Start Game", style="Action.TButton", command=self.handle_start_game).pack(side="left", padx=(0, 8))
        ttk.Button(action_top, text="Reset", style="Action.TButton", command=self.reset_game).pack(side="left", padx=(0, 8))
        ttk.Button(action_top, text="Results", style="Action.TButton", command=self.open_results_with_password).pack(side="left")

        game_card = tk.Frame(left, bg="#ffffff", bd=1, relief="solid")
        game_card.pack(fill="x", pady=(0, 12))

        stats_row = tk.Frame(game_card, bg="#ffffff")
        stats_row.pack(fill="x", padx=16, pady=(14, 10))
        self.build_top_stat(stats_row, "Level", self.level_value_var).pack(side="left", fill="x", expand=True)
        self.build_top_stat(stats_row, "Score", self.score_value_var).pack(side="left", fill="x", expand=True)
        self.build_top_stat(stats_row, "Best", self.best_value_var).pack(side="left", fill="x", expand=True)

        progress_frame = tk.Frame(game_card, bg="#ffffff")
        progress_frame.pack(fill="x", padx=16)
        tk.Label(progress_frame, text="Level progress", font=("Arial", 10), bg="#ffffff", fg="#4b5d73").pack(anchor="w")
        ttk.Progressbar(progress_frame, variable=self.progress_var, maximum=100).pack(fill="x", pady=(4, 10))

        self.grid_frame = tk.Frame(game_card, bg="#ffffff")
        self.grid_frame.pack(pady=10)

        for number in range(1, 10):
            button = tk.Button(
                self.grid_frame,
                text=str(number),
                font=("Arial", 22, "bold"),
                width=5,
                height=2,
                bg="#ffffff",
                fg="#243447",
                activebackground="#dceffd",
                relief="raised",
                bd=2,
                command=lambda n=number: self.handle_cell_click(n),
            )
            self.number_buttons[number] = button

        self.apply_grid_layout()

        message_box = tk.Frame(game_card, bg="#f5f8fb", bd=1, relief="solid")
        message_box.pack(fill="x", padx=16, pady=12)
        tk.Label(
            message_box,
            textvariable=self.message_text,
            font=("Arial", 12, "bold"),
            bg="#f5f8fb",
            fg="#243447",
            wraplength=700,
            justify="center",
            pady=8,
        ).pack()
        tk.Label(
            message_box,
            textvariable=self.timer_text,
            font=("Arial", 10),
            bg="#f5f8fb",
            fg="#5c7288"
        ).pack(pady=(0, 8))

        self.build_side_panel(right)
        self.refresh_grid_appearance()
        self.refresh_stats_display()

        def _on_mousewheel(event):
            left_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        left_canvas.bind_all("<MouseWheel>", _on_mousewheel)

    def on_mode_change(self, _value=None) -> None:
        mode_key = self.game_mode_var.get()
        self.current_mode_display_var.set(f"Current game type: {GAME_MODES.get(mode_key, mode_key)}")

    def apply_grid_layout(self) -> None:
        for widget in self.grid_frame.winfo_children():
            widget.grid_forget()

        positions = self.get_rotated_positions(self.rotation_degrees)
        self.button_positions = {}

        for number in range(1, 10):
            row, col = positions[number]
            self.button_positions[number] = (row, col)
            self.number_buttons[number].grid(row=row, column=col, padx=8, pady=8, sticky="nsew")

        for i in range(3):
            self.grid_frame.grid_columnconfigure(i, weight=1)
            self.grid_frame.grid_rowconfigure(i, weight=1)

    def get_rotated_positions(self, degrees: int) -> Dict[int, tuple[int, int]]:
        base = {number: ((number - 1) // 3, (number - 1) % 3) for number in range(1, 10)}

        if degrees % 360 == 0:
            return base

        rotated = {}
        for number, (r, c) in base.items():
            if degrees % 360 == 90:
                nr, nc = c, 2 - r
            elif degrees % 360 == 180:
                nr, nc = 2 - r, 2 - c
            elif degrees % 360 == 270:
                nr, nc = 2 - c, r
            else:
                nr, nc = r, c
            rotated[number] = (nr, nc)
        return rotated

    def rotate_grid_90(self) -> None:
        self.rotation_degrees = (self.rotation_degrees + 90) % 360
        self.apply_grid_layout()

    def reset_grid_rotation(self) -> None:
        self.rotation_degrees = 0
        self.apply_grid_layout()

    def build_top_stat(self, parent: tk.Widget, label: str, value_var: tk.StringVar) -> tk.Frame:
        frame = tk.Frame(parent, bg="#ffffff")
        tk.Label(frame, text=label, font=("Arial", 10), bg="#ffffff", fg="#4b5d73").pack()
        tk.Label(frame, textvariable=value_var, font=("Arial", 18, "bold"), bg="#ffffff", fg="#243447").pack(pady=(2, 0))
        return frame

    def build_side_panel(self, right: tk.Frame) -> None:
        how_to = self.make_card(right, "How to play")
        self.pack_bullet(how_to, "1. Choose a game type before starting.")
        self.pack_bullet(how_to, "2. Watch the buttons light up one by one.")
        self.pack_bullet(how_to, "3. Normal: repeat same order.")
        self.pack_bullet(how_to, "4. Mental Reversal: answer in reverse order.")
        self.pack_bullet(how_to, "5. Grid Rotation: grid rotates 90° before input.")
        self.pack_bullet(how_to, "6. Combined: reverse order + rotated grid.")
        self.pack_bullet(how_to, "7. The session lasts 4 minutes.")

        rewards = self.make_card(right, "Rewards")
        self.make_info_row(rewards, "Stars earned", self.stars_var)
        self.make_info_row(rewards, "Lives left", self.lives_var)

        data_card = self.make_card(right, "Player data")
        self.make_info_row(data_card, "Session accuracy", self.session_accuracy_var)
        self.make_info_row(data_card, "Lifetime accuracy", self.lifetime_accuracy_var)
        self.make_info_row(data_card, "Average response", self.avg_response_var)
        self.make_info_row(data_card, "Lapses this session", self.lapse_count_var)
        self.make_info_row(data_card, "Total lapse duration", self.lapse_total_var)
        self.make_info_row(data_card, "Average lapse duration", self.avg_lapse_var)
        tk.Label(
            data_card,
            text=f"Player data is stored permanently in\n{DATA_FILE}",
            font=("Arial", 9),
            bg="#ffffff",
            fg="#5c7288",
            justify="left",
        ).pack(anchor="w", pady=(8, 0))

        controls = self.make_card(right, "Data controls")
        ttk.Button(controls, text="Results Dashboard", command=self.open_results_with_password).pack(fill="x", pady=(0, 8))
        ttk.Button(controls, text="Delete Current Player Data", command=self.delete_current_player_data).pack(fill="x")

    def make_card(self, parent: tk.Widget, title: str) -> tk.Frame:
        card = tk.Frame(parent, bg="#ffffff", bd=1, relief="solid")
        card.pack(fill="x", pady=(0, 12))
        tk.Label(card, text=title, font=("Arial", 13, "bold"), bg="#ffffff", fg="#243447").pack(anchor="w", padx=12, pady=(12, 8))
        inner = tk.Frame(card, bg="#ffffff")
        inner.pack(fill="x", padx=12, pady=(0, 12))
        return inner

    def pack_bullet(self, parent: tk.Widget, text: str) -> None:
        tk.Label(parent, text=text, font=("Arial", 10), bg="#ffffff", fg="#36485c", anchor="w", justify="left", wraplength=320).pack(fill="x", pady=2)

    def make_info_row(self, parent: tk.Widget, label: str, value_var: tk.StringVar) -> None:
        row = tk.Frame(parent, bg="#ffffff")
        row.pack(fill="x", pady=2)
        tk.Label(row, text=label, font=("Arial", 10), bg="#ffffff", fg="#5c7288").pack(side="left")
        tk.Label(row, textvariable=value_var, font=("Arial", 10, "bold"), bg="#ffffff", fg="#243447").pack(side="right")

    def only_digits_in_age(self, _event=None) -> None:
        cleaned = "".join(ch for ch in self.player_age_var.get() if ch.isdigit())
        if cleaned != self.player_age_var.get():
            self.player_age_var.set(cleaned)

    def load_store(self) -> Dict[str, object]:
        if not os.path.exists(DATA_FILE):
            return {"players": {}, "last_player_key": ""}
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as file:
                data = json.load(file)
            if not isinstance(data, dict):
                return {"players": {}, "last_player_key": ""}
            data.setdefault("players", {})
            data.setdefault("last_player_key", "")
            return data
        except (json.JSONDecodeError, OSError):
            return {"players": {}, "last_player_key": ""}

    def save_store(self) -> None:
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, "w", encoding="utf-8") as file:
            json.dump(self.player_store, file, indent=2)

    def empty_session_stats(self) -> Dict[str, object]:
        return {
            "started_at": "",
            "rounds_played": 0,
            "rounds_correct": 0,
            "response_times_ms": [],
            "lapse_count": 0,
            "total_lapse_duration_ms": 0,
            "longest_lapse_ms": 0,
            "lapses": [],
            "level_history": [],
            "game_duration_ms": 0,
            "mode": "",
            "highest_level_reached": 1,
        }

    def create_empty_player(self, name: str, age: str) -> Dict[str, object]:
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        return {
            "name": name,
            "age": age,
            "created_at": now,
            "updated_at": now,
            "lifetime": {
                "rounds_played": 0,
                "rounds_correct": 0,
                "total_response_time_ms": 0,
                "average_response_time_ms": 0,
                "total_lapse_count": 0,
                "total_lapse_duration_ms": 0,
                "average_lapse_duration_ms": 0,
                "longest_lapse_ms": 0,
                "sessions_played": 0,
                "best_score": 0,
            },
            "sessions": [],
        }

    def normalize_player_key(self, name: str, age: str) -> str:
        return f"{name.strip().lower()}__{age.strip()}"

    def load_last_player(self) -> None:
        key = self.player_store.get("last_player_key", "")
        player = self.player_store.get("players", {}).get(key)
        if not player:
            return
        self.active_player_key = key
        self.active_player = player
        self.player_name_var.set(str(player.get("name", "")))
        self.player_age_var.set(str(player.get("age", "")))
        self.best_score = int(player.get("lifetime", {}).get("best_score", 0))
        self.current_player_var.set(f"Current player: {player.get('name', '')}, age {player.get('age', '')}")
        self.on_mode_change()

    def calculate_accuracy(self, correct: int, total: int) -> int:
        return round((correct / total) * 100) if total else 0

    def format_seconds(self, ms: int) -> str:
        return f"{ms / 1000:.1f}s"

    def refresh_stats_display(self) -> None:
        if self.started:
            current_level = LEVELS[self.level_index]["level"]
        else:
            current_level = int(self.current_session.get("highest_level_reached", 1))

        self.level_value_var.set(str(current_level))
        self.score_value_var.set(str(self.score))
        self.best_value_var.set(str(self.best_score))
        self.progress_var.set(int(((self.level_index + 1) / len(LEVELS)) * 100) if self.started else 0)
        self.stars_var.set(str(self.stars))
        self.lives_var.set(" ".join("❤" if i < self.lives else "♡" for i in range(3)))

        session_accuracy = self.calculate_accuracy(
            int(self.current_session["rounds_correct"]),
            int(self.current_session["rounds_played"]),
        )
        self.session_accuracy_var.set(f"{session_accuracy}%")

        if self.active_player:
            lifetime = self.active_player.get("lifetime", {})
            lifetime_accuracy = self.calculate_accuracy(
                int(lifetime.get("rounds_correct", 0)),
                int(lifetime.get("rounds_played", 0)),
            )
            self.lifetime_accuracy_var.set(f"{lifetime_accuracy}%")
        else:
            self.lifetime_accuracy_var.set("0%")

        response_times = self.current_session["response_times_ms"]
        avg_response = round(sum(response_times) / len(response_times)) if response_times else 0
        self.avg_response_var.set(self.format_seconds(avg_response))
        self.lapse_count_var.set(str(self.current_session["lapse_count"]))
        self.lapse_total_var.set(self.format_seconds(int(self.current_session["total_lapse_duration_ms"])))
        avg_lapse = round(
            int(self.current_session["total_lapse_duration_ms"]) / int(self.current_session["lapse_count"])
        ) if int(self.current_session["lapse_count"]) else 0
        self.avg_lapse_var.set(self.format_seconds(avg_lapse))
        self.on_mode_change()

    def record_app_activity(self, _event=None) -> None:
        now_ms = int(time.time() * 1000)
        if self.current_idle_lapse_start_ms is not None:
            duration_ms = min(now_ms - self.current_idle_lapse_start_ms, LAPSE_MAX_DURATION_MS)
            self.record_lapse(self.current_idle_lapse_start_ms, duration_ms, "no_input_idle")
            self.current_idle_lapse_start_ms = None
        self.last_app_activity_ms = now_ms

    def start_global_lapse_watch(self) -> None:
        self.stop_global_lapse_watch()
        self.global_lapse_watch_job = self.root.after(500, self.check_global_idle_lapse)

    def stop_global_lapse_watch(self) -> None:
        if self.global_lapse_watch_job is not None:
            try:
                self.root.after_cancel(self.global_lapse_watch_job)
            except tk.TclError:
                pass
            self.global_lapse_watch_job = None

    def check_global_idle_lapse(self) -> None:
        now_ms = int(time.time() * 1000)
        idle_ms = now_ms - self.last_app_activity_ms

        if idle_ms >= LAPSE_THRESHOLD_MS and self.current_idle_lapse_start_ms is None:
            self.current_idle_lapse_start_ms = self.last_app_activity_ms

        if self.current_idle_lapse_start_ms is not None:
            elapsed_since_lapse_start = now_ms - self.current_idle_lapse_start_ms
            if elapsed_since_lapse_start >= LAPSE_MAX_DURATION_MS:
                self.record_lapse(self.current_idle_lapse_start_ms, LAPSE_MAX_DURATION_MS, "no_input_idle")
                self.current_idle_lapse_start_ms = now_ms
                self.last_app_activity_ms = now_ms

        self.global_lapse_watch_job = self.root.after(500, self.check_global_idle_lapse)

    def record_lapse(self, start_ms: int, duration_ms: int, trigger: str) -> None:
        if duration_ms <= 0:
            return
        started_at = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(start_ms / 1000))
        lapse = LapseEntry(started_at=started_at, duration_ms=duration_ms, trigger=trigger)
        self.current_session["lapses"].append(asdict(lapse))
        self.current_session["lapse_count"] += 1
        self.current_session["total_lapse_duration_ms"] += duration_ms
        self.current_session["longest_lapse_ms"] = max(int(self.current_session["longest_lapse_ms"]), duration_ms)
        self.refresh_stats_display()

    def handle_start_game(self) -> None:
        name = self.player_name_var.get().strip()
        age = self.player_age_var.get().strip()
        mode_key = self.game_mode_var.get()

        if not name or not age:
            self.message_text.set("Please enter player name and age first.")
            return

        key = self.normalize_player_key(name, age)
        players = self.player_store.setdefault("players", {})
        if key not in players:
            players[key] = self.create_empty_player(name, age)
        else:
            players[key]["name"] = name
            players[key]["age"] = age
            players[key]["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")

        self.player_store["last_player_key"] = key
        self.active_player_key = key
        self.active_player = players[key]
        self.save_store()

        self.started = True
        self.phase = "idle"
        self.level_index = 0
        self.score = 0
        self.stars = 0
        self.lives = 3
        self.best_score = int(self.active_player.get("lifetime", {}).get("best_score", 0))
        self.current_player_var.set(f"Current player: {name}, age {age}")
        self.current_session = self.empty_session_stats()
        self.current_session["started_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        self.current_session["mode"] = mode_key
        self.current_session["highest_level_reached"] = 1
        self.pending_persisted = False
        self.session_start_ms = int(time.time() * 1000)
        self.stop_after_round = False
        self.reset_grid_rotation()
        self.message_text.set(f"Get ready! Mode: {GAME_MODES[mode_key]}")
        self.refresh_stats_display()
        self.record_app_activity()
        self.start_session_timer()
        self.start_round(0)

    def start_session_timer(self) -> None:
        self.stop_session_timer()
        self.session_timer_job = self.root.after(250, self.update_session_timer)

    def stop_session_timer(self) -> None:
        if self.session_timer_job is not None:
            try:
                self.root.after_cancel(self.session_timer_job)
            except tk.TclError:
                pass
            self.session_timer_job = None

    def update_session_timer(self) -> None:
        if not self.started or self.session_start_ms is None:
            self.session_timer_job = None
            return

        elapsed_ms = int(time.time() * 1000) - self.session_start_ms
        remaining_ms = max(GAME_DURATION_MS - elapsed_ms, 0)
        minutes = remaining_ms // 60000
        seconds = (remaining_ms % 60000) // 1000
        self.timer_text.set(f"Time left: {minutes:02d}:{seconds:02d}")

        if elapsed_ms >= GAME_DURATION_MS:
            self.stop_after_round = True
            if self.phase in {"idle", "result"}:
                self.finish_game_due_to_time()
                self.session_timer_job = None
                return

        self.session_timer_job = self.root.after(250, self.update_session_timer)

    def start_round(self, new_level_index: Optional[int] = None) -> None:
        if new_level_index is not None:
            self.level_index = new_level_index

        self.cancel_jobs()
        self.reset_grid_rotation()
        current_level = LEVELS[self.level_index]
        self.sequence = random.sample(list(range(1, 10)), current_level["count"])
        self.selected = []
        self.round_input_start_ms = None
        self.phase = "show_sequence"
        self.message_text.set(f"Watch {current_level['count']} button(s) light up in order.")
        self.refresh_grid_appearance()
        self.refresh_stats_display()
        self.show_sequence_step(0)

    def show_sequence_step(self, index: int) -> None:
        if self.phase != "show_sequence":
            return

        if index >= len(self.sequence):
            mode_key = self.current_session.get("mode", "normal")
            if mode_key in {"rotate", "reverse_rotate"}:
                self.phase = "rotate_pause"
                self.rotate_grid_90()
                if mode_key == "rotate":
                    self.message_text.set("The grid rotated. Now click the buttons in the same original order.")
                else:
                    self.message_text.set("The grid rotated. Now click the buttons in reverse order.")
                self.next_round_job = self.root.after(700, self.enter_input_phase)
            else:
                self.enter_input_phase()
            return

        number = self.sequence[index]
        self.highlight_single_number(number)
        show_ms = int(LEVELS[self.level_index]["show_ms"])
        self.show_job = self.root.after(show_ms, lambda: self.clear_highlight_then_continue(index))

    def enter_input_phase(self) -> None:
        self.phase = "input"
        self.round_input_start_ms = int(time.time() * 1000)
        mode_key = self.current_session.get("mode", "normal")
        if mode_key == "normal":
            self.message_text.set("Now click the buttons in the same order.")
        elif mode_key == "reverse":
            self.message_text.set("Now click the buttons in reverse order.")
        elif mode_key == "rotate":
            self.message_text.set("Grid rotated: click the buttons in the same original order.")
        else:
            self.message_text.set("Grid rotated: click the buttons in reverse order.")
        self.refresh_grid_appearance()

    def clear_highlight_then_continue(self, index: int) -> None:
        if self.phase != "show_sequence":
            return
        self.refresh_grid_appearance()
        gap_ms = int(LEVELS[self.level_index]["gap_ms"])
        self.show_job = self.root.after(gap_ms, lambda: self.show_sequence_step(index + 1))

    def highlight_single_number(self, number: int) -> None:
        self.refresh_grid_appearance()
        self.number_buttons[number].configure(bg="#ffe58f", activebackground="#ffe58f")

    def get_expected_sequence(self) -> List[int]:
        mode_key = self.current_session.get("mode", "normal")
        if mode_key in {"reverse", "reverse_rotate"}:
            return list(reversed(self.sequence))
        return self.sequence[:]

    def handle_cell_click(self, number: int) -> None:
        if self.phase != "input":
            return
        if number in self.selected:
            return

        self.record_app_activity()
        self.selected.append(number)
        self.refresh_grid_appearance()

        current_level = LEVELS[self.level_index]
        if len(self.selected) == current_level["count"]:
            self.evaluate_attempt(self.selected[:])

    def evaluate_attempt(self, attempt: List[int]) -> None:
        response_time_ms = 0
        if self.round_input_start_ms is not None:
            response_time_ms = int(time.time() * 1000) - self.round_input_start_ms

        expected = self.get_expected_sequence()
        correct = attempt == expected
        level_number = LEVELS[self.level_index]["level"]
        mode_key = self.current_session.get("mode", "normal")

        self.current_session["rounds_played"] += 1
        self.current_session["rounds_correct"] += 1 if correct else 0
        self.current_session["response_times_ms"].append(response_time_ms)
        self.current_session["highest_level_reached"] = max(
            int(self.current_session.get("highest_level_reached", 1)),
            LEVELS[self.level_index]["level"],
        )

        self.current_session["level_history"].append({
            "level": level_number,
            "correct": correct,
            "response_time_ms": response_time_ms,
            "sequence_length": len(self.sequence),
            "mode": mode_key,
            "game_type_label": GAME_MODES.get(mode_key, mode_key),
            "expected_sequence": expected[:],
            "shown_sequence": self.sequence[:],
            "player_sequence": attempt[:],
            "grid_rotation_degrees": self.rotation_degrees,
        })

        self.phase = "result"

        if correct:
            points = int(LEVELS[self.level_index]["count"]) * 10
            self.score += points
            self.stars += 1
        else:
            self.lives -= 1

        self.refresh_stats_display()
        self.refresh_grid_appearance()

        if self.lives <= 0:
            self.message_text.set(f"Game over. Correct order was {', '.join(map(str, expected))}.")
            self.finish_game()
            return

        self.handle_round_completion(correct)

    def handle_round_completion(self, correct: bool) -> None:
        current_level_number = LEVELS[self.level_index]["level"]

        if self.stop_after_round:
            self.finish_game_due_to_time()
            return

        if correct and self.level_index < len(LEVELS) - 1:
            self.level_index += 1
            self.current_session["highest_level_reached"] = max(
                int(self.current_session["highest_level_reached"]),
                LEVELS[self.level_index]["level"],
            )
            next_level = LEVELS[self.level_index]["level"]
            self.message_text.set(f"Level {current_level_number} cleared. Moving to level {next_level}.")
            self.next_round_job = self.root.after(1500, lambda: self.start_round(self.level_index))
            self.refresh_stats_display()
            return

        if correct and self.level_index == len(LEVELS) - 1:
            self.message_text.set("Amazing! You completed level 9. Continuing at level 9 until time ends.")
            self.next_round_job = self.root.after(1500, lambda: self.start_round(self.level_index))
            return

        self.message_text.set(f"Level {current_level_number} not cleared. Repeating the same level.")
        self.next_round_job = self.root.after(1500, lambda: self.start_round(self.level_index))

    def finish_game_due_to_time(self) -> None:
        self.message_text.set("4 minutes completed. Saving results now.")
        self.finish_game()

    def finish_game(self) -> None:
        if self.pending_persisted:
            return
        if self.session_start_ms is not None:
            self.current_session["game_duration_ms"] = int(time.time() * 1000) - self.session_start_ms

        self.started = False
        self.phase = "finished"
        self.stop_session_timer()
        self.cancel_jobs()

        self.timer_text.set("")

        self.persist_session_data(self.score)
        self.pending_persisted = True
        self.refresh_stats_display()

    def refresh_grid_appearance(self) -> None:
        for number, button in self.number_buttons.items():
            bg = "#ffffff"
            active_bg = "#dceffd"
            fg = "#243447"

            if number in self.selected:
                bg = "#b8e2ff"
                active_bg = "#b8e2ff"
            elif not self.reduced_distraction.get():
                bg = "#fef4f7"
                active_bg = "#fff1c7"

            button.configure(bg=bg, activebackground=active_bg, fg=fg, state="normal")

    def persist_session_data(self, final_score: int) -> None:
        if not self.active_player_key:
            return
        players = self.player_store.setdefault("players", {})
        player = players.get(self.active_player_key)
        if not player:
            return

        rounds_played = int(self.current_session["rounds_played"])
        rounds_correct = int(self.current_session["rounds_correct"])
        response_times = list(self.current_session["response_times_ms"])
        total_response_time = int(sum(response_times))
        avg_response_time = round(total_response_time / len(response_times)) if response_times else 0
        lapse_count = int(self.current_session["lapse_count"])
        total_lapse_duration = int(self.current_session["total_lapse_duration_ms"])
        avg_lapse_duration = round(total_lapse_duration / lapse_count) if lapse_count else 0
        longest_lapse = int(self.current_session["longest_lapse_ms"])

        session_entry = {
            "started_at": self.current_session["started_at"],
            "ended_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "score": final_score,
            "accuracy_percent": self.calculate_accuracy(rounds_correct, rounds_played),
            "rounds_played": rounds_played,
            "rounds_correct": rounds_correct,
            "total_response_time_ms": total_response_time,
            "average_response_time_ms": avg_response_time,
            "lapse_count": lapse_count,
            "total_lapse_duration_ms": total_lapse_duration,
            "average_lapse_duration_ms": avg_lapse_duration,
            "longest_lapse_ms": longest_lapse,
            "lapses": list(self.current_session["lapses"]),
            "level_history": list(self.current_session["level_history"]),
            "game_duration_ms": int(self.current_session.get("game_duration_ms", 0)),
            "mode": self.current_session.get("mode", "normal"),
            "mode_label": GAME_MODES.get(self.current_session.get("mode", "normal"), "Normal"),
            "highest_level_reached": int(self.current_session.get("highest_level_reached", 1)),
        }

        lifetime = player.setdefault("lifetime", {})
        lifetime["rounds_played"] = int(lifetime.get("rounds_played", 0)) + rounds_played
        lifetime["rounds_correct"] = int(lifetime.get("rounds_correct", 0)) + rounds_correct
        lifetime["total_response_time_ms"] = int(lifetime.get("total_response_time_ms", 0)) + total_response_time
        lifetime["total_lapse_count"] = int(lifetime.get("total_lapse_count", 0)) + lapse_count
        lifetime["total_lapse_duration_ms"] = int(lifetime.get("total_lapse_duration_ms", 0)) + total_lapse_duration
        lifetime["longest_lapse_ms"] = max(int(lifetime.get("longest_lapse_ms", 0)), longest_lapse)
        lifetime["sessions_played"] = int(lifetime.get("sessions_played", 0)) + 1
        lifetime["best_score"] = max(int(lifetime.get("best_score", 0)), final_score)
        lifetime["average_response_time_ms"] = (
            round(int(lifetime["total_response_time_ms"]) / int(lifetime["rounds_played"]))
            if int(lifetime["rounds_played"]) else 0
        )
        lifetime["average_lapse_duration_ms"] = (
            round(int(lifetime["total_lapse_duration_ms"]) / int(lifetime["total_lapse_count"]))
            if int(lifetime["total_lapse_count"]) else 0
        )

        player.setdefault("sessions", []).append(session_entry)
        player["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        players[self.active_player_key] = player
        self.player_store["players"] = players
        self.player_store["last_player_key"] = self.active_player_key
        self.active_player = player
        self.best_score = int(lifetime["best_score"])
        self.save_store()
        self.refresh_stats_display()

    def open_results_with_password(self) -> None:
        password = simpledialog.askstring("Results password", "Enter password to open results:", show="*")
        if password is None:
            return
        if password != RESULTS_PASSWORD:
            messagebox.showerror("Wrong password", "Incorrect password.")
            return
        self.show_results_dashboard()

    def show_results_dashboard(self) -> None:
        player = self.active_player
        if not player:
            messagebox.showinfo("Results", "No current player selected.")
            return
        sessions = player.get("sessions", [])
        if not sessions:
            messagebox.showinfo("Results", "No saved sessions found for this player yet.")
            return

        latest = sessions[-1]
        level_history = latest.get("level_history", [])
        if not level_history:
            messagebox.showinfo("Results", "No round history available for graphing yet.")
            return

        result_window = tk.Toplevel(self.root)
        result_window.title(f"Results Dashboard - {player.get('name', '')}")
        result_window.geometry("1200x820")
        result_window.configure(bg="#ffffff")

        header = tk.Frame(result_window, bg="#ffffff")
        header.pack(fill="x", padx=16, pady=12)
        tk.Label(
            header,
            text=f"Results for {player.get('name', '')} (Age {player.get('age', '')})",
            font=("Arial", 18, "bold"),
            bg="#ffffff",
            fg="#243447",
        ).pack(anchor="w")
        tk.Label(
            header,
            text=(
                f"Mode: {latest.get('mode_label', 'Unknown')}   |   "
                f"Score: {latest.get('score', 0)}   |   "
                f"Accuracy: {latest.get('accuracy_percent', 0)}%   |   "
                f"Highest Level: {latest.get('highest_level_reached', 1)}   |   "
                f"Avg Response: {self.format_seconds(int(latest.get('average_response_time_ms', 0)))}   |   "
                f"Lapses: {latest.get('lapse_count', 0)}"
            ),
            font=("Arial", 11),
            bg="#ffffff",
            fg="#4b5d73",
        ).pack(anchor="w", pady=(4, 0))

        fig = Figure(figsize=(12, 8), dpi=100)
        ax1 = fig.add_subplot(221)
        ax2 = fig.add_subplot(222)
        ax3 = fig.add_subplot(223)
        ax4 = fig.add_subplot(224)

        rounds = list(range(1, len(level_history) + 1))
        response_secs = [item.get("response_time_ms", 0) / 1000 for item in level_history]
        levels = [item.get("level", 0) for item in level_history]
        correctness = [1 if item.get("correct", False) else 0 for item in level_history]

        level_summary = {}
        for item in level_history:
            lvl = item.get("level", 0)
            level_summary.setdefault(lvl, {"total": 0, "correct": 0, "response": []})
            level_summary[lvl]["total"] += 1
            level_summary[lvl]["correct"] += 1 if item.get("correct", False) else 0
            level_summary[lvl]["response"].append(item.get("response_time_ms", 0) / 1000)

        summary_levels = sorted(level_summary.keys())
        summary_accuracy = [100 * level_summary[lvl]["correct"] / level_summary[lvl]["total"] for lvl in summary_levels]
        summary_avg_response = [
            sum(level_summary[lvl]["response"]) / len(level_summary[lvl]["response"])
            for lvl in summary_levels
        ]

        lapse_entries = latest.get("lapses", [])
        lapse_durations = [entry.get("duration_ms", 0) / 1000 for entry in lapse_entries]

        ax1.plot(rounds, response_secs, marker="o")
        ax1.set_title("Response time by round")
        ax1.set_xlabel("Round")
        ax1.set_ylabel("Seconds")

        ax2.plot(rounds, levels, marker="o")
        ax2.set_title("Level reached over time")
        ax2.set_xlabel("Round")
        ax2.set_ylabel("Level")

        ax3.bar(summary_levels, summary_accuracy)
        ax3.set_title("Accuracy by level")
        ax3.set_xlabel("Level")
        ax3.set_ylabel("Accuracy %")
        ax3.set_ylim(0, 100)

        if lapse_durations:
            ax4.bar(list(range(1, len(lapse_durations) + 1)), lapse_durations)
            ax4.set_title("Lapse duration events")
            ax4.set_xlabel("Lapse event")
            ax4.set_ylabel("Seconds")
        else:
            ax4.text(0.5, 0.5, "No lapses recorded", ha="center", va="center")
            ax4.set_title("Lapse duration events")
            ax4.set_xticks([])
            ax4.set_yticks([])

        fig.tight_layout()

        canvas = FigureCanvasTkAgg(fig, master=result_window)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True, padx=12, pady=12)

        bottom = tk.Frame(result_window, bg="#ffffff")
        bottom.pack(fill="x", padx=16, pady=(0, 12))
        level_text = " | ".join(
            f"L{lvl}: acc {summary_accuracy[i]:.0f}%, avg {summary_avg_response[i]:.2f}s"
            for i, lvl in enumerate(summary_levels)
        )
        tk.Label(
            bottom,
            text=level_text if level_text else "No per-level summary available.",
            font=("Arial", 10),
            bg="#ffffff",
            fg="#4b5d73",
            wraplength=1100,
            justify="left",
        ).pack(anchor="w")

    def delete_current_player_data(self) -> None:
        if not self.active_player_key:
            messagebox.showwarning("No player", "No current player is selected.")
            return
        if not messagebox.askyesno("Delete player data", "Delete all saved data for the current player?"):
            return

        players = self.player_store.setdefault("players", {})
        players.pop(self.active_player_key, None)
        self.player_store["last_player_key"] = ""
        self.save_store()

        self.active_player_key = None
        self.active_player = None
        self.best_score = 0
        self.current_player_var.set("No player selected")
        self.message_text.set("Current player data deleted. Enter another player to begin.")
        self.refresh_stats_display()

    def reset_game(self) -> None:
        if self.current_idle_lapse_start_ms is not None:
            now_ms = int(time.time() * 1000)
            duration_ms = min(now_ms - self.current_idle_lapse_start_ms, LAPSE_MAX_DURATION_MS)
            self.record_lapse(self.current_idle_lapse_start_ms, duration_ms, "no_input_idle")
            self.current_idle_lapse_start_ms = None

        if self.started and int(self.current_session["rounds_played"]) > 0 and not self.pending_persisted:
            if self.session_start_ms is not None:
                self.current_session["game_duration_ms"] = int(time.time() * 1000) - self.session_start_ms
            self.persist_session_data(self.score)
            self.pending_persisted = True

        self.cancel_jobs()
        self.stop_session_timer()
        self.started = False
        self.phase = "idle"
        self.level_index = 0
        self.sequence = []
        self.selected = []
        self.score = 0
        self.stars = 0
        self.lives = 3
        self.session_start_ms = None
        self.stop_after_round = False
        self.reset_grid_rotation()
        self.timer_text.set("")
        self.message_text.set("Enter player details, choose a game type, and click Start Game.")
        self.current_session = self.empty_session_stats()
        self.refresh_grid_appearance()
        self.refresh_stats_display()
        self.record_app_activity()

    def cancel_jobs(self) -> None:
        if self.show_job is not None:
            try:
                self.root.after_cancel(self.show_job)
            except tk.TclError:
                pass
            self.show_job = None
        if self.next_round_job is not None:
            try:
                self.root.after_cancel(self.next_round_job)
            except tk.TclError:
                pass
            self.next_round_job = None

    def on_close(self) -> None:
        if self.current_idle_lapse_start_ms is not None:
            now_ms = int(time.time() * 1000)
            duration_ms = min(now_ms - self.current_idle_lapse_start_ms, LAPSE_MAX_DURATION_MS)
            self.record_lapse(self.current_idle_lapse_start_ms, duration_ms, "no_input_idle")
            self.current_idle_lapse_start_ms = None

        if self.started and int(self.current_session["rounds_played"]) > 0 and not self.pending_persisted:
            if self.session_start_ms is not None:
                self.current_session["game_duration_ms"] = int(time.time() * 1000) - self.session_start_ms
            self.persist_session_data(self.score)

        self.stop_global_lapse_watch()
        self.stop_session_timer()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    MemoryGameApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()