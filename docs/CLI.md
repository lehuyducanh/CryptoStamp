# VecMotion CLI — API cho AI agent

CLI headless điều khiển toàn bộ pipeline hoạt hình: tạo project, dựng scene,
keyframe (kể cả **morph hình dạng**), vector hóa ảnh PNG, render ra SVG/PNG.
Mọi output là **JSON trên stdout** (`{ok:true,...}` hoặc `{ok:false,error}` +
exit code 1) để agent parse trực tiếp.

```bash
node bin/vecmotion.mjs <lệnh> ...
# hoặc sau `npm link`: vecmotion <lệnh> ...
```

Không cần dependency nào cho new/info/edit/vectorize/render-SVG.
Chỉ `render --format png` cần `playwright-core` + Chromium
(đường dẫn qua env `VECMOTION_CHROMIUM` nếu không tự tìm thấy).

## Các lệnh

### new — tạo project

```bash
vecmotion new -o project.json --width 960 --height 540 --fps 30 --duration 5
```

### info — đọc cấu trúc project

```bash
vecmotion info project.json
```

Trả về kích thước, fps, cây node (id/name/type), toàn bộ tracks + keyframes
(key morph hiển thị số đỉnh thay vì giá trị), danh sách asset.

### edit — áp danh sách thao tác (ops)

```bash
vecmotion edit project.json --ops ops.json        # sửa tại chỗ
echo '[{"op":"key",...}]' | vecmotion edit project.json --ops -
```

`ops.json` là mảng thao tác chạy tuần tự. Node được tham chiếu bằng `id`
(xem `info`) hoặc `"@ref"` — nhãn tự đặt qua trường `ref` của op tạo node
**trong cùng lần edit**. Kết quả trả về `created: {ref → id}`.

| op | Trường | Ghi chú |
|---|---|---|
| `setProject` | width, height, fps, durationS \| durFrames, background, name | đổi thiết lập |
| `addShape` | shape:`rect`\|`ellipse`, w, h, fill, x, y, rotation, opacity, name, parent, id, ref | pivot tự đặt giữa |
| `addVector` | paths:[{d,fill}], x, y, scale, seal, name, parent, id, ref | d chỉ nhận **M/L/C/Z tuyệt đối** |
| `addImage` | href (dataURL), w, h, x, y, name, parent, id, ref | |
| `addGroup` | name, children:[refs], parent, id, ref | children bị chuyển vào group (rig) |
| `addTraced` | trace:{items,w,h}, split, seal, name, x, y, scale, ref | kết quả của `vectorize` |
| `setProps` | node, props:{x,y,rotation,scaleX,scaleY,opacity,w,h,name,visible,…} | đặt giá trị tĩnh |
| `setPivot` | node, px, py, compensate=true | tâm xoay (khớp rig), có bù trừ vị trí |
| `parent` | node, parent (null=root), index | đổi cây — dựng rig FK |
| `remove` | node | xóa node + track của nó |
| `key` | node, prop, frame, value, ease | prop: x, y, rotation, scaleX, scaleY, opacity, w, h |
| `poseKey` | node, frame, paths:[d,…]?, ease | **keyframe hình dạng** node vector; bỏ `paths` = key hình hiện tại; `paths` phải **cùng topology** (cùng số path, cùng chuỗi lệnh M/L/C/Z) với node |
| `autoRig` | node, ref? | group mảnh phẳng → cây FK Đầu/Thân/Tay/Chân + pivot khớp (nhân vật đứng thẳng chính diện); `ref` nhận danh sách vùng |
| `removeKey` | node, prop, frame | prop `morph` cho key hình dạng |

Easing: `linear`, `easeIn`, `easeOut`, `easeInOut`, `backOut`, `bounceOut`,
`hold` (mặc định `easeInOut`).

### vectorize — ảnh PNG → vector (headless, không cần trình duyệt)

