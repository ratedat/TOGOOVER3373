import base64
import json
import os
import re
import tempfile
from pathlib import Path

try:
    import numpy as np
except Exception as exc:
    raise RuntimeError(f"NumPy is required for Paddle template OCR regions: {exc}") from exc

try:
    from PIL import Image
except Exception as exc:
    raise RuntimeError(f"Pillow is required for Paddle OCR region crops: {exc}") from exc

try:
    from paddleocr import PaddleOCR, TextRecognition
except Exception as exc:
    raise RuntimeError(f"PaddleOCR is not available: {exc}") from exc


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def region_value(region, key, default):
    value = region.get(key, default) if isinstance(region, dict) else default
    if isinstance(value, list):
        return value[0] if value else default
    return value


def rect_from_points(points):
    xs = []
    ys = []
    for point in points or []:
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            xs.append(float(point[0]))
            ys.append(float(point[1]))
    if not xs or not ys:
        return None
    return {
        "x": round(min(xs), 1),
        "y": round(min(ys), 1),
        "width": round(max(xs) - min(xs), 1),
        "height": round(max(ys) - min(ys), 1),
    }


def rect_from_box(box):
    if box is None:
        return None
    if isinstance(box, dict):
        return box
    if isinstance(box, (list, tuple)):
        if len(box) == 4 and all(isinstance(v, (int, float)) for v in box):
            x1, y1, x2, y2 = [float(v) for v in box]
            return {"x": round(x1, 1), "y": round(y1, 1), "width": round(x2 - x1, 1), "height": round(y2 - y1, 1)}
        return rect_from_points(box)
    return None


def map_rect(rect, region):
    if rect is None or region is None:
        return rect
    scale = max(1.0, float(region_value(region, "scale", 1)))
    offset_x = float(region_value(region, "x", 0))
    offset_y = float(region_value(region, "y", 0))
    return {
        "x": round(offset_x + (float(rect.get("x", 0)) / scale), 1),
        "y": round(offset_y + (float(rect.get("y", 0)) / scale), 1),
        "width": round(float(rect.get("width", 0)) / scale, 1),
        "height": round(float(rect.get("height", 0)) / scale, 1),
    }


def region_rect(region):
    if region is None:
        return None
    return {
        "x": float(region_value(region, "x", 0)),
        "y": float(region_value(region, "y", 0)),
        "width": float(region_value(region, "width", 1)),
        "height": float(region_value(region, "height", 1)),
    }


def clamp_rect(rect, width, height):
    x = min(max(0, int(float(rect.get("x", 0)))), max(0, width - 1))
    y = min(max(0, int(float(rect.get("y", 0)))), max(0, height - 1))
    w = max(1, int(float(rect.get("width", 1))))
    h = max(1, int(float(rect.get("height", 1))))
    w = max(1, min(w, width - x))
    h = max(1, min(h, height - y))
    return {"x": x, "y": y, "width": w, "height": h}


def resize_template(template, config):
    scale_x = float(region_value(config, "templateScaleX", 1))
    scale_y = float(region_value(config, "templateScaleY", 1))
    if abs(scale_x - 1) < 0.001 and abs(scale_y - 1) < 0.001:
        return template
    width = max(1, int(round(template.width * scale_x)))
    height = max(1, int(round(template.height * scale_y)))
    return template.resize((width, height), Image.Resampling.BICUBIC)


def match_template_positions(image, config):
    template_path = Path(str(region_value(config, "templatePath", "")))
    if not template_path.exists():
        return []
    search_roi = clamp_rect(region_value(config, "searchRoi", {}) or {}, image.width, image.height)
    with Image.open(template_path).convert("L") as raw_template:
        template = resize_template(raw_template, config)
        search = image.crop((search_roi["x"], search_roi["y"], search_roi["x"] + search_roi["width"], search_roi["y"] + search_roi["height"])).convert("L")
        if template.width > search.width or template.height > search.height:
            return []
        sample_stride = max(1, int(float(region_value(config, "sampleStride", 4))))
        step = max(1, int(float(region_value(config, "step", 2))))
        threshold = float(region_value(config, "threshold", 0.9))
        template_arr = np.asarray(template, dtype=np.float32)[::sample_stride, ::sample_stride]
        template_arr = template_arr - float(template_arr.mean())
        template_norm = float(np.linalg.norm(template_arr))
        if template_norm <= 0:
            return []
        search_arr = np.asarray(search, dtype=np.float32)
        matches = []
        for y in range(0, search.height - template.height + 1, step):
            for x in range(0, search.width - template.width + 1, step):
                patch = search_arr[y:y + template.height:sample_stride, x:x + template.width:sample_stride]
                if patch.shape != template_arr.shape:
                    continue
                patch = patch - float(patch.mean())
                patch_norm = float(np.linalg.norm(patch))
                if patch_norm <= 0:
                    continue
                score = float(np.sum(patch * template_arr) / (patch_norm * template_norm))
                if score >= threshold:
                    matches.append({
                        "x": search_roi["x"] + x,
                        "y": search_roi["y"] + y,
                        "width": template.width,
                        "height": template.height,
                        "score": score,
                    })
        matches.sort(key=lambda item: item["score"], reverse=True)
        max_matches = max(1, int(float(region_value(config, "maxMatches", 8))))
        selected = []
        for match in matches:
            cx = match["x"] + match["width"] / 2
            cy = match["y"] + match["height"] / 2
            if any(abs(cx - (previous["x"] + previous["width"] / 2)) < match["width"] * 0.65 and abs(cy - (previous["y"] + previous["height"] / 2)) < match["height"] * 0.65 for previous in selected):
                continue
            selected.append(match)
            if len(selected) >= max_matches:
                break
        selected.sort(key=lambda item: (item["y"], item["x"]))
        return selected


