"""Test end-to-end offline (không cần API key): chạy `python tests/run_tests.py`."""

from __future__ import annotations

import os
import sys
import tempfile
import wave

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from autoarranger.examples import write_example  # noqa: E402
from autoarranger.midi_io import load_midi  # noqa: E402
from autoarranger.pipeline import arrange_batch  # noqa: E402


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        midi = write_example("ode_to_joy", tmp)
        song = load_midi(midi)
        assert song.key_mode == "major", f"key gốc phải major, được {song.key_mode}"
        assert any(t.role == "melody" for t in song.tracks), "phải nhận ra melody"

        results = arrange_batch(
            input_midi=midi, song=None,
            emotions=["melancholic", "joyful"],
            ensembles=["string_quartet", "chiptune"],
            out_dir=tmp, use_llm="no",
        )
        assert len(results) == 4

        for r in results:
            for key in ("plan", "midi", "wav", "report"):
                assert os.path.exists(r[key]), f"thiếu {key}: {r[key]}"
            with wave.open(r["wav"]) as f:
                assert f.getnframes() > 44100, "WAV quá ngắn"
                frames = f.readframes(min(f.getnframes(), 44100 * 5))
                assert max(frames) > 0, "WAV im lặng hoàn toàn"

        # bản melancholic phải chậm hơn và chuyển thứ; joyful giữ trưởng
        mel = load_midi([r for r in results
                         if "melancholic__string_quartet" in r["job"]][0]["midi"])
        joy = load_midi([r for r in results
                         if "joyful__string_quartet" in r["job"]][0]["midi"])
        assert mel.tempo_bpm < joy.tempo_bpm, "melancholic phải chậm hơn joyful"
        assert mel.key_mode == "minor", f"melancholic phải minor, được {mel.key_mode}"

    print("OK — tất cả test end-to-end đã qua.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
