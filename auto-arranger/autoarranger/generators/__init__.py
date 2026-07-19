"""Adapter tùy chọn cho các AI text-to-music API (MusicGen/Replicate, Suno...).

Đây là nhánh mở rộng: pipeline chính (MIDI -> synth) chạy hoàn toàn offline;
các adapter này dùng plan.style_prompt để sinh thêm biến thể audio bằng AI.
"""

from .base import AudioGenerator, get_generator

__all__ = ["AudioGenerator", "get_generator"]