def dynamic_template_ocr_regions(image_path, configs, regions):
    if not configs:
        return regions
    image = Image.open(image_path).convert("RGB")
    try:
        next_regions = list(regions or [])
        dynamic = []
        for config in configs:
            suppress_pattern = str(region_value(config, "suppressStaticRegionIdPattern", "") or "")
            if suppress_pattern:
                matcher = re.compile(suppress_pattern)
                next_regions = [region for region in next_regions if not matcher.search(str(region_value(region, "id", "")))]
            ocr_offset = region_value(config, "ocrOffset", {}) or {}
            for index, match in enumerate(match_template_positions(image, config)):
                region = {
                    "id": f"{region_value(config, 'idPrefix', 'template.region')}.{index}",
                    "x": match["x"] + int(float(region_value(ocr_offset, "x", 0))),
                    "y": match["y"] + int(float(region_value(ocr_offset, "y", 0))),
                    "width": int(float(region_value(ocr_offset, "width", max(1, match["width"])))),
                    "height": int(float(region_value(ocr_offset, "height", max(1, match["height"])))),
                    "scale": int(float(region_value(config, "scale", 1))),
                    "templateScore": match["score"],
                }
                dynamic.append(clamp_rect(region, image.width, image.height) | {"id": region["id"], "scale": region["scale"], "templateScore": region["templateScore"]})
        return dynamic + next_regions
    finally:
        image.close()


def result_json(result):
    data = getattr(result, "json", None)
    if callable(data):
        data = data()
    return data if isinstance(data, dict) else {}


def from_text_recognition_result(result, region_id, region):
    data = result_json(result)
    res = data.get("res") if isinstance(data.get("res"), dict) else data
    text = str(res.get("rec_text") or res.get("text") or "").strip()
    if not text:
        return []
    score = res.get("rec_score", res.get("score", 0.75))
    return [{
        "text": text,
        "regionId": region_id,
        "roi": region_rect(region),
        "confidence": float(score) if isinstance(score, (int, float)) else 0.75,
    }]


def from_paddle3_result(result, region_id, region):
    data = result_json(result)
    if not data:
        return []
    res = data.get("res") if isinstance(data.get("res"), dict) else data
    texts = res.get("rec_texts") or res.get("texts") or []
    scores = res.get("rec_scores") or res.get("scores") or []
    boxes = res.get("rec_boxes") or res.get("rec_polys") or res.get("dt_polys") or []
    items = []
    for index, text in enumerate(texts):
        if not str(text).strip():
            continue
        rect = rect_from_box(boxes[index] if index < len(boxes) else None)
        items.append({
            "text": str(text),
            "regionId": region_id,
            "roi": map_rect(rect, region),
            "confidence": float(scores[index]) if index < len(scores) else 0.75,
        })
    return items


def from_paddle2_result(result, region_id, region):
    items = []
    if not isinstance(result, list):
        return items
    rows = result
    if len(rows) == 1 and isinstance(rows[0], list) and rows and rows[0] and isinstance(rows[0][0], list):
        rows = rows[0]
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        box, payload = row[0], row[1]
        if isinstance(payload, (list, tuple)) and payload:
            text = str(payload[0])
            score = float(payload[1]) if len(payload) > 1 else 0.75
        else:
            text = str(payload)
            score = 0.75
        if not text.strip():
            continue
        items.append({
            "text": text,
            "regionId": region_id,
            "roi": map_rect(rect_from_box(box), region),
            "confidence": score,
        })
    return items


