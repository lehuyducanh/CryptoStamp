"""Engine biến đổi: áp ArrangementPlan lên Song -> Song mới đã phối khí."""

from __future__ import annotations

import copy
import random

from .ensembles import ENSEMBLES
from .models import ArrangementPlan, Note, Song, Track

# GM drum notes
KICK, SNARE, HAT_CLOSED, CRASH, TOM_LOW, TOM_HIGH, RIDE = 36, 38, 42, 49, 45, 50, 51

# Bảng hạ/nâng bậc khi đổi mode (tính theo khoảng cách nửa cung so với chủ âm)
_MAJ_TO_MIN = {4: 3, 9: 8, 11: 10}   # bậc 3, 6, 7 hạ nửa cung
_MIN_TO_MAJ = {3: 4, 8: 9, 10: 11}   # bậc 3, 6, 7 nâng nửa cung


def _shift_mode(pitch: int, tonic: int, mapping: dict[int, int]) -> int:
    rel = (pitch - tonic) % 12
    if rel in mapping:
        return pitch + (mapping[rel] - rel)
    return pitch


def _fit_range(pitch: int, lo: int, hi: int) -> int:
    while pitch < lo:
        pitch += 12
    while pitch > hi:
        pitch -= 12
    return max(0, min(127, pitch))


def _bar_chord_pitches(song: Song, bar: int, beats_per_bar: int) -> list[int]:
    """Các cao độ vang lên trong ô nhịp `bar` (đã lọc trùng pitch-class, sắp từ thấp lên)."""
    lo, hi = bar * beats_per_bar, (bar + 1) * beats_per_bar
    weight: dict[int, float] = {}
    for tr in song.tracks:
        if tr.is_drum:
            continue
        for n in tr.notes:
            if n.start < hi and n.start + n.dur > lo:
                overlap = min(n.start + n.dur, hi) - max(n.start, lo)
                weight[n.pitch] = weight.get(n.pitch, 0.0) + overlap
    if not weight:
        return []
    ordered = sorted(weight, key=lambda p: (-weight[p], p))
    seen_pc, chord = set(), []
    for p in ordered:
        if p % 12 not in seen_pc:
            seen_pc.add(p % 12)
            chord.append(p)
        if len(chord) >= 4:
            break
    return sorted(chord)


def _gen_bass(song: Song, plan: ArrangementPlan, n_bars: int, bpb: int) -> list[Note]:
    notes = []
    pulse = plan.drum_style in ("rock", "epic") or plan.emotion in ("tense",)
    for bar in range(n_bars):
        chord = _bar_chord_pitches(song, bar, bpb)
        if not chord:
            continue
        root = _fit_range(min(chord), 33, 48)
        if pulse:
            for b in range(bpb):
                notes.append(Note(start=bar * bpb + b, dur=0.9, pitch=root, vel=92))
        else:
            notes.append(Note(start=bar * bpb, dur=bpb * 0.95, pitch=root, vel=80))
    return notes


def _gen_pad(song: Song, n_bars: int, bpb: int) -> list[Note]:
    notes = []
    for bar in range(n_bars):
        chord = _bar_chord_pitches(song, bar, bpb)
        for p in chord[:4]:
            notes.append(Note(start=bar * bpb, dur=bpb * 1.02,
                              pitch=_fit_range(p, 55, 76), vel=52))
    return notes


def _gen_arpeggio(song: Song, n_bars: int, bpb: int) -> list[Note]:
    notes = []
    step = 0.5  # nốt móc đơn
    for bar in range(n_bars):
        chord = _bar_chord_pitches(song, bar, bpb)
        if not chord:
            continue
        seq = [_fit_range(p, 64, 88) for p in chord]
        seq = seq + seq[-2:0:-1] if len(seq) > 2 else seq * 2
        t, i = 0.0, 0
        while t < bpb - 1e-6:
            notes.append(Note(start=bar * bpb + t, dur=step * 0.9,
                              pitch=seq[i % len(seq)], vel=58))
            t += step
            i += 1
    return notes


_DRUM_PATTERNS = {
    # mỗi mục: list (beat_offset, pitch, vel, dur)
    "soft": [(0, KICK, 84, 0.2), (1, HAT_CLOSED, 50, 0.1), (2, SNARE, 66, 0.2),
             (2.5, HAT_CLOSED, 44, 0.1), (3, HAT_CLOSED, 50, 0.1)],
    "rock": [(0, KICK, 105, 0.2), (0.5, HAT_CLOSED, 62, 0.1), (1, SNARE, 100, 0.2),
             (1.5, HAT_CLOSED, 62, 0.1), (2, KICK, 100, 0.2), (2.5, HAT_CLOSED, 62, 0.1),
             (3, SNARE, 102, 0.2), (3.5, HAT_CLOSED, 62, 0.1)],
    "lofi": [(0, KICK, 88, 0.2), (1, SNARE, 70, 0.2), (1.75, HAT_CLOSED, 40, 0.1),
             (2.5, KICK, 78, 0.2), (3, SNARE, 72, 0.2), (3.5, HAT_CLOSED, 42, 0.1)],
    "epic": [(0, KICK, 115, 0.3), (0, CRASH, 90, 1.0), (1, TOM_LOW, 95, 0.2),
             (2, KICK, 110, 0.3), (2.5, TOM_LOW, 90, 0.2), (3, TOM_HIGH, 96, 0.2),
             (3.5, TOM_LOW, 100, 0.2)],
}


