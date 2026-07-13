# VecMotion Studio — Kế hoạch & Phản biện

## 1. Mục tiêu

Ứng dụng web tạo **motion / hoạt hình 2D** với quy trình:

1. Tạo element bằng **AI sinh ảnh** (hoặc tải ảnh lên).
2. **Vector hóa** ảnh raster thành SVG paths để tái sử dụng, chỉnh màu, tách mảnh.
3. **Rig** nhân vật: nhóm bộ phận, đặt tâm xoay (pivot) tại khớp, parent-child (FK).
4. **Animate** bằng timeline keyframe (vị trí, xoay, tỉ lệ, độ mờ) với easing.
5. **Xuất**: JSON dự án, SVG tĩnh, SVG động (CSS keyframes nhúng).

## 2. Kiến trúc

- **Vanilla JS (ES modules) + SVG**, không build step, không dependency runtime.
  Chạy bằng bất kỳ static server nào (`python3 -m http.server`).
- Bố cục: topbar (công cụ/xuất) · trái (AI + thư viện) · giữa (canvas SVG) ·
  phải (Lớp + Thuộc tính) · dưới (Timeline).

```
src/
  core/   mat.js (ma trận 2D), anim.js (easing, evalTrack), state.js (store,
          undo/redo, scene graph, tracks), markup.js (SVG markup), player.js
  vector/ quantize.js (median-cut), trace.js (contour), simplify.js (RDP +
          Catmull-Rom), vectorize.js (pipeline)
  ai/     providers.js (pollinations / openai / mock offline)
  ui/     canvas.js, layers.js, inspector.js, timeline.js, aipanel.js,
          toolbar.js, dom.js
  export/ exporters.js (JSON, SVG, SVG động)
```

### Data model

```js
project = { name, width, height, fps, durFrames, background, idc,
            nodes: Node[], tracks: Track[], assets: Asset[] }
Node    = { id, name, type: 'group'|'shape'|'vector'|'image',
            x, y, rotation, scaleX, scaleY, opacity, pivotX, pivotY, visible,
            children? | paths?[{d, fill, bbox}] | href,w,h | shape,w,h,fill }
Track   = { id, nodeId, prop, keys: [{ t: frame, v, e: easing }] }
```

Transform mỗi node: `T(x,y)·T(pivot)·R·S·T(−pivot)` — pivot là tâm xoay/scale,
đổi pivot có bù trừ (x,y) để hình không nhảy.

### Vector hóa (tự viết, thuần JS)

1. Thu nhỏ ảnh về ≤ 384px, đọc ImageData.
2. **Median-cut** lượng tử về N màu (2–16), pixel trong suốt = bỏ.
3. Mỗi màu: **pixel-edge contour tracing** (cạnh giữa pixel trong/ngoài, nối
   thành vòng kín; lỗ xử lý bằng `fill-rule: evenodd`).
4. **RDP** đơn giản hóa + tùy chọn làm mượt **Catmull-Rom → Bézier**.
5. Tùy chọn: xóa nền (màu chiếm đa số viền ảnh), bịt khe anti-alias
   (stroke = fill), lọc mảnh nhỏ, **tách mảnh** thành node con để rig.

### Rigging (FK)

Rig = cây node: nhóm mảnh thành bộ phận → pivot tại khớp → kéo-thả parent
trong panel Lớp → animate `rotation` của từng khớp. Auto-key hỗ trợ workflow
pose-to-pose.

### AI providers

| Provider | Key | Ghi chú |
|---|---|---|
| Demo (offline) | không | Vẽ thủ tục (robot/rocket/cây/sinh vật) — luôn chạy |
| Pollinations | không | Miễn phí, cần mạng + CORS |
| OpenAI (dall-e-3) | có | Key lưu localStorage, chỉ gọi trực tiếp từ trình duyệt |

## 3. Phản biện

- **Sao không React/Vite/Fabric.js?** Zero-dependency loại bỏ rủi ro cài đặt
  và giữ repo chạy được vĩnh viễn. Trả giá: code UI dài hơn. Ở quy mô ~4k
  dòng, chấp nhận được; nếu app lớn gấp 3, quyết định này nên xét lại.