def build_ocr():
    kwargs = {
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
    }
    if os.environ.get("RHODES_PADDLE_LANG"):
        kwargs["lang"] = os.environ["RHODES_PADDLE_LANG"]
    if os.environ.get("RHODES_PADDLE_DEVICE"):
        kwargs["device"] = os.environ["RHODES_PADDLE_DEVICE"]
    if os.environ.get("RHODES_PADDLE_OCR_VERSION"):
        kwargs["ocr_version"] = os.environ["RHODES_PADDLE_OCR_VERSION"]
    try:
        return PaddleOCR(**kwargs)
    except TypeError:
        fallback = {}
        if os.environ.get("RHODES_PADDLE_LANG"):
            fallback["lang"] = os.environ["RHODES_PADDLE_LANG"]
        fallback["use_angle_cls"] = False
        return PaddleOCR(**fallback)


def build_text_recognizer():
    model_name = os.environ.get("RHODES_PADDLE_REC_MODEL") or "PP-OCRv6_medium_rec"
    kwargs = {"model_name": model_name}
    if os.environ.get("RHODES_PADDLE_DEVICE"):
        kwargs["device"] = os.environ["RHODES_PADDLE_DEVICE"]
    return TextRecognition(**kwargs)


def crop_image(source_path, region, temp_dir):
    image = Image.open(source_path).convert("RGB")
    try:
        x = max(0, int(float(region_value(region, "x", 0))))
        y = max(0, int(float(region_value(region, "y", 0))))
        w = max(1, int(float(region_value(region, "width", 1))))
        h = max(1, int(float(region_value(region, "height", 1))))
        w = min(w, image.width - x)
        h = min(h, image.height - y)
        scale = max(1, int(float(region_value(region, "scale", 1))))
        crop = image.crop((x, y, x + w, y + h))
        if scale > 1:
            crop = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.LANCZOS)
        output = Path(temp_dir) / f"region-{region_value(region, 'id', 'region')}-{len(list(Path(temp_dir).glob('region-*.png')))}.png"
        crop.save(output)
        return str(output)
    finally:
        image.close()


def recognize_path(ocr, image_path, region_id, region):
    if hasattr(ocr, "predict"):
        raw = ocr.predict(image_path)
    else:
        raw = ocr.ocr(image_path, cls=False)
    results = []
    entries = raw if isinstance(raw, list) else [raw]
    for entry in entries:
        results.extend(from_paddle3_result(entry, region_id, region))
    if not results:
        results.extend(from_paddle2_result(raw, region_id, region))
    return results


def recognize_text_path(recognizer, image_path, region_id, region):
    raw = recognizer.predict(image_path)
    entries = raw if isinstance(raw, list) else [raw]
    results = []
    for entry in entries:
        results.extend(from_text_recognition_result(entry, region_id, region))
    return results


def main():
    image_path = os.environ["ARK_OCR_IMAGE"]
    regions = json.loads(os.environ.get("ARK_OCR_REGIONS_JSON") or "[]")
    template_regions = json.loads(os.environ.get("ARK_OCR_TEMPLATE_REGIONS_JSON") or "[]")
    regions = dynamic_template_ocr_regions(image_path, template_regions, regions)
    recognition_only = env_bool("RHODES_PADDLE_RECOGNITION_ONLY", default=bool(regions))
    include_full = env_bool("RHODES_PADDLE_INCLUDE_FULL", default=not bool(regions) and not recognition_only)
    all_results = []
    with tempfile.TemporaryDirectory(prefix="rhodes-paddle-ocr-") as temp_dir:
        if recognition_only:
            recognizer = build_text_recognizer()
            targets = regions or [{"id": "full", "x": 0, "y": 0, "width": Image.open(image_path).width, "height": Image.open(image_path).height, "scale": 1}]
            for region in targets:
                region_id = str(region_value(region, "id", "region"))
                crop_path = crop_image(image_path, region, temp_dir)
                all_results.extend(recognize_text_path(recognizer, crop_path, region_id, region))
        else:
            ocr = build_ocr()
            if include_full:
                all_results.extend(recognize_path(ocr, image_path, "full", None))
            for region in regions:
                region_id = str(region_value(region, "id", "region"))
                crop_path = crop_image(image_path, region, temp_dir)
                all_results.extend(recognize_path(ocr, crop_path, region_id, region))
    payload = {
        "text": " ".join(item["text"] for item in all_results if item.get("text")),
        "ocrResults": all_results,
        "engine": "paddleocr-recognition" if recognition_only else "paddleocr",
    }
    encoded = base64.b64encode(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).decode("ascii")
    print(encoded)


if __name__ == "__main__":
    main()
