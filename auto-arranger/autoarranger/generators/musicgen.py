"""MusicGen (Meta) qua Replicate API — cần REPLICATE_API_TOKEN.

Dùng để sinh biến thể audio hoàn toàn bằng AI từ plan.style_prompt.
Chỉ dùng với nhạc bạn có quyền, hoặc mô tả phong cách chung (không tên bài/nghệ sĩ).
"""

from __future__ import annotations

import json
import os
import time
import urllib.request

from .base import AudioGenerator

_API = "https://api.replicate.com/v1"
_MODEL_VERSION = "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb"


class MusicGenReplicate(AudioGenerator):
    name = "musicgen"

    def __init__(self) -> None:
        self.token = os.environ.get("REPLICATE_API_TOKEN")
        if not self.token:
            raise RuntimeError("Thiếu REPLICATE_API_TOKEN")

    def _request(self, url: str, payload: dict | None = None) -> dict:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())

    def generate(self, prompt: str, duration_s: int, out_path: str) -> str:
        owner_model, version = _MODEL_VERSION.split(":")
        pred = self._request(f"{_API}/predictions", {
            "version": version,
            "input": {
                "prompt": prompt,
                "duration": min(max(int(duration_s), 4), 30),
                "output_format": "wav",
                "model_version": "stereo-melody-large",
            },
        })
        pred_url = f"{_API}/predictions/{pred['id']}"
        deadline = time.time() + 600
        while time.time() < deadline:
            pred = self._request(pred_url)
            if pred["status"] == "succeeded":
                audio_url = pred["output"]
                if isinstance(audio_url, list):
                    audio_url = audio_url[0]
                urllib.request.urlretrieve(audio_url, out_path)
                return out_path
            if pred["status"] in ("failed", "canceled"):
                raise RuntimeError(f"MusicGen thất bại: {pred.get('error')}")
            time.sleep(5)
        raise TimeoutError("MusicGen quá thời gian chờ (10 phút)")
