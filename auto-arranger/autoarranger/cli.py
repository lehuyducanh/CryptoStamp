"""CLI: python -m autoarranger <lệnh> ..."""

from __future__ import annotations

import argparse
import sys

from .emotions import EMOTIONS
from .ensembles import ENSEMBLES
from .examples import EXAMPLES, write_example
from .pipeline import arrange_batch, arrange_song


def _add_common(p: argparse.ArgumentParser) -> None:
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--input", help="Đường dẫn file MIDI nguồn")
    src.add_argument("--example", choices=sorted(EXAMPLES),
                     help="Dùng bản mẫu public-domain có sẵn")
    p.add_argument("--out", default="output", help="Thư mục xuất (mặc định: output)")
    p.add_argument("--use-llm", choices=["auto", "yes", "no"], default="auto",
                   help="auto: dùng Claude nếu có ANTHROPIC_API_KEY (mặc định)")
    p.add_argument("--notes", default="", help="Ghi chú thêm cho LLM planner")
    p.add_argument("--seed", type=int, default=0, help="Seed humanize")
    p.add_argument("--mp3", action="store_true", help="Xuất thêm MP3 (cần ffmpeg)")


def _resolve_input(args) -> str:
    if args.example:
        return write_example(args.example, args.out)
    return args.input


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="autoarranger",
        description="Tự động phối khí: MIDI -> LLM plan -> bản phối -> audio",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_arr = sub.add_parser("arrange", help="Phối 1 bản (1 cảm xúc × 1 biên chế)")
    _add_common(p_arr)
    p_arr.add_argument("--emotion", choices=sorted(EMOTIONS), default="peaceful")
    p_arr.add_argument("--ensemble", choices=sorted(ENSEMBLES), default="piano_solo")

    p_bat = sub.add_parser("batch", help="Phối nhiều bản cùng lúc")
    _add_common(p_bat)
    p_bat.add_argument("--emotions", default="melancholic,joyful",
                       help="Danh sách cảm xúc, phân cách bằng dấu phẩy")
    p_bat.add_argument("--ensembles", default="piano_solo",
                       help="Danh sách biên chế, phân cách bằng dấu phẩy")

    p_demo = sub.add_parser("demo", help="Chạy demo: Ode to Joy với 3 cảm xúc khác nhau")
    p_demo.add_argument("--out", default="output")
    p_demo.add_argument("--use-llm", choices=["auto", "yes", "no"], default="auto")
    p_demo.add_argument("--mp3", action="store_true")

    sub.add_parser("list", help="Liệt kê cảm xúc & biên chế khả dụng")

    args = parser.parse_args(argv)

    if args.cmd == "list":
        print("Cảm xúc:")
        for k, v in EMOTIONS.items():
            print(f"  {k:<14} {v['description']}")
        print("\nBiên chế:")
        for k, v in ENSEMBLES.items():
            print(f"  {k:<16} {v['description']}")
        print("\nBản mẫu public-domain:", ", ".join(sorted(EXAMPLES)))
        return 0

    if args.cmd == "arrange":
        r = arrange_song(input_midi=_resolve_input(args), emotion=args.emotion,
                         ensemble=args.ensemble, out_dir=args.out, use_llm=args.use_llm,
                         notes=args.notes, seed=args.seed, mp3=args.mp3)
        _print_results([r])
        return 0

    if args.cmd == "batch":
        emotions = [e.strip() for e in args.emotions.split(",") if e.strip()]
        ensembles = [e.strip() for e in args.ensembles.split(",") if e.strip()]
        for e in emotions:
            if e not in EMOTIONS:
                parser.error(f"Cảm xúc lạ: {e}. Chọn: {', '.join(sorted(EMOTIONS))}")
        for e in ensembles:
            if e not in ENSEMBLES:
                parser.error(f"Biên chế lạ: {e}. Chọn: {', '.join(sorted(ENSEMBLES))}")
        rs = arrange_batch(input_midi=_resolve_input(args), song=None, emotions=emotions,
                           ensembles=ensembles, out_dir=args.out, use_llm=args.use_llm,
                           notes=args.notes, seed=args.seed, mp3=args.mp3)
        _print_results(rs)
        return 0

    if args.cmd == "demo":
        midi = write_example("ode_to_joy", args.out)
        rs = arrange_batch(
            input_midi=midi, song=None,
            emotions=["melancholic", "joyful", "epic"],
            ensembles=["string_quartet"],
            out_dir=args.out, use_llm=args.use_llm, mp3=args.mp3,
        )
        _print_results(rs)
        return 0

    return 1


def _print_results(results: list[dict]) -> None:
    print(f"\nĐã tạo {len(results)} bản phối:")
    for r in results:
        line = f"  [{r['planner']:>5}] {r['wav']}"
        if r.get("mp3"):
            line += f" | {r['mp3']}"
        print(line)


if __name__ == "__main__":
    sys.exit(main())
