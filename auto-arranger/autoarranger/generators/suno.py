"""Suno adapter — khung sườn (Suno chưa có API công khai chính thức ổn định).

Khi bạn có quyền truy cập API (hoặc dịch vụ trung gian), điền endpoint vào đây;
giao diện generate() giữ nguyên nên pipeline không cần đổi.
"""

from __future__ import annotations

from .base import AudioGenerator


class SunoGenerator(AudioGenerator):
    name = "suno"

    def generate(self, prompt: str, duration_s: int, out_path: str) -> str:
        raise NotImplementedError(
            "Suno chưa có public API chính thức. Điền endpoint của bạn vào "
            "autoarranger/generators/suno.py, hoặc dùng generator 'musicgen'."
        )
