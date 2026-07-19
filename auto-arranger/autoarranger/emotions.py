"""Preset cảm xúc — dùng cho rule-based planner và làm ngữ cảnh cho LLM."""

EMOTIONS = {
    "melancholic": dict(
        description="Buồn man mác, chậm rãi, giọng thứ, âm lượng nhỏ, legato, nhiều vang",
        tempo_factor=0.75, target_mode="minor", velocity_factor=0.7,
        duration_factor=1.25, humanize_timing=0.03, humanize_velocity=0.15,
        reverb=0.55, add_bass=True, add_pad=True, add_arpeggio=False,
        add_drums=False, drum_style="none", octave_double_melody=False,
    ),
    "joyful": dict(
        description="Vui tươi, nhanh, giọng trưởng, gọn tiếng, có nhịp điệu",
        tempo_factor=1.12, target_mode="major", velocity_factor=1.05,
        duration_factor=0.85, humanize_timing=0.01, humanize_velocity=0.08,
        reverb=0.2, add_bass=True, add_pad=False, add_arpeggio=True,
        add_drums=True, drum_style="soft", octave_double_melody=False,
    ),
    "epic": dict(
        description="Hùng tráng, mạnh mẽ, dày tiếng, trống lớn, giai điệu nhân đôi quãng tám",
        tempo_factor=0.9, target_mode="keep", velocity_factor=1.25,
        duration_factor=1.1, humanize_timing=0.01, humanize_velocity=0.1,
        reverb=0.6, add_bass=True, add_pad=True, add_arpeggio=False,
        add_drums=True, drum_style="epic", octave_double_melody=True,
    ),
    "dreamy": dict(
        description="Mơ màng, lãng đãng, chậm, pad dài, arpeggio lấp lánh, rất nhiều vang",
        tempo_factor=0.78, target_mode="keep", velocity_factor=0.6,
        duration_factor=1.5, humanize_timing=0.04, humanize_velocity=0.18,
        reverb=0.75, add_bass=False, add_pad=True, add_arpeggio=True,
        add_drums=False, drum_style="none", octave_double_melody=False,
    ),
    "tense": dict(
        description="Căng thẳng, dồn dập, giọng thứ, staccato, bass đập đều",
        tempo_factor=1.06, target_mode="minor", velocity_factor=1.1,
        duration_factor=0.6, humanize_timing=0.005, humanize_velocity=0.12,
        reverb=0.35, add_bass=True, add_pad=False, add_arpeggio=False,
        add_drums=True, drum_style="rock", octave_double_melody=False,
    ),
    "peaceful": dict(
        description="Bình yên, êm dịu, chậm vừa, giọng trưởng, mềm mại",
        tempo_factor=0.85, target_mode="major", velocity_factor=0.6,
        duration_factor=1.3, humanize_timing=0.025, humanize_velocity=0.12,
        reverb=0.45, add_bass=True, add_pad=True, add_arpeggio=False,
        add_drums=False, drum_style="none", octave_double_melody=False,
    ),
    "lofi_chill": dict(
        description="Lo-fi chill, thư giãn, tempo chậm vừa, trống lofi, tiếng mềm",
        tempo_factor=0.82, target_mode="keep", velocity_factor=0.75,
        duration_factor=1.05, humanize_timing=0.035, humanize_velocity=0.2,
        reverb=0.4, add_bass=True, add_pad=True, add_arpeggio=False,
        add_drums=True, drum_style="lofi", octave_double_melody=False,
    ),
}
