from collections import defaultdict
from io import BytesIO
from typing import Annotated

import cv2
import numpy as np
import pytesseract
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel
from pytesseract import Output


DEFAULT_LANGUAGES = "eng+guj+hin+mar+san+urd"
DEFAULT_MIN_CONFIDENCE = 55.0

app = FastAPI(title="NyaySetu Internal OCR", version="0.1.0")


class OcrLine(BaseModel):
    text: str
    x: int
    y: int
    width: int
    height: int
    confidence: float


class OcrResult(BaseModel):
    width: int
    height: int
    lines: list[OcrLine]


@app.get("/health")
def health():
    return {"status": "ok", "engine": "tesseract"}


@app.post("/v1/ocr", response_model=OcrResult)
async def ocr_page(
    file: Annotated[UploadFile, File(...)],
    languages: Annotated[str, Form()] = DEFAULT_LANGUAGES,
    minimum_confidence: Annotated[float, Form()] = DEFAULT_MIN_CONFIDENCE,
):
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="An image file is required.")

    image = decode_image(image_bytes)
    prepared = prepare_image(image)
    height, width = prepared.shape[:2]

    try:
        raw = pytesseract.image_to_data(
            prepared,
            lang=languages,
            config="--oem 1 --psm 3",
            output_type=Output.DICT,
        )
    except pytesseract.TesseractError as error:
        raise HTTPException(status_code=422, detail=f"OCR could not process this page: {error}") from error

    return OcrResult(width=width, height=height, lines=to_lines(raw, minimum_confidence))


def decode_image(image_bytes: bytes) -> np.ndarray:
    try:
        pil_image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as error:
        raise HTTPException(status_code=400, detail="The uploaded page is not a supported image.") from error

    return cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)


def prepare_image(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, h=7, templateWindowSize=7, searchWindowSize=21)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(denoised)


def to_lines(data: dict, minimum_confidence: float) -> list[OcrLine]:
    grouped: dict[tuple[int, int, int], list[dict]] = defaultdict(list)
    count = len(data.get("text", []))

    for index in range(count):
        raw_text = str(data["text"][index] or "").strip()
        if not raw_text:
            continue

        confidence = parse_confidence(data["conf"][index])
        text = raw_text if confidence >= minimum_confidence else "(Not Readable)"
        key = (
            int(data["block_num"][index]),
            int(data["par_num"][index]),
            int(data["line_num"][index]),
        )
        grouped[key].append(
            {
                "text": text,
                "confidence": confidence,
                "x": int(data["left"][index]),
                "y": int(data["top"][index]),
                "width": int(data["width"][index]),
                "height": int(data["height"][index]),
            }
        )

    lines: list[OcrLine] = []
    for words in grouped.values():
        words.sort(key=lambda word: word["x"])
        x = min(word["x"] for word in words)
        y = min(word["y"] for word in words)
        right = max(word["x"] + word["width"] for word in words)
        bottom = max(word["y"] + word["height"] for word in words)
        lines.append(
            OcrLine(
                text=" ".join(word["text"] for word in words),
                x=x,
                y=y,
                width=max(1, right - x),
                height=max(1, bottom - y),
                confidence=min(word["confidence"] for word in words),
            )
        )

    return sorted(lines, key=lambda line: (line.y, line.x))


def parse_confidence(value: object) -> float:
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return 0.0
