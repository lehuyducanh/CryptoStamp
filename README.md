# ◈ VecMotion Studio

Ứng dụng web tạo **motion / hoạt hình 2D** chạy hoàn toàn trên trình duyệt,
**không cần cài dependency**:

**AI tạo ảnh → Vector hóa → Rig (FK) → Keyframe animation → Xuất SVG động**

## Chạy

```bash
python3 -m http.server 8000
# hoặc: npx serve
```

Mở http://localhost:8000 (cần chạy qua server vì app dùng ES modules).

```bash
node tests/run.js   # unit tests cho core thuần (mat, anim, quantize, trace, state…)
```

## Quy trình làm hoạt hình

1. **Tạo element** (panel trái):
   - Chọn nguồn AI: *Pollinations* (miễn phí), *OpenAI DALL·E 3* (nhập API key,
     lưu trong localStorage), hoặc *Demo offline* (vẽ thủ tục — luôn chạy được,
     thử prompt chứa "robot", "tên lửa", "cây/hoa").
   - Hoặc kéo-thả / tải ảnh của bạn lên Thư viện.
2. **Vector hóa**: bấm **✦ Vector** trên asset → chỉnh số màu, chi tiết, xóa
   nền → *Tách mảnh* để mỗi vùng màu thành một node riêng → Thêm vào canvas.
3. **Rig** (kiểu cutout FK):
   - **🦴 Auto-rig**: với nhân vật flat đứng thẳng, tick "Auto-rig nhân vật"
     ngay trong hộp thoại vector hóa (hoặc nút 🦴 trong Thuộc tính khi chọn
     group mảnh) — hệ thống tách từng khối liền, tự nhóm **Đầu / Thân /
     Tay trái / Tay phải / Chân trái / Chân phải**, đặt pivot tại khớp
     (cổ, vai, hông) và dựng cây FK với Thân là gốc. Đây là rig template
     theo heuristic vị trí (neo theo mảnh thân lớn nhất) — nhân vật tư thế
     lạ có thể cần chỉnh lại vài mảnh bằng kéo-thả trong panel Lớp.
   - Rig thủ công: chọn nhiều mảnh (Shift+click) → **Ctrl+G** nhóm thành bộ
     phận; **🎯 Click đặt tâm** để đặt pivot tại khớp; kéo node thả **vào
     giữa** một nhóm trong panel Lớp để parent (con xoay theo cha).
   - ⚠️ Nên rig xong rồi mới animate (reparent không bảo toàn transform thế giới).
4. **Animate**:
   - Bật **● Ghi key** (auto-key) rồi kéo/xoay đối tượng ở các frame khác nhau,
     hoặc bấm nút **◆** cạnh từng thuộc tính trong Thuộc tính.
   - **Morph hình dạng**: chọn node vector → công cụ **✎ Sửa điểm (A)** → kéo
     các đỉnh path. Với ● Ghi key bật, mỗi lần kéo tự ghi keyframe "Hình dạng";
     hình sẽ biến dạng mượt giữa các pose (nội suy từng đỉnh, cùng topology).
   - **Rộng/Cao** của hình chữ nhật/elip/ảnh cũng keyframe được (◆ trong
     Thuộc tính) — phóng to thu nhỏ theo kích thước thật.
   - Kéo keyframe trên timeline để đổi thời điểm; chọn key rồi đổi **Easing**.
   - Space phát/dừng; kéo thước thời gian để tua.
5. **Xuất**:
   - **⬇ Video** → **WebM** (quay theo thời gian thực, dùng ngay) hoặc **chuỗi
     PNG .zip** (frame-chính-xác, chất lượng cao nhất, ghép bằng ffmpeg).
   - **⬇ SVG động** (CSS keyframes nhúng) — dành cho clip ngắn / loop ≤ 60s.
   - **SVG** khung tĩnh, hoặc **Lưu** JSON dự án.

Dự án tự động lưu vào localStorage của trình duyệt.

## Làm video dài (ví dụ 5 phút)

Đặt **Dài (s) = 300** là chạy được ngay (timeline có thanh **Zoom** để điều
hướng 9.000 frame), nhưng quy trình khuyến nghị — giống studio thật — là
**chia phim thành cảnh**:

1. Mỗi cảnh 5–30 giây làm trong một file dự án riêng (**Lưu** / **Mở** JSON);
   asset vector tái sử dụng bằng cách lưu kèm trong từng file dự án.