```bash
# Xuất kết quả trace ra JSON
vecmotion vectorize robot.png --colors 8 --detail 1.5 -o trace.json

# Hoặc thêm thẳng vào project (--split: tách mảnh để rig)
vecmotion vectorize robot.png --add project.json --name Robot --split

# Một lệnh ra nhân vật đã rig sẵn: tách mảnh + auto-rig FK
vecmotion vectorize robot.png --add project.json --name Robot --auto-rig
# → {"ok":true,"nodeId":"n1","rig":["Đầu","Thân","Tay trái","Tay phải","Chân trái","Chân phải"]}
# Sau đó animate khớp: {"op":"key","node":"<id Tay trái>","prop":"rotation",...}
```

Cờ: `--colors 2..16`, `--detail 0.5..4`, `--size 192|256|384` (cỡ trace),
`--no-smooth`, `--keep-bg`, `--no-seal`, `--x --y --scale`.
Chỉ nhận PNG 8-bit (ảnh khác convert trước, vd `ffmpeg -i in.jpg out.png`).

### render — xuất hình

```bash
vecmotion render project.json --frame 30 -o frame.svg      # 1 frame SVG
vecmotion render project.json -o frames/ --format svg      # chuỗi SVG (mọi frame)
vecmotion render project.json -o frames/ --format png --from 0 --to 150
vecmotion render project.json --animated-svg -o anim.svg   # SVG động (CSS+SMIL)
```

`--from/--to/--step` tính theo **frame**. Xuất video:

```bash
vecmotion render scene.json -o frames/ --format png
ffmpeg -framerate 30 -i frames/frame_%05d.png -c:v libx264 -pix_fmt yuv420p scene.mp4
```

## Ví dụ trọn vẹn: agent dựng cảnh morph + chuyển động

```bash
vecmotion new -o demo.json --width 640 --height 360 --duration 3

cat > ops.json << 'EOF'
[
 {"op":"addShape","shape":"ellipse","w":80,"h":80,"fill":"#ffcf5c","x":80,"y":140,"name":"Mặt trời","ref":"sun"},
 {"op":"addVector","paths":[{"d":"M0 40C0 10 30 0 50 0C70 0 100 10 100 40C100 70 70 80 50 80C30 80 0 70 0 40Z","fill":"#59c1ff"}],"name":"Giọt nước","x":300,"y":120,"ref":"blob"},
 {"op":"key","node":"@sun","prop":"x","frame":0,"value":80},
 {"op":"key","node":"@sun","prop":"x","frame":60,"value":480},
 {"op":"key","node":"@sun","prop":"y","frame":0,"value":140},
 {"op":"key","node":"@sun","prop":"y","frame":30,"value":40,"ease":"easeOut"},
 {"op":"key","node":"@sun","prop":"y","frame":60,"value":140},
 {"op":"poseKey","node":"@blob","frame":0},
 {"op":"poseKey","node":"@blob","frame":45,"paths":["M20 60C10 30 35 -15 50 -15C65 -15 90 30 80 60C75 85 60 95 50 95C40 95 25 85 20 60Z"]}
]
EOF

vecmotion edit demo.json --ops ops.json
vecmotion render demo.json -o frames/ --format png
ffmpeg -framerate 30 -i frames/frame_%05d.png -pix_fmt yuv420p demo.mp4
```

## Mẹo cho agent

- **Morph**: cách chắc chắn nhất để tạo pose cùng topology là lấy `d` hiện tại
  của node (đọc file project JSON), chỉ **thay đổi tọa độ**, giữ nguyên chuỗi
  lệnh. `poseKey` không có `paths` sẽ key hình dạng hiện tại — hữu ích làm
  key gốc trước khi biến đổi.
- **Rig**: nhanh nhất là `vectorize --auto-rig` (hoặc op `autoRig` trên group
  mảnh). Xong chạy `info` để lấy id các group Đầu/Tay/Chân rồi `key` prop
  `rotation` trên từng khớp. Rig thủ công: `addGroup` với `children` →
  `setPivot` tại khớp → `key` rotation. Con xoay theo cha (FK).
- File project là JSON thuần — agent có thể đọc/sửa trực tiếp, nhưng dùng
  `edit --ops` an toàn hơn (validate topology, id, easing).
- Phim dài: mỗi cảnh một file project, render từng cảnh, ghép bằng
  `ffmpeg -f concat`.
