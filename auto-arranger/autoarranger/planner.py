"""Planner: sinh ArrangementPlan bằng Claude API (ưu tiên) hoặc rule-based (fallback).

LLM nhận bản phân tích bài nhạc + cảm xúc/biên chế mong muốn, trả về plan JSON
(structured outputs — đảm bảo đúng schema). Không có API key thì dùng preset.
"""

from __future__ import annotations

import json
import os
import sys

from .emotions import EMOTIONS
from .ensembles import ENSEMBLES
from .models import ArrangementPlan, PITCH_NAMES, Song

MODEL = "claude-opus-4-8"

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "tempo_factor": {"type": "number", "description": "Hệ số tempo, 0.5-1.6"},
        "transpose": {"type": "integer", "description": "Dịch giọng, -12..12 nửa cung"},
        "target_mode": {"type": "string", "enum": ["major", "minor", "keep"]},
        "velocity_factor": {"type": "number", "description": "Hệ số cường độ, 0.4-1.4"},
        "duration_factor": {"type": "number",
                            "description": "0.5=staccato .. 1.6=legato"},
        "humanize_timing": {"type": "number", "description": "Jitter nhịp, 0-0.06 beat"},
        "humanize_velocity": {"type": "number", "description": "Jitter cường độ, 0-0.3"},
        "reverb": {"type": "number", "description": "Độ vang, 0-1"},
        "add_bass": {"type": "boolean"},
        "add_pad": {"type": "boolean"},
        "add_arpeggio": {"type": "boolean"},
        "add_drums": {"type": "boolean"},
        "drum_style": {"type": "string", "enum": ["none", "soft", "rock", "lofi", "epic"]},
        "octave_double_melody": {"type": "boolean"},
        "style_prompt": {"type": "string",
                         "description": "Mô tả tiếng Anh 1-2 câu về bản phối, dùng cho "
                                        "text-to-music AI (MusicGen/Suno/Stable Audio)"},
        "rationale": {"type": "string",
                      "description": "Giải thích ngắn gọn (tiếng Việt) các lựa chọn phối khí"},
    },
    "required": ["tempo_factor", "transpose", "target_mode", "velocity_factor",
                 "duration_factor", "humanize_timing", "humanize_velocity", "reverb",
                 "add_bass", "add_pad", "add_arpeggio", "add_drums", "drum_style",
                 "octave_double_melody", "style_prompt", "rationale"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """Bạn là một nhạc sĩ phối khí (arranger) chuyên nghiệp.
Nhiệm vụ: nhận bản phân tích một bài nhạc (MIDI) cùng cảm xúc mục tiêu và biên chế
nhạc cụ, rồi quyết định các tham số phối khí để bản phối truyền tải đúng cảm xúc đó.

Nguyên tắc:
- tempo_factor, target_mode, velocity_factor, duration_factor là công cụ chính tạo cảm xúc:
  buồn = chậm + thứ + nhẹ + legato; vui = nhanh hơn + trưởng + gọn tiếng;
  hùng tráng = mạnh + dày (octave_double_melody, pad, trống epic); mơ màng = chậm + pad + arpeggio + vang nhiều.
- Chỉ bật add_drums khi phong cách thật sự cần và biên chế có slot trống.
- transpose dùng dè dặt (thường 0, hoặc ±2..±5 để đưa giai điệu vào âm vực đẹp của nhạc cụ chính).
- style_prompt viết bằng tiếng Anh, mô tả thể loại/nhạc cụ/mood để dùng với text-to-music AI.
- rationale viết tiếng Việt, 2-4 câu."""


def describe_song(song: Song) -> str:
    lines = [
        f"- Giọng ước lượng: {PITCH_NAMES[song.key_tonic]} {song.key_mode}",
        f"- Tempo gốc: {song.tempo_bpm:.0f} BPM, độ dài: {song.total_beats:.0f} beat "
        f"(~{song.total_beats * 60 / song.tempo_bpm:.0f} giây)",
        f"- Số track có nốt: {len([t for t in song.tracks if t.notes])}",
    ]
    for t in song.tracks:
        if not t.notes:
            continue
        avg, cnt = t.pitch_stats()
        lines.append(f"  * '{t.name}' role={t.role or '?'} program={t.program} "
                     f"drum={t.is_drum} notes={int(cnt)} pitch_tb={avg:.0f}")
    return "\n".join(lines)


def plan_with_rules(song: Song, emotion: str, ensemble: str) -> ArrangementPlan:
    preset = EMOTIONS.get(emotion, {})
    fields = {k: v for k, v in preset.items() if k != "description"}
    plan = ArrangementPlan(emotion=emotion, ensemble=ensemble, source="rules", **fields)
    ens_roles = {s["role"] for s in ENSEMBLES[ensemble]["slots"]}
    if "drums" not in ens_roles:
        plan.add_drums = False
    if "pad" not in ens_roles:
        plan.add_pad = False
    plan.style_prompt = (f"{ENSEMBLES[ensemble]['description']}, "
                         f"{preset.get('description', emotion)} mood, instrumental")
    plan.rationale = (f"Rule-based preset '{emotion}' áp lên biên chế '{ensemble}' "
                      f"(không dùng LLM).")
    return plan.sanitize()


def plan_with_llm(song: Song, emotion: str, ensemble: str,
                  notes: str = "") -> ArrangementPlan:
    """Gọi Claude API sinh plan. Ném exception nếu lỗi — caller tự fallback."""
    import anthropic  # import trễ để môi trường không có SDK vẫn chạy được rule-based

    client = anthropic.Anthropic()
    emo_desc = EMOTIONS.get(emotion, {}).get("description", emotion)
    ens = ENSEMBLES[ensemble]
    slot_desc = ", ".join(f"{s['role']}({s['name']})" for s in ens["slots"])

    user_msg = f"""Bài nhạc cần phối lại:
{describe_song(song)}

Yêu cầu:
- Cảm xúc mục tiêu: {emotion} — {emo_desc}
- Biên chế: {ensemble} — {ens['description']}. Slot khả dụng: {slot_desc}
- Ghi chú thêm từ người dùng: {notes or '(không có)'}

Hãy trả về kế hoạch phối khí theo đúng schema JSON."""

    response = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        thinking={"type": "adaptive"},
        output_config={"format": {"type": "json_schema", "schema": PLAN_SCHEMA}},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    if response.stop_reason == "refusal":
        raise RuntimeError("LLM từ chối yêu cầu (stop_reason=refusal)")

    text = "".join(b.text for b in response.content if b.type == "text")
    data = json.loads(text)
    plan = ArrangementPlan.from_dict(data)
    plan.emotion, plan.ensemble, plan.source = emotion, ensemble, "llm"

    # plan phải khả thi với biên chế đã chọn
    ens_roles = {s["role"] for s in ens["slots"]}
    if "drums" not in ens_roles:
        plan.add_drums = False
    if "pad" not in ens_roles:
        plan.add_pad = False
    return plan.sanitize()


def make_plan(song: Song, emotion: str, ensemble: str, notes: str = "",
              use_llm: str = "auto") -> ArrangementPlan:
    """use_llm: 'yes' | 'no' | 'auto' (auto = dùng LLM nếu có API key)."""
    want_llm = use_llm == "yes" or (use_llm == "auto" and os.environ.get("ANTHROPIC_API_KEY"))
    if want_llm:
        try:
            return plan_with_llm(song, emotion, ensemble, notes)
        except Exception as e:  # noqa: BLE001 — mọi lỗi LLM đều fallback được
            if use_llm == "yes":
                raise
            print(f"[planner] LLM không khả dụng ({e}); dùng rule-based.", file=sys.stderr)
    return plan_with_rules(song, emotion, ensemble)
