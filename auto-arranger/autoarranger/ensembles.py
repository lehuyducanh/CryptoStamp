"""Biên chế nhạc cụ (ensemble) — mỗi slot có vai trò + GM program + âm vực."""

# Mỗi slot: role, program (GM 0-127), tên, dịch quãng tám mặc định, pan (-1..1),
# khoảng âm vực hợp lý (lo, hi) để arranger tự dịch quãng tám cho vừa.
ENSEMBLES = {
    "piano_solo": dict(
        description="Piano độc tấu",
        slots=[
            dict(role="melody", program=0, name="Piano RH", octave=0, pan=0.1, range=(55, 96)),
            dict(role="harmony", program=0, name="Piano LH", octave=0, pan=-0.1, range=(43, 76)),
            dict(role="bass", program=0, name="Piano Bass", octave=0, pan=0.0, range=(28, 55)),
        ],
    ),
    "string_quartet": dict(
        description="Tứ tấu đàn dây: 2 violin, viola, cello",
        slots=[
            dict(role="melody", program=40, name="Violin I", octave=0, pan=-0.4, range=(55, 100)),
            dict(role="harmony", program=40, name="Violin II", octave=0, pan=-0.15, range=(55, 91)),
            dict(role="harmony2", program=41, name="Viola", octave=0, pan=0.2, range=(48, 79)),
            dict(role="bass", program=42, name="Cello", octave=0, pan=0.45, range=(36, 67)),
            dict(role="pad", program=48, name="Strings Pad", octave=0, pan=0.0, range=(48, 84)),
        ],
    ),
    "orchestra": dict(
        description="Dàn nhạc: dây, kèn đồng, sáo, timpani",
        slots=[
            dict(role="melody", program=73, name="Flute", octave=12, pan=-0.2, range=(60, 96)),
            dict(role="harmony", program=48, name="Strings", octave=0, pan=-0.4, range=(48, 88)),
            dict(role="harmony2", program=60, name="French Horn", octave=0, pan=0.35, range=(41, 72)),
            dict(role="bass", program=43, name="Contrabass", octave=-12, pan=0.15, range=(28, 55)),
            dict(role="pad", program=52, name="Choir", octave=0, pan=0.0, range=(48, 84)),
            dict(role="drums", program=0, name="Percussion", octave=0, pan=0.0, range=(0, 127)),
        ],
    ),
    "jazz_trio": dict(
        description="Jazz trio: piano, contrabass, trống",
        slots=[
            dict(role="melody", program=0, name="Piano", octave=0, pan=-0.15, range=(55, 96)),
            dict(role="harmony", program=0, name="Piano Comp", octave=0, pan=-0.15, range=(48, 79)),
            dict(role="bass", program=32, name="Upright Bass", octave=0, pan=0.3, range=(28, 52)),
            dict(role="drums", program=0, name="Drums", octave=0, pan=0.1, range=(0, 127)),
        ],
    ),
    "lofi_band": dict(
        description="Lo-fi: electric piano, pad, bass, trống lofi",
        slots=[
            dict(role="melody", program=4, name="E.Piano", octave=0, pan=-0.1, range=(55, 91)),
            dict(role="harmony", program=4, name="E.Piano Chords", octave=0, pan=0.15, range=(48, 79)),
            dict(role="bass", program=33, name="Fingered Bass", octave=0, pan=0.0, range=(28, 52)),
            dict(role="pad", program=89, name="Warm Pad", octave=0, pan=0.0, range=(48, 79)),
            dict(role="drums", program=0, name="Lofi Kit", octave=0, pan=0.0, range=(0, 127)),
        ],
    ),
    "guitar_duo": dict(
        description="Song tấu guitar: nylon + steel",
        slots=[
            dict(role="melody", program=24, name="Nylon Guitar", octave=0, pan=-0.3, range=(52, 88)),
            dict(role="harmony", program=25, name="Steel Guitar", octave=0, pan=0.3, range=(45, 79)),
            dict(role="bass", program=32, name="Acoustic Bass", octave=0, pan=0.0, range=(28, 52)),
        ],
    ),
    "music_box": dict(
        description="Hộp nhạc: celesta/music box + pad mỏng",
        slots=[
            dict(role="melody", program=10, name="Music Box", octave=12, pan=0.0, range=(67, 103)),
            dict(role="harmony", program=8, name="Celesta", octave=12, pan=-0.2, range=(60, 96)),
            dict(role="pad", program=91, name="Halo Pad", octave=0, pan=0.2, range=(48, 79)),
        ],
    ),
    "chiptune": dict(
        description="8-bit chiptune: sóng vuông, sóng răng cưa, trống noise",
        slots=[
            dict(role="melody", program=80, name="Square Lead", octave=0, pan=-0.15, range=(60, 96)),
            dict(role="harmony", program=81, name="Saw Harmony", octave=0, pan=0.15, range=(52, 88)),
            dict(role="bass", program=87, name="Chip Bass", octave=0, pan=0.0, range=(33, 57)),
            dict(role="drums", program=0, name="Noise Kit", octave=0, pan=0.0, range=(0, 127)),
        ],
    ),
}
