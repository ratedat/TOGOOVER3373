import base64
import json
import math
import os
import re
import tempfile
from pathlib import Path

try:
    import numpy as np
except Exception as exc:
    raise RuntimeError(f"NumPy is required for MAA ONNX OCR: {exc}") from exc

try:
    import onnxruntime as ort
except Exception as exc:
    raise RuntimeError(f"ONNXRuntime is required for MAA ONNX OCR: {exc}") from exc

try:
    from PIL import Image, ImageOps
except Exception as exc:
    raise RuntimeError(f"Pillow is required for MAA ONNX OCR: {exc}") from exc


def env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return default


def region_value(region, key, default):
    value = region.get(key, default) if isinstance(region, dict) else default
    if isinstance(value, list):
        return value[0] if value else default
    return value


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
            too_close = False
            for previous in selected:
                pcx = previous["x"] + previous["width"] / 2
                pcy = previous["y"] + previous["height"] / 2
                if abs(cx - pcx) < match["width"] * 0.65 and abs(cy - pcy) < match["height"] * 0.65:
                    too_close = True
                    break
            if too_close:
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


def load_equivalence_classes(path):
    if not path or not Path(path).exists():
        return []
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    classes = []
    for group in data.get("equivalence_classes", []):
        if isinstance(group, list) and len(group) >= 2:
            normalized = [str(item) for item in group if str(item)]
            if len(normalized) >= 2:
                classes.append(normalized)
    return classes


def apply_equivalence_classes(value, classes):
    text = str(value or "")
    for group in classes:
        replacement = group[0]
        for variant in group[1:]:
            text = text.replace(variant, replacement)
    return text


def preprocess_image(image_path):
    image = Image.open(image_path).convert("RGB")
    try:
        mode = os.environ.get("RHODES_MAA_ONNX_PREPROCESS", "rgb").strip().lower()
        if mode == "gray":
            image = ImageOps.grayscale(image).convert("RGB")
        elif mode == "invert":
            image = ImageOps.invert(ImageOps.grayscale(image)).convert("RGB")

        target_h = env_int("RHODES_MAA_ONNX_REC_HEIGHT", 48)
        width_multiple = max(1, env_int("RHODES_MAA_ONNX_WIDTH_MULTIPLE", 32))
        min_width = max(width_multiple, env_int("RHODES_MAA_ONNX_MIN_WIDTH", 32))
        max_width = max(min_width, env_int("RHODES_MAA_ONNX_MAX_WIDTH", 4096))
        ratio = image.width / max(1, image.height)
        target_w = int(math.ceil((target_h * ratio) / width_multiple) * width_multiple)
        target_w = max(min_width, min(target_w, max_width))
        image = image.resize((target_w, target_h), Image.Resampling.BICUBIC)
        arr = np.asarray(image).astype("float32") / 255.0
        arr = (arr - 0.5) / 0.5
        arr = np.transpose(arr, (2, 0, 1))[None, :, :, :]
        return arr
    finally:
        image.close()


def load_keys(path):
    keys_path = Path(path)
    if not keys_path.exists():
        raise RuntimeError(f"MAA ONNX OCR keys not found: {keys_path}")
    keys = keys_path.read_text(encoding="utf-8").splitlines()
    return [""] + keys


def ctc_decode(probabilities, characters):
    if probabilities.ndim == 3:
        probabilities = probabilities[0]
    indices = np.argmax(probabilities, axis=1)
    scores = np.max(probabilities, axis=1)
    chars = []
    char_scores = []
    previous = -1
    for raw_index, raw_score in zip(indices, scores):
        index = int(raw_index)
        if index != 0 and index != previous:
            char = characters[index] if index < len(characters) else ""
            if char:
                chars.append(char)
                char_scores.append(float(raw_score))
        previous = index
    confidence = sum(char_scores) / len(char_scores) if char_scores else 0.0
    return "".join(chars), confidence


def main():
    image_path = os.environ["ARK_OCR_IMAGE"]
    regions = json.loads(os.environ.get("ARK_OCR_REGIONS_JSON") or "[]")
    template_regions = json.loads(os.environ.get("ARK_OCR_TEMPLATE_REGIONS_JSON") or "[]")
    model_path = Path(os.environ["RHODES_MAA_ONNX_REC_MODEL"])
    if not model_path.exists():
        raise RuntimeError(f"MAA ONNX OCR model not found: {model_path}")
    keys = load_keys(os.environ["RHODES_MAA_ONNX_REC_KEYS"])
    equivalence_classes = load_equivalence_classes(os.environ.get("RHODES_MAA_OCR_CONFIG"))

    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    all_results = []

    with tempfile.TemporaryDirectory(prefix="rhodes-maa-onnx-ocr-") as temp_dir:
        targets = dynamic_template_ocr_regions(image_path, template_regions, regions)
        if not targets:
            with Image.open(image_path) as image:
                targets = [{"id": "full", "x": 0, "y": 0, "width": image.width, "height": image.height, "scale": 1}]
        for region in targets:
            region_id = str(region_value(region, "id", "region"))
            crop_path = crop_image(image_path, region, temp_dir)
            tensor = preprocess_image(crop_path)
            output = session.run([output_name], {input_name: tensor})[0]
            raw_text, confidence = ctc_decode(output, keys)
            text = apply_equivalence_classes(raw_text, equivalence_classes)
            if not text.strip():
                continue
            all_results.append({
                "text": text,
                "rawText": raw_text,
                "regionId": region_id,
                "roi": region_rect(region),
                "confidence": confidence,
            })

    payload = {
        "text": " ".join(item["text"] for item in all_results if item.get("text")),
        "ocrResults": all_results,
        "engine": "maa-onnx-recognition",
    }
    encoded = base64.b64encode(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).decode("ascii")
    print(encoded)


if __name__ == "__main__":
    main()