- **SVG hay Canvas/WebGL?** App vector-native → SVG cho hit-testing, DOM
  events, xuất trực tiếp. Giới hạn: vài trăm node là chậm — đủ cho hoạt hình
  nhân vật, không nhắm tới particle.
- **Tracer tự viết vs potrace/imagetracer?** Kém hơn về fit đường cong,
  nhưng không dependency, kiểm soát được (tách mảnh, bbox từng path). Ảnh
  flat/AI-style ra đẹp; ảnh chụp ra nhiều mảnh — giới hạn ghi rõ, UI có gợi ý
  prompt "flat vector".
- **Chỉ FK, không IK/mesh?** IK và mesh deform (Live2D-style) vượt phạm vi;
  FK + pivot đáp ứng 80% hoạt hình cắt giấy (cutout). Roadmap.
- **AI fail thì sao?** Provider offline + upload ảnh là đường sống bắt buộc;
  lỗi mạng/key chỉ hiện toast, không chặn workflow.
- **Xuất SVG động lấy mẫu dày (mỗi frame) làm file to?** Đúng, nhưng đúng
  tuyệt đối với mọi easing/pivot; có nén run-length các frame tĩnh. Đổi lấy
  file mở được mọi nơi không cần runtime (khác Lottie cần player). Với phim
  dài (>60s) app cảnh báo và trỏ sang xuất Video.
- **Video dài (5 phút)?** Đã bổ sung: xuất **WebM** (MediaRecorder, quay theo
  thời gian thực — đánh đổi: 5 phút phim = 5 phút chờ, timestamp do đồng hồ
  thật nên không thể render nhanh hơn realtime với MediaRecorder) và **chuỗi
  PNG .zip** (frame-chính-xác, giới hạn ~900 frame/lần vì giữ trong RAM; ghép
  bằng ffmpeg). Timeline có zoom (0.2–20 px/frame) và thước chia vạch thích
  ứng nên 9.000 frame vẫn điều hướng tốt (đo: rebuild ~1ms). Quy trình khuyến
  nghị vẫn là chia cảnh 5–30s/file rồi ghép — WebCodecs + muxer để render
  nhanh-hơn-realtime nằm ở roadmap.
- **Animate được prop nào?** Chỉ transform + opacity. Path morphing là bài
  toán khác hẳn (tương ứng điểm) — roadmap, không nhồi vào v1.

## 4. Rủi ro còn lại

- CORS của Pollinations có thể đổi → đã có fallback.
- Reparent không bảo toàn world-transform → hướng dẫn "rig trước, animate
  sau" trong README.
- Undo dạng snapshot JSON — đơn giản, đúng; tốn RAM nếu asset ảnh lớn
  (giới hạn 80 bước).

## 4b. Nâng cấp v2: morph hình dạng + CLI cho agent

- **Morph**: track `morph` với giá trị = mảng tọa độ phẳng toàn bộ paths;
  nội suy từng đỉnh với easing, yêu cầu cùng topology (validate ở CLI, còn
  công cụ ✎ Sửa điểm trên UI không bao giờ đổi topology nên luôn hợp lệ).
  Điểm M và điểm cuối path kín được "hàn" (weld) khi kéo để không rách mối nối.
  Đánh đổi: không hỗ trợ thêm/xóa đỉnh giữa hai pose (re-topology là bài toán
  matching phức tạp — roadmap).
- **w/h keyframe**: kích thước shape/ảnh thành thuộc tính animate được;
  xuất SVG động qua SMIL (rect: width/height; ellipse: cx/cy/rx/ry dẫn xuất).
- **CLI (`bin/vecmotion.mjs`)**: new/info/edit/vectorize/render — engine ops
  JSON thuần (`src/cli/ops.js`), PNG decoder tự viết trên node:zlib
  (`src/cli/png.js`) để vectorize headless, render SVG thuần và PNG qua
  Chromium (playwright-core, optional). Lý do tách ops engine khỏi store
  trình duyệt: CLI không cần selection/undo/event, và giữ core thuần giúp
  test bằng Node không cần DOM.

## 5. Roadmap sau v1

IK 2 khớp · onion skin · path morphing · xuất Lottie JSON · render video
nhanh-hơn-realtime (WebCodecs + webm muxer) · trình quản lý cảnh trong một
file dự án · bảo toàn world-transform khi reparent · curve editor cho easing.
