"""Render MIDI/Song -> audio. Ưu tiên FluidSynth + soundfont nếu có, fallback synth numpy."""

from __future__ import annotations

import glob
import os
import shutil
import subprocess

from .models import Song
from .synth import synthesize_to_wav

_SF2_SEARCH = [
    "/usr/share/sounds/sf2/*.sf2",
    "/usr/share/soundfonts/*.sf2",
    os.path.expanduser("~/.soundfonts/*.sf2"),
]


def find_soundfont() -> str | None:
    env = os.environ.get("AUTOARRANGER_SF2")
    if env and os.path.exists(env):
        return env
    for pattern in _SF2_SEARCH:
        hits = sorted(glob.glob(pattern))
        if hits:
            return hits[0]
    return None


def render_wav(song: Song, midi_path: str, wav_path: str, reverb: float = 0.3) -> str:
    """midi_path phải đã tồn tại (pipeline lưu MIDI trước khi render)."""
    fluidsynth = shutil.which("fluidsynth")
    sf2 = find_soundfont()
    if fluidsynth and sf2:
        subprocess.run(
            [fluidsynth, "-ni", "-g", "0.7", sf2, midi_path,
             "-F", wav_path, "-r", "44100"],
            check=True, capture_output=True,
        )
        return wav_path
    return synthesize_to_wav(song, wav_path, reverb=reverb)


def wav_to_mp3(wav_path: str, mp3_path: str) -> str | None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", "-i", wav_path,
         "-codec:a", "libmp3lame", "-qscale:a", "3", mp3_path],
        check=True, capture_output=True,
    )
    return mp3_path
