"""Synthesizer nội bộ (numpy) — render Song -> WAV, không cần FluidSynth/soundfont.

Chất lượng ở mức demo/preview: mỗi họ nhạc cụ GM có màu âm + envelope riêng.
Muốn chất lượng cao hơn, cài fluidsynth + soundfont (render.py tự ưu tiên).
"""

from __future__ import annotations

import wave

import numpy as np

from .models import Song, Track

SR = 44100

# Họ âm sắc theo GM program
PLUCK, SUSTAIN, PAD, BASS, CHIP, BELL = range(6)


def _family(program: int) -> int:
    if 80 <= program <= 87:
        return CHIP
    if 8 <= program <= 15 or program >= 104:
        return BELL
    if 88 <= program <= 95 or program in (52, 91, 89):
        return PAD
    if 32 <= program <= 39:
        return BASS
    if 0 <= program <= 7 or 24 <= program <= 31 or program in (45, 46):
        return PLUCK
    return SUSTAIN  # organ, strings, brass, reeds, flutes...


def _partials(family: int) -> list[tuple[float, float]]:
    """(bội số tần số, biên độ)"""
    if family == PLUCK:
        return [(1, 1.0), (2, 0.45), (3, 0.28), (4, 0.15), (5, 0.08)]
    if family == BELL:
        return [(1, 1.0), (2.76, 0.35), (4.07, 0.18)]
    if family == BASS:
        return [(1, 1.0), (2, 0.35), (3, 0.1)]
    if family == CHIP:
        return [(1, 1.0), (3, 0.33), (5, 0.2), (7, 0.14)]  # xấp xỉ sóng vuông
    if family == PAD:
        return [(1, 1.0), (2, 0.5), (3, 0.25), (4, 0.12), (5, 0.07)]
    return [(1, 1.0), (2, 0.6), (3, 0.4), (4, 0.25), (5, 0.15), (6, 0.08)]  # SUSTAIN


