"""Đọc/ghi MIDI (mido) + phân tích: key, vai trò track."""

from __future__ import annotations

import mido

from .models import Note, Song, Track

# Krumhansl-Kessler key profiles
_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def _correlate(hist: list[float], profile: list[float]) -> float:
    n = 12
    mh = sum(hist) / n
    mp = sum(profile) / n
    num = sum((hist[i] - mh) * (profile[i] - mp) for i in range(n))
    dh = sum((hist[i] - mh) ** 2 for i in range(n)) ** 0.5
    dp = sum((profile[i] - mp) ** 2 for i in range(n)) ** 0.5
    return num / (dh * dp) if dh > 0 and dp > 0 else 0.0


def estimate_key(song: Song) -> tuple[int, str]:
    hist = [0.0] * 12
    for tr in song.tracks:
        if tr.is_drum:
            continue
        for n in tr.notes:
            hist[n.pitch % 12] += n.dur
    if sum(hist) == 0:
        return 0, "major"
    best = (0, "major", -2.0)
    for tonic in range(12):
        rot = hist[tonic:] + hist[:tonic]
        for mode, prof in (("major", _MAJOR), ("minor", _MINOR)):
            c = _correlate(rot, prof)
            if c > best[2]:
                best = (tonic, mode, c)
    return best[0], best[1]


def assign_roles(song: Song) -> None:
    """Gán vai trò melody / bass / harmony cho các track theo âm vực & mật độ nốt."""
    tracks = song.melodic_tracks()
    if not tracks:
        return
    for t in song.tracks:
        if t.is_drum:
            t.role = "drums"
    # melody: điểm = cao độ trung bình + mật độ nốt
    def melody_score(t: Track):
        avg, cnt = t.pitch_stats()
        return avg + min(cnt, 200) * 0.05

    melody = max(tracks, key=melody_score)
    melody.role = "melody"
    rest = [t for t in tracks if t is not melody]
    if rest:
        bass = min(rest, key=lambda t: t.pitch_stats()[0])
        avg_b, _ = bass.pitch_stats()
        if avg_b < 55:
            bass.role = "bass"
            rest = [t for t in rest if t is not bass]
    for t in rest:
        t.role = "harmony"


def load_midi(path: str) -> Song:
    mid = mido.MidiFile(path)
    tpb = mid.ticks_per_beat or 480
    tempo_bpm = 120.0
    tempo_found = False

    tracks: list[Track] = []
    for i, mtrack in enumerate(mid.tracks):
        abs_tick = 0
        name = mtrack.name or f"Track {i}"
        program_by_channel: dict[int, int] = {}
        open_notes: dict[tuple[int, int], tuple[int, int]] = {}  # (ch,pitch) -> (start_tick, vel)
        notes_by_channel: dict[int, list[Note]] = {}

        for msg in mtrack:
            abs_tick += msg.time
            if msg.type == "set_tempo" and not tempo_found:
                tempo_bpm = mido.tempo2bpm(msg.tempo)
                tempo_found = True
            elif msg.type == "program_change":
                program_by_channel.setdefault(msg.channel, msg.program)
            elif msg.type == "note_on" and msg.velocity > 0:
                open_notes[(msg.channel, msg.note)] = (abs_tick, msg.velocity)
            elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
                key = (msg.channel, msg.note)
                if key in open_notes:
                    start_tick, vel = open_notes.pop(key)
                    dur = max(abs_tick - start_tick, 1)
                    notes_by_channel.setdefault(msg.channel, []).append(
                        Note(start=start_tick / tpb, dur=dur / tpb, pitch=msg.note, vel=vel)
                    )

        for ch, notes in notes_by_channel.items():
            notes.sort(key=lambda n: n.start)
            tracks.append(Track(
                name=name if len(notes_by_channel) == 1 else f"{name} ch{ch}",
                program=program_by_channel.get(ch, 0),
                is_drum=(ch == 9),
                notes=notes,
            ))

    total = 0.0
    for t in tracks:
        for n in t.notes:
            total = max(total, n.start + n.dur)

    song = Song(tempo_bpm=tempo_bpm, tracks=tracks, total_beats=total, name=path)
    song.key_tonic, song.key_mode = estimate_key(song)
    assign_roles(song)
    return song


def save_midi(song: Song, path: str, ticks_per_beat: int = 480) -> None:
    mid = mido.MidiFile(ticks_per_beat=ticks_per_beat)

    # track 0: tempo
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(song.tempo_bpm), time=0))
    mid.tracks.append(meta)

    # phân kênh: drums luôn kênh 9, còn lại 0..8,10..15
    free_channels = [c for c in range(16) if c != 9]
    ch_idx = 0
    for tr in song.tracks:
        if not tr.notes:
            continue
        if tr.is_drum:
            channel = 9
        else:
            channel = free_channels[ch_idx % len(free_channels)]
            ch_idx += 1

        events = []  # (tick, order, mido message w/o time)
        if not tr.is_drum:
            events.append((0, 0, mido.Message("program_change", channel=channel,
                                              program=int(tr.program) % 128)))
        for n in tr.notes:
            on_t = max(0, int(round(n.start * ticks_per_beat)))
            off_t = on_t + max(1, int(round(n.dur * ticks_per_beat)))
            vel = max(1, min(127, int(n.vel)))
            events.append((on_t, 1, mido.Message("note_on", channel=channel,
                                                 note=int(n.pitch), velocity=vel)))
            events.append((off_t, 0, mido.Message("note_off", channel=channel,
                                                  note=int(n.pitch), velocity=0)))
        events.sort(key=lambda e: (e[0], e[1]))

        mtrack = mido.MidiTrack()
        mtrack.append(mido.MetaMessage("track_name", name=tr.name[:60], time=0))
        prev = 0
        for tick, _, msg in events:
            msg.time = tick - prev
            prev = tick
            mtrack.append(msg)
        mid.tracks.append(mtrack)

    mid.save(path)