def _gen_drums(style: str, n_bars: int, bpb: int) -> list[Note]:
    pattern = _DRUM_PATTERNS.get(style)
    if not pattern:
        return []
    notes = []
    for bar in range(n_bars):
        for off, pitch, vel, dur in pattern:
            if off < bpb:
                # crash chỉ đánh mỗi 4 ô nhịp cho đỡ ồn
                if pitch == CRASH and bar % 4 != 0:
                    continue
                notes.append(Note(start=bar * bpb + off, dur=dur, pitch=pitch, vel=vel))
    return notes


def arrange(song: Song, plan: ArrangementPlan, seed: int = 0) -> Song:
    """Áp plan lên song, trả về Song mới (không sửa song gốc)."""
    rng = random.Random(seed)
    src = copy.deepcopy(song)
    bpb = src.beats_per_bar
    n_bars = int(src.total_beats // bpb) + 1

    # 1) đổi mode (trước khi transpose, dựa trên key gốc)
    if plan.target_mode != "keep" and plan.target_mode != src.key_mode:
        mapping = _MAJ_TO_MIN if plan.target_mode == "minor" else _MIN_TO_MAJ
        for tr in src.tracks:
            if tr.is_drum:
                continue
            for n in tr.notes:
                n.pitch = _shift_mode(n.pitch, src.key_tonic, mapping)
        src.key_mode = plan.target_mode

    # 2) transpose
    if plan.transpose:
        for tr in src.tracks:
            if tr.is_drum:
                continue
            for n in tr.notes:
                n.pitch += plan.transpose
        src.key_tonic = (src.key_tonic + plan.transpose) % 12

    # 3) map các track gốc vào slot của ensemble
    ens = ENSEMBLES[plan.ensemble]
    slots = {s["role"]: s for s in ens["slots"]}
    out_tracks: list[Track] = []

    melody_src = [t for t in src.tracks if t.role == "melody"]
    bass_src = [t for t in src.tracks if t.role == "bass"]
    harmony_src = [t for t in src.tracks if t.role == "harmony"]

    def make_track(slot: dict, notes: list[Note], role: str) -> Track:
        fitted = []
        lo, hi = slot["range"]
        for n in notes:
            p = _fit_range(n.pitch + slot.get("octave", 0), lo, hi)
            fitted.append(Note(start=n.start, dur=n.dur, pitch=p, vel=n.vel))
        return Track(name=slot["name"], program=slot["program"],
                     is_drum=(role == "drums"), notes=fitted, role=role)

    if melody_src and "melody" in slots:
        merged = [n for t in melody_src for n in t.notes]
        out_tracks.append(make_track(slots["melody"], merged, "melody"))
        if plan.octave_double_melody:
            dbl_slot = slots.get("harmony2") or slots.get("harmony") or slots["melody"]
            dbl = [Note(start=n.start, dur=n.dur, pitch=n.pitch - 12, vel=max(30, n.vel - 18))
                   for n in merged]
            out_tracks.append(Track(name=f"{dbl_slot['name']} (dbl)", program=dbl_slot["program"],
                                    is_drum=False, notes=dbl, role="harmony"))

    harmony_slots = [slots[r] for r in ("harmony", "harmony2") if r in slots]
    if harmony_src and harmony_slots:
        for i, t in enumerate(harmony_src):
            slot = harmony_slots[i % len(harmony_slots)]
            out_tracks.append(make_track(slot, t.notes, "harmony"))

    if "bass" in slots:
        if bass_src:
            merged = [n for t in bass_src for n in t.notes]
            out_tracks.append(make_track(slots["bass"], merged, "bass"))
        elif plan.add_bass:
            out_tracks.append(make_track(slots["bass"], _gen_bass(src, plan, n_bars, bpb), "bass"))

    if plan.add_pad and "pad" in slots:
        out_tracks.append(make_track(slots["pad"], _gen_pad(src, n_bars, bpb), "pad"))

    if plan.add_arpeggio:
        arp_slot = slots.get("arpeggio") or slots.get("harmony") or slots.get("melody")
        if arp_slot:
            arp = Track(name=f"{arp_slot['name']} Arp", program=arp_slot["program"],
                        is_drum=False, notes=_gen_arpeggio(src, n_bars, bpb), role="arpeggio")
            out_tracks.append(arp)

    if plan.add_drums and "drums" in slots:
        out_tracks.append(Track(name="Drums", program=0, is_drum=True,
                                notes=_gen_drums(plan.drum_style, n_bars, bpb), role="drums"))

    # 4) dynamics + articulation + humanize
    for tr in out_tracks:
        for n in tr.notes:
            if not tr.is_drum:
                n.dur = max(0.1, n.dur * plan.duration_factor)
            v = n.vel * plan.velocity_factor
            v *= 1.0 + rng.uniform(-plan.humanize_velocity, plan.humanize_velocity)
            n.vel = int(max(20, min(127, v)))
            if plan.humanize_timing > 0 and tr.role != "drums":
                n.start = max(0.0, n.start + rng.uniform(-plan.humanize_timing,
                                                         plan.humanize_timing))
            n.pitch = max(0, min(127, n.pitch))
        tr.notes.sort(key=lambda n: n.start)

    new_bpm = max(40.0, min(208.0, src.tempo_bpm * plan.tempo_factor))
    result = Song(tempo_bpm=new_bpm, tracks=out_tracks, key_tonic=src.key_tonic,
                  key_mode=src.key_mode, total_beats=src.total_beats,
                  beats_per_bar=bpb, name=src.name)

    # pan lưu tạm vào thuộc tính động để synth dùng
    pans = {s["name"]: s.get("pan", 0.0) for s in ens["slots"]}
    for tr in result.tracks:
        base = tr.name.split(" (")[0].replace(" Arp", "")
        tr.pan = pans.get(tr.name, pans.get(base, 0.0))  # type: ignore[attr-defined]
    return result
