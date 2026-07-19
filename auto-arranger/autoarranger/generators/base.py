from __future__ import annotations

from abc import ABC, abstractmethod


class AudioGenerator(ABC):
    """Giao diện chung: sinh audio từ mô tả văn bản (style_prompt của plan)."""

    name: str = "base"

    @abstractmethod
    def generate(self, prompt: str, duration_s: int, out_path: str) -> str:
        """Sinh audio, ghi ra out_path, trả về đường dẫn file."""


def get_generator(name: str) -> AudioGenerator:
    if name == "musicgen":
        from .musicgen import MusicGenReplicate
        return MusicGenReplicate()
    if name == "suno":
        from .suno import SunoGenerator
        return SunoGenerator()
    raise KeyError(f"Không có generator '{name}' (chọn: musicgen, suno)")
