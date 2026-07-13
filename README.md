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
   - Chọn nhiều mảnh (Shift+click) → **Ctrl+G** nhóm thành bộ phận (tay, đầu…).
   - Trong Thuộc tính → **🎯 Click đặt tâm** để đặt pivot tại khớp.
   - Kéo node thả **vào giữa** một nhóm trong panel Lớp để parent (con xoay theo cha).
   - ⚠️ Nên rig xong rồi mới animate (reparent không bảo toàn transform thế giới).
4. **Animate**:
   - Bật **● Ghi key** (auto-key) rồi kéo/xoay đối tượng ở các frame khác nhau,
     hoặc bấm nút **◆** cạnh từng thuộc tính trong Thuộc tính.
   - Kéo keyframe trên timeline để đổi thời điểm; chọn key rồi đổi **Easing**.
   - Space phát/dừng; kéo thước thời gian để tua.
5. **Xuất**: **⬇ SVG động** (CSS keyframes nhúng — mở bằng mọi trình duyệt,
   nhúng được vào web), **SVG** khung tĩnh, hoặc **Lưu** JSON dự án.

Dự án tự động lưu vào localStorage của trình duyệt.

## Phím tắt

| Phím | Chức năng |
|---|---|
| V / R / E | Chọn / vẽ Chữ nhật / vẽ Elip |
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
- Animate được transform + opacity (chưa morph path).
- Roadmap: IK 2 khớp, onion skin, xuất Lottie/WebM, curve editor.