def _envelope(family: int, n: int, dur_s: float) -> np.ndarray:
    t = np.arange(n) / SR
    if family in (PLUCK, BELL):
        rate = 3.0 if family == PLUCK else 2.0
        env = np.exp(-rate * t)
        atk = min(int(0.004 * SR), n)
    elif family == BASS:
        env = np.exp(-1.2 * t)
        atk = min(int(0.006 * SR), n)
    elif family == PAD:
        env = np.ones(n)
        atk = min(int(0.35 * SR), max(1, n // 2))
    elif family == CHIP:
        env = np.ones(n)
        atk = min(int(0.002 * SR), n)
    else:  # SUSTAIN
        env = 1.0 - 0.25 * np.minimum(t / max(dur_s, 1e-3), 1.0)
        atk = min(int(0.06 * SR), max(1, n // 3))
    if atk > 0:
        env[:atk] *= np.linspace(0, 1, atk)
    rel = min(int(0.08 * SR) if family not in (PAD,) else int(0.4 * SR), n)
    if rel > 0:
        env[n - rel:] *= np.linspace(1, 0, rel)
    return env


def _render_note(freq: float, dur_s: float, family: int) -> np.ndarray:
    n = max(int(dur_s * SR), 32)
    t = np.arange(n) / SR
    if family == SUSTAIN:  # vibrato nhẹ
        phase = 2 * np.pi * freq * t + 0.35 * np.sin(2 * np.pi * 5.0 * t)
    else:
        phase = 2 * np.pi * freq * t
    sig = np.zeros(n)
    for mult, amp in _partials(family):
        if freq * mult < SR / 2:
            sig += amp * np.sin(phase * mult)
    return sig * _envelope(family, n, dur_s)


def _render_drum(pitch: int, rng: np.random.Generator) -> np.ndarray:
    if pitch == 36:  # kick: sweep sine
        n = int(0.16 * SR)
        t = np.arange(n) / SR
        f = 110 * np.exp(-18 * t) + 45
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-22 * t) * 1.4
    if pitch == 38:  # snare
        n = int(0.18 * SR)
        t = np.arange(n) / SR
        return (rng.standard_normal(n) * 0.7 + np.sin(2 * np.pi * 190 * t) * 0.4) * np.exp(-26 * t)
    if pitch == 42:  # closed hat: noise "sáng" (đạo hàm bậc 1)
        n = int(0.06 * SR)
        noise = np.diff(rng.standard_normal(n + 1))
        return noise * np.exp(-60 * np.arange(n) / SR) * 0.5
    if pitch == 49:  # crash
        n = int(1.2 * SR)
        noise = np.diff(rng.standard_normal(n + 1))
        return noise * np.exp(-3.5 * np.arange(n) / SR) * 0.5
    if pitch in (45, 47, 50):  # toms
        n = int(0.3 * SR)
        t = np.arange(n) / SR
        base = {45: 95.0, 47: 120.0, 50: 150.0}[pitch]
        f = base * np.exp(-4 * t)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-11 * t) * 1.1
    # mặc định: tick ngắn
    n = int(0.05 * SR)
    return rng.standard_normal(n) * np.exp(-70 * np.arange(n) / SR) * 0.4


def _pitch_freq(p: int) -> float:
    return 440.0 * 2.0 ** ((p - 69) / 12.0)


def render_song(song: Song, reverb: float = 0.3) -> np.ndarray:
    """Trả về mảng stereo float32 (N, 2), đã normalize."""
    spb = 60.0 / song.tempo_bpm  # giây / beat
    tail = 2.0 + reverb * 2.0
    total_s = song.total_beats * spb + tail
    n_total = int(total_s * SR) + SR
    mix = np.zeros((n_total, 2), dtype=np.float64)
    rng = np.random.default_rng(42)

    for tr in song.tracks:
        if not tr.notes:
            continue
        pan = float(getattr(tr, "pan", 0.0))
        gl = np.sqrt(0.5 * (1 - pan))
        gr = np.sqrt(0.5 * (1 + pan))
        fam = _family(tr.program)
        gain = {PLUCK: 0.5, SUSTAIN: 0.36, PAD: 0.22, BASS: 0.55,
                CHIP: 0.3, BELL: 0.45}[fam] if not tr.is_drum else 0.9

        for note in tr.notes:
            start_i = int(note.start * spb * SR)
            amp = (note.vel / 127.0) ** 1.5 * gain
            if tr.is_drum:
                sig = _render_drum(note.pitch, rng)
            else:
                dur_s = note.dur * spb
                # pluck/bell ngân thêm một chút sau khi nhả phím
                if fam in (PLUCK, BELL, BASS):
                    dur_s += 0.25
                sig = _render_note(_pitch_freq(note.pitch), dur_s, fam)
            end_i = min(start_i + len(sig), n_total)
            if end_i <= start_i:
                continue
            seg = sig[: end_i - start_i] * amp
            mix[start_i:end_i, 0] += seg * gl
            mix[start_i:end_i, 1] += seg * gr

    # "reverb" đơn giản: multi-tap echo suy giảm
    if reverb > 0.02:
        wet = np.zeros_like(mix)
        delays = [0.031, 0.067, 0.103, 0.149, 0.211]
        g = 0.5 * reverb
        for i, d in enumerate(delays):
            di = int(d * SR)
            gain_i = g * (0.72 ** i)
            wet[di:, 0] += mix[:-di, 1] * gain_i  # chéo kênh cho rộng tiếng
            wet[di:, 1] += mix[:-di, 0] * gain_i
        mix = mix * (1.0 - 0.25 * reverb) + wet

    peak = np.max(np.abs(mix))
    if peak > 0:
        mix = np.tanh(mix / peak * 1.8) / np.tanh(1.8) * 0.92
    return mix.astype(np.float32)


def write_wav(audio: np.ndarray, path: str) -> None:
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes())


def synthesize_to_wav(song: Song, path: str, reverb: float = 0.3) -> str:
    write_wav(render_song(song, reverb=reverb), path)
    return path
