"""Cấu trúc dữ liệu nội bộ: Song/Track/Note và ArrangementPlan."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict


@dataclass
class Note:
    start: float  # thời điểm bắt đầu, tính theo beat
    dur: float    # độ dài, tính theo beat
    pitch: int    # MIDI pitch 0-127
    vel: int      # velocity 1-127


@dataclass
class Track:
    name: str
    program: int          # GM program 0-127
    is_drum: bool
    notes: list[Note] = field(default_factory=list)
    role: str = ""        # melody | bass | harmony | drums (gán khi phân tích)

    def pitch_stats(self) -> tuple[float, float]:
        if not self.notes:
            return 0.0, 0.0
        ps = [n.pitch for n in self.notes]
        return sum(ps) / len(ps), len(self.notes)


@dataclass
class Song:
    tempo_bpm: float
    tracks: list[Track] = field(default_factory=list)
    key_tonic: int = 0        # pitch class 0-11 (0=C)
    key_mode: str = "major"   # major | minor
    total_beats: float = 0.0
    beats_per_bar: int = 4
    name: str = ""

    def melodic_tracks(self) -> list[Track]:
        return [t for t in self.tracks if not t.is_drum and t.notes]


PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


@dataclass
class ArrangementPlan:
    """Kế hoạch phối khí — do LLM hoặc rule-based planner sinh ra."""

    emotion: str = "neutral"
    ensemble: str = "piano_solo"
    tempo_factor: float = 1.0        # 0.5 .. 1.6
    transpose: int = 0               # -12 .. 12 semitones
    target_mode: str = "keep"        # major | minor | keep
    velocity_factor: float = 1.0     # 0.4 .. 1.4
    duration_factor: float = 1.0     # 0.5 .. 1.6 (staccato .. legato)
    humanize_timing: float = 0.01    # 0 .. 0.06 beat jitter
    humanize_velocity: float = 0.08  # 0 .. 0.3
    reverb: float = 0.3              # 0 .. 1
    add_bass: bool = False
    add_pad: bool = False
    add_arpeggio: bool = False
    add_drums: bool = False
    drum_style: str = "none"         # none | soft | rock | lofi | epic
    octave_double_melody: bool = False
    style_prompt: str = ""           # mô tả văn bản cho AI audio generator (tùy chọn)
    rationale: str = ""
    source: str = "rules"            # rules | llm

    def sanitize(self) -> "ArrangementPlan":
        """Ép mọi giá trị về khoảng an toàn (LLM có thể trả số ngoài biên)."""
        self.tempo_factor = _clamp(float(self.tempo_factor), 0.5, 1.6)
        self.transpose = int(_clamp(int(self.transpose), -12, 12))
        if self.target_mode not in ("major", "minor", "keep"):
            self.target_mode = "keep"
        self.velocity_factor = _clamp(float(self.velocity_factor), 0.4, 1.4)
        self.duration_factor = _clamp(float(self.duration_factor), 0.5, 1.6)
        self.humanize_timing = _clamp(float(self.humanize_timing), 0.0, 0.06)
        self.humanize_velocity = _clamp(float(self.humanize_velocity), 0.0, 0.3)
        self.reverb = _clamp(float(self.reverb), 0.0, 1.0)
        if self.drum_style not in ("none", "soft", "rock", "lofi", "epic"):
            self.drum_style = "none"
        if self.drum_style == "none":
            self.add_drums = False
        return self

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=2)

    @classmethod
    def from_dict(cls, d: dict) -> "ArrangementPlan":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in known})
