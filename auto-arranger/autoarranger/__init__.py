"""AutoArranger — hệ thống tự động phối khí nhạc bằng LLM + xử lý MIDI/audio.

Pipeline: MIDI gốc -> phân tích -> LLM lên ArrangementPlan -> biến đổi MIDI
(nhạc cụ, tempo, mode, dynamics, texture) -> render audio (WAV/MP3).
"""

__version__ = "0.1.0"
