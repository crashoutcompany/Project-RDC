#!/usr/bin/env python3
"""
Cross-platform OCR daemon for the scoreboard harvester (Linux, Raspberry Pi,
CI). Speaks the same protocol as `vision-ocr --daemon`: one image path per
stdin line, one JSON object per stdout line:

    {"ok": true, "text": ["LINE 1", "LINE 2", ...]}   # sorted top-to-bottom
    {"ok": false, "error": "..."}

Backed by RapidOCR (PaddleOCR models on ONNX Runtime). Install once with:

    pip install --user rapidocr onnxruntime

Env knobs:
    RAPIDOCR_THREADS  ONNX intra-op threads per daemon (default: 2)
"""
import json
import os
import sys


def build_engine():
    from rapidocr import RapidOCR

    threads = int(os.environ.get("RAPIDOCR_THREADS", "2"))
    return RapidOCR(
        params={
            # Scoreboards are axis-aligned; the angle classifier only costs time.
            "Global.use_cls": False,
            "Global.log_level": "error",
            "EngineConfig.onnxruntime.intra_op_num_threads": threads,
        }
    )


def recognize(engine, image_path):
    result = engine(image_path)
    if result is None or result.txts is None:
        return []
    # boxes are 4-point polygons; sort by the top edge so output matches the
    # Vision daemon's top-to-bottom ordering.
    rows = sorted(zip(result.boxes, result.txts), key=lambda r: (r[0][0][1], r[0][0][0]))
    return [text for _, text in rows if text]


def main():
    if len(sys.argv) != 2 or sys.argv[1] != "--daemon":
        sys.stderr.write("usage: rapid-ocr-daemon.py --daemon\n")
        sys.exit(2)

    try:
        engine = build_engine()
    except Exception as exc:  # noqa: BLE001 - surface any import/model error
        sys.stderr.write(f"failed to start RapidOCR: {exc}\n")
        sys.exit(1)

    for line in sys.stdin:
        image_path = line.strip()
        if not image_path:
            continue
        try:
            payload = {"ok": True, "text": recognize(engine, image_path)}
        except Exception as exc:  # noqa: BLE001 - report per-frame failures
            payload = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
