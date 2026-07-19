"""Sinh MIDI mẫu từ các giai điệu thuộc phạm vi công cộng (public domain)."""

from __future__ import annotations

import os

from .midi_io import save_midi
from .models import Note, Song, Track

# (pitch, dur_beats); pitch=None là dấu lặng
_ODE_TO_JOY = [
    (64, 1), (64, 1), (65, 1), (67, 1), (67, 1), (65, 1), (64, 1), (62, 1),
    (60, 1), (60, 1), (62, 1), (64, 1), (64, 1.5), (62, 0.5), (62, 2),
    (64, 1), (64, 1), (65, 1), (67, 1), (67, 1), (65, 1), (64, 1), (62, 1),
    (60, 1), (60, 1), (62, 1), (64, 1), (62, 1.5), (60, 0.5), (60, 2),
]

_GREENSLEEVES = [  # 6/8 quy về beat 3/4 đơn giản
    (57, 1), (60, 2), (62, 1), (64, 1.5), (65, 0.5), (64, 1),
    (62, 2), (59, 1), (55, 1.5), (57, 0.5), (59, 1),
    (60, 2), (57, 1), (57, 1.5), (56, 0.5), (57, 1),
    (59, 2), (56, 1), (52, 3),
    (57, 1), (60, 2), (62, 1), (64, 1.5), (65, 0.5), (64, 1),
    (62, 2), (59, 1), (55, 1.5), (57, 0.5), (59, 1),
    (60, 1.5), (59, 0.5), (57, 1), (56, 1.5), (54, 0.5), (56, 1), (57, 3),
]

# hợp âm đệm cho Ode to Joy (mỗi ô nhịp 4 beat một hợp âm)
_ODE_CHORDS = [
    [48, 55, 64], [48, 55, 65], [43, 55, 62], [48, 55, 64],
    [48, 55, 64], [48, 55, 65], [43, 55, 62], [48, 52, 60],
]


def _melody_track(seq, name: str, vel: int = 90) -> Track:
    notes, t = [], 0.0
    for pitch, dur in seq:
        if pitch is not None:
            notes.append(Note(start=t, dur=dur * 0.95, pitch=pitch, vel=vel))
        t += dur
    return Track(name=name, program=0, is_drum=False, notes=notes, role="melody")


def build_ode_to_joy() -> Song:
    melody = _melody_track(_ODE_TO_JOY, "Melody")
    chords = Track(name="Chords", program=0, is_drum=False, role="harmony")
    for bar, chord in enumerate(_ODE_CHORDS * 2):
        for p in chord:
            chords.notes.append(Note(start=bar * 4.0, dur=3.8, pitch=p, vel=60))
    total = max(n.start + n.dur for n in melody.notes)
    song = Song(tempo_bpm=120, tracks=[melody, chords], key_tonic=0, key_mode="major",
                total_beats=total, name="ode_to_joy")
    return song


def build_greensleeves() -> Song:
    melody = _melody_track(_GREENSLEEVES, "Melody", vel=84)
    total = max(n.start + n.dur for n in melody.notes)
    song = Song(tempo_bpm=100, tracks=[melody], key_tonic=9, key_mode="minor",
                total_beats=total, beats_per_bar=3, name="greensleeves")
    return song


EXAMPLES = {
    "ode_to_joy": build_ode_to_joy,
    "greensleeves": build_greensleeves,
}


def write_example(name: str, out_dir: str) -> str:
    if name not in EXAMPLES:
        raise KeyError(f"Không có bản mẫu '{name}'. Chọn: {', '.join(EXAMPLES)}")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.mid")
    save_midi(EXAMPLES[name](), path)
    return path
