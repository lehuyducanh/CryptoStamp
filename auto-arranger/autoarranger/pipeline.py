"""Orchestrator: chạy trọn pipeline plan -> arrange -> render và lưu sản phẩm."""

from __future__ import annotations

import os
import time

from .arranger import arrange
from .midi_io import load_midi, save_midi
from .models import PITCH_NAMES, ArrangementPlan, Song
from .planner import make_plan
from .render import render_wav, wav_to_mp3


def arrange_song(
    input_midi: str | None = None,
    song: Song | None = None,
    emotion: str = "peaceful",
    ensemble: str = "piano_solo",
    out_dir: str = "output",
    use_llm: str = "auto",
    notes: str = "",
    seed: int = 0,
    mp3: bool = False,
) -> dict:
    """Chạy pipeline cho 1 tổ hợp (bài, cảm xúc, biên chế). Trả về dict đường dẫn."""
    t0 = time.time()
    if song is None:
        if not input_midi:
            raise ValueError("Cần input_midi hoặc song")
        song = load_midi(input_midi)

    base = os.path.splitext(os.path.basename(song.name or input_midi or "song"))[0]
    job = f"{base}__{emotion}__{ensemble}"
    job_dir = os.path.join(out_dir, job)
    os.makedirs(job_dir, exist_ok=True)

    # 1) lên kế hoạch
    plan: ArrangementPlan = make_plan(song, emotion, ensemble, notes=notes, use_llm=use_llm)
    with open(os.path.join(job_dir, "plan.json"), "w", encoding="utf-8") as f:
        f.write(plan.to_json())

    # 2) phối
    arranged = arrange(song, plan, seed=seed)
    midi_path = os.path.join(job_dir, f"{job}.mid")
    save_midi(arranged, midi_path)

    # 3) render audio
    wav_path = os.path.join(job_dir, f"{job}.wav")
    render_wav(arranged, midi_path, wav_path, reverb=plan.reverb)
    mp3_path = wav_to_mp3(wav_path, os.path.join(job_dir, f"{job}.mp3")) if mp3 else None

    # 4) báo cáo
    report = os.path.join(job_dir, "report.md")
    with open(report, "w", encoding="utf-8") as f:
        f.write(
            f"# {job}\n\n"
            f"- Nguồn: `{song.name}` — giọng {PITCH_NAMES[song.key_tonic]} {song.key_mode}, "
            f"{song.tempo_bpm:.0f} BPM\n"
            f"- Cảm xúc: **{emotion}** | Biên chế: **{ensemble}** | Planner: {plan.source}\n"
            f"- Bản phối: giọng {PITCH_NAMES[arranged.key_tonic]} {arranged.key_mode}, "
            f"{arranged.tempo_bpm:.0f} BPM, {len(arranged.tracks)} track\n"
            f"- Lý do phối khí: {plan.rationale}\n"
            f"- Style prompt (cho text-to-music AI): {plan.style_prompt}\n"
            f"- Thời gian xử lý: {time.time() - t0:.1f}s\n"
        )

    return {
        "job": job,
        "dir": job_dir,
        "plan": os.path.join(job_dir, "plan.json"),
        "midi": midi_path,
        "wav": wav_path,
        "mp3": mp3_path,
        "report": report,
        "planner": plan.source,
    }


def arrange_batch(
    input_midi: str | None,
    song: Song | None,
    emotions: list[str],
    ensembles: list[str],
    out_dir: str = "output",
    use_llm: str = "auto",
    notes: str = "",
    seed: int = 0,
    mp3: bool = False,
) -> list[dict]:
    """Một bài nhạc -> nhiều bản phối (tích Descartes cảm xúc × biên chế)."""
    if song is None and input_midi:
        song = load_midi(input_midi)
    results = []
    for emo in emotions:
        for ens in ensembles:
            results.append(arrange_song(
                input_midi=input_midi, song=song, emotion=emo, ensemble=ens,
                out_dir=out_dir, use_llm=use_llm, notes=notes, seed=seed, mp3=mp3,
            ))
    return results