2. Xuất từng cảnh:
   - Nhanh: **⬇ Video → WebM** (phim 30s ≈ chờ 30s vì quay realtime).
   - Chất lượng cao: **⬇ Video → PNG .zip** (tối đa ~30s/lần; phim dài hơn thì
     xuất theo từng khoảng "từ giây … đến giây").
3. Ghép các cảnh + nhạc bằng ffmpeg (hoặc CapCut/Premiere/DaVinci):

```bash
# PNG sequence → video từng cảnh
unzip frames_0s-30s.zip -d canh1
ffmpeg -framerate 30 -i canh1/frame_%04d.png -c:v libx264 -pix_fmt yuv420p canh1.mp4

# Nối các cảnh thành phim 5 phút
printf "file 'canh1.mp4'\nfile 'canh2.mp4'\nfile 'canh3.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy phim.mp4

# Thêm nhạc nền
ffmpeg -i phim.mp4 -i nhac.mp3 -c:v copy -c:a aac -shortest phim-final.mp4
```

Vì sao không xuất SVG động cho phim dài? File sẽ phình theo số frame lấy mẫu
(5 phút ≈ hàng chục MB) và không đưa vào phần mềm dựng phim được — SVG động
chỉ hợp banner/loop ngắn. WebM/PNG là định dạng đúng cho phim.

## CLI cho AI agent (headless)

Toàn bộ hệ thống dùng được **không cần trình duyệt** qua `bin/vecmotion.mjs` —
thiết kế cho AI agent: input/output đều là JSON.

```bash
vecmotion new -o p.json --duration 5          # tạo project
vecmotion edit p.json --ops ops.json          # dựng scene + keyframe (kể cả morph)
vecmotion vectorize img.png --add p.json --split   # PNG → vector, headless
vecmotion info p.json                         # đọc cấu trúc
vecmotion render p.json -o frames/ --format png    # render (PNG cần Chromium)
vecmotion render p.json --animated-svg -o anim.svg
```

Schema ops (addShape, key, **poseKey** morph, parent/rig, setPivot…) và ví dụ
trọn vẹn: xem **`docs/CLI.md`**.

## Phím tắt

| Phím | Chức năng |
|---|---|
| V / R / E | Chọn / vẽ Chữ nhật / vẽ Elip |
| A | ✎ Sửa điểm hình dạng (morph) |
| Space | Phát / dừng |
| Ctrl+Z / Ctrl+Shift+Z | Hoàn tác / làm lại |
| Ctrl+G | Nhóm | 
| Ctrl+D | Nhân bản |
| Delete | Xóa key đang chọn, hoặc đối tượng đang chọn |
| Mũi tên (+Shift) | Dịch 1px (10px) |
| Shift khi xoay | Bám bước 15° |
| Ctrl+lăn chuột | Zoom canvas |

## Kiến trúc

- **Vanilla ES modules + SVG**, không build step. `docs/PLAN.md` có kế hoạch
  chi tiết và phần phản biện thiết kế.
- `src/core/` — ma trận 2D (transform có pivot), easing/nội suy, store +
  undo/redo + scene graph + tracks, sinh markup SVG, player.
- `src/vector/` — vector hóa tự viết: median-cut → dò contour theo cạnh pixel
  (lỗ xử lý bằng `fill-rule: evenodd`) → RDP → Catmull-Rom→Bézier.
- `src/ai/` — provider AI (Pollinations / OpenAI / Demo offline).
- `src/ui/` — canvas, layers, inspector, timeline, panel AI, toolbar.
- `src/export/` — JSON, SVG tĩnh, SVG động (lấy mẫu mỗi frame, nén run-length,
  nhúng CSS `@keyframes`).

## Giới hạn đã biết & Roadmap

- Vector hóa hợp nhất với ảnh **flat/AI-style**; ảnh chụp thật sẽ ra rất nhiều
  mảnh (bật gợi ý "flat vector" khi tạo ảnh).
- Rig là **FK thuần** (chưa có IK, chưa có mesh deformation).
- Morph yêu cầu **cùng topology** giữa các pose (cùng số path, cùng chuỗi lệnh
  M/L/C/Z) — sửa bằng ✎ luôn thỏa; pose từ CLI được validate.
- Morph trong SVG động xuất bằng SMIL (nội suy linear giữa các key); render
  Video/PNG thì đầy đủ easing.
- Roadmap: IK 2 khớp, onion skin, xuất Lottie/WebM, curve editor, thêm/xóa
  đỉnh khi morph (re-topology).
