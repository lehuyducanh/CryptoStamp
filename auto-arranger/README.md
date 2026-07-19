# 🎼 AutoArranger — Hệ thống tự động phối khí bằng LLM + AI API

Nhập một bản nhạc (MIDI) → hệ thống **tự lên kế hoạch phối khí bằng Claude (LLM)**
→ biến đổi bản nhạc theo **cảm xúc** và **biên chế nhạc cụ** mong muốn → xuất
**sản phẩm hoàn chỉnh**: MIDI đã phối, audio WAV/MP3, kế hoạch phối (`plan.json`)
và báo cáo (`report.md`).

Cùng một bài nhạc có thể tạo hàng loạt bản phối khác nhau chỉ bằng 1 lệnh:
buồn với tứ tấu dây, vui với piano, hùng tráng với dàn nhạc, lo-fi chill, 8-bit…

## Kiến trúc

```
MIDI gốc
   │
   ▼
[1] midi_io ─ phân tích: giọng (major/minor), tempo, vai trò track (melody/bass/harmony)
   │
   ▼
[2] planner ─ LLM (Claude API, structured outputs) hoặc rule-based preset
   │            → ArrangementPlan: tempo_factor, target_mode, transpose, dynamics,
   │              articulation, texture (bass/pad/arpeggio/drums), reverb, style_prompt
   ▼
[3] arranger ─ áp plan: đổi mode trưởng↔thứ, đổi nhạc cụ theo ensemble, humanize,
   │            sinh thêm bè bass / pad / arpeggio / trống theo hợp âm ước lượng
   ▼
[4] render ─ FluidSynth + soundfont (nếu có) hoặc synthesizer numpy nội bộ
   │          → WAV; có ffmpeg thì xuất thêm MP3
   ▼
output/<bài>__<cảm_xúc>__<biên_chế>/  ── .mid  .wav  (.mp3)  plan.json  report.md
```

- **Không có API key vẫn chạy được** (planner fallback rule-based, synth nội bộ
  không cần phần mềm ngoài).
- **Có `ANTHROPIC_API_KEY`**: Claude phân tích bài nhạc và tự quyết định tham số
  phối khí + viết `style_prompt` (dùng tiếp cho text-to-music AI) + giải thích lý do.

## Cài đặt

```bash
cd auto-arranger
pip install -r requirements.txt        # mido, numpy (+ anthropic nếu dùng LLM)

# Tùy chọn, nâng chất lượng:
# sudo apt install fluidsynth fluid-soundfont-gm   # render bằng soundfont thật
# sudo apt install ffmpeg                          # xuất MP3
```

## Dùng nhanh

```bash
# Xem danh sách cảm xúc / biên chế / bản mẫu
python3 -m autoarranger list

# Demo: Ode to Joy (public domain) × 3 cảm xúc, tứ tấu dây
python3 -m autoarranger demo

# Phối 1 bản từ MIDI của bạn
python3 -m autoarranger arrange --input song.mid --emotion melancholic --ensemble string_quartet

# Một bài → nhiều bản phối cùng lúc (cảm xúc × biên chế)
python3 -m autoarranger batch --input song.mid \
    --emotions melancholic,joyful,epic,lofi_chill \
    --ensembles string_quartet,lofi_band,orchestra --mp3

# Bật LLM planner (cần ANTHROPIC_API_KEY; 'auto' tự bật khi có key)
export ANTHROPIC_API_KEY=sk-ant-...
python3 -m autoarranger arrange --example greensleeves --emotion dreamy \
    --ensemble music_box --use-llm yes --notes "nhấn mạnh cảm giác hoài niệm tuổi thơ"
```

Cảm xúc có sẵn: `melancholic, joyful, epic, dreamy, tense, peaceful, lofi_chill`
Biên chế có sẵn: `piano_solo, string_quartet, orchestra, jazz_trio, lofi_band, guitar_duo, music_box, chiptune`
(thêm mới chỉ cần sửa `emotions.py` / `ensembles.py` — planner và arranger tự nhận).

## LLM planner hoạt động thế nào

`planner.py` gửi cho Claude (model `claude-opus-4-8`, adaptive thinking):

1. **Bản phân tích bài nhạc**: giọng ước lượng (thuật toán Krumhansl-Schmuckler),
   tempo, danh sách track kèm vai trò và âm vực;
2. **Yêu cầu**: cảm xúc mục tiêu, biên chế + slot khả dụng, ghi chú của bạn;
3. **Schema JSON** (structured outputs) — nên output luôn parse được, không cần regex.

Kết quả là `ArrangementPlan` — mọi giá trị đều được `sanitize()` ép về khoảng an
toàn trước khi dùng, nên LLM "sáng tạo quá tay" cũng không phá bản phối. Mọi lỗi
LLM (hết quota, mất mạng…) đều tự fallback về preset rule-based ở chế độ `auto`.

## Mở rộng với AI text-to-music (tùy chọn)

Plan luôn kèm `style_prompt` (tiếng Anh). Có thể đưa vào các API sinh nhạc:

```python
from autoarranger.generators import get_generator

gen = get_generator("musicgen")          # cần REPLICATE_API_TOKEN
gen.generate(prompt=plan.style_prompt, duration_s=30, out_path="ai_version.wav")
```

- `musicgen`: MusicGen (Meta) qua Replicate — hoạt động ngay khi có token.
- `suno`: khung sườn adapter, điền endpoint khi bạn có quyền truy cập API.

## Test

```bash
python3 tests/run_tests.py   # end-to-end offline: 4 bản phối, kiểm tra mode/tempo/WAV
```

## ⚠️ Lưu ý bản quyền

"Bản nhạc nổi tiếng" đa số **vẫn còn bản quyền**. Tạo bản phối (derivative work /
arrangement) và phát hành cần giấy phép từ chủ sở hữu tác phẩm (với cover phát
hành trên nền tảng nhạc số thường là mechanical license, ví dụ qua các dịch vụ
như DistroKid/TuneCore ở một số thị trường; phối lại đăng video còn cần
synchronization license). An toàn nhất:

- Dùng tác phẩm **public domain** (nhạc cổ điển: Beethoven, Bach, dân ca cổ…) —
  hai bản mẫu kèm theo (`ode_to_joy`, `greensleeves`) thuộc nhóm này;
- Hoặc nhạc của chính bạn / nhạc đã mua bản quyền phối lại;
- Với text-to-music AI: tránh prompt nêu tên bài hát/nghệ sĩ đang có bản quyền.

## Cấu trúc mã nguồn

```
autoarranger/
  models.py      # Note/Track/Song + ArrangementPlan (dataclass, sanitize)
  midi_io.py     # đọc/ghi MIDI (mido), ước lượng giọng, gán vai trò track
  emotions.py    # preset 7 cảm xúc (rule-based + ngữ cảnh cho LLM)
  ensembles.py   # 8 biên chế nhạc cụ (GM program, âm vực, pan)
  planner.py     # Claude API planner (structured outputs) + fallback
  arranger.py    # engine biến đổi + sinh bè bass/pad/arpeggio/drums
  synth.py       # synthesizer numpy: 6 họ âm sắc + trống + reverb
  render.py      # FluidSynth (nếu có) / synth nội bộ; ffmpeg -> MP3
  pipeline.py    # orchestrator, xuất plan.json + report.md
  cli.py         # lệnh arrange / batch / demo / list
  examples.py    # sinh MIDI mẫu public-domain
  generators/    # adapter MusicGen (Replicate), Suno (khung sườn)
```
