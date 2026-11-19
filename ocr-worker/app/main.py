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


class OcrWord(BaseModel):
    text: str
    x: int
    y: int
    width: int
    height: int
    confidence: float


class OcrLine(BaseModel):
    text: str
    x: int
    y: int
    width: int
    height: int
    confidence: float
    words: list[OcrWord]


class OcrTableCell(BaseModel):
    x: int
    y: int
    width: int
    height: int


class OcrTable(BaseModel):
    cells: list[OcrTableCell]


class OcrMark(BaseModel):
    kind: str
    x: int
    y: int
    width: int
    height: int
    confidence: float


class OcrResult(BaseModel):
    width: int
    height: int
    lines: list[OcrLine]
    tables: list[OcrTable]
    marks: list[OcrMark]


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

    lines = to_lines(raw, minimum_confidence)
    tables = detect_tables(prepared)
    return OcrResult(
        width=width,
        height=height,
        lines=lines,
        tables=tables,
        marks=detect_marks(prepared, raw, minimum_confidence, tables),
    )


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
    grouped: dict[tuple[int, int, int], list[OcrWord]] = defaultdict(list)
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
        grouped[key].append(OcrWord(
            text=text,
            confidence=confidence,
            x=int(data["left"][index]),
            y=int(data["top"][index]),
            width=int(data["width"][index]),
            height=int(data["height"][index]),
        ))

    lines: list[OcrLine] = []
    for words in grouped.values():
        words.sort(key=lambda word: word.x)
        x = min(word.x for word in words)
        y = min(word.y for word in words)
        right = max(word.x + word.width for word in words)
        bottom = max(word.y + word.height for word in words)
        lines.append(
            OcrLine(
                text=" ".join(word.text for word in words),
                x=x,
                y=y,
                width=max(1, right - x),
                height=max(1, bottom - y),
                confidence=min(word.confidence for word in words),
                words=words,
            )
        )

    return sorted(lines, key=lambda line: (line.y, line.x))


def detect_tables(image: np.ndarray) -> list[OcrTable]:
    """Find ruled table grids without changing the page coordinate system."""
    height, width = image.shape[:2]
    binary = cv2.adaptiveThreshold(
        image,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        11,
    )
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(24, width // 28), 1))
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(24, height // 40)))
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)
    grid = cv2.bitwise_or(horizontal, vertical)

    contours, _ = cv2.findContours(grid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    tables: list[OcrTable] = []
    page_area = width * height

    for contour in contours:
        x, y, table_width, table_height = cv2.boundingRect(contour)
        if table_width * table_height < page_area * 0.025 or table_width < width * 0.18 or table_height < 36:
            continue

        x_lines = line_positions(vertical[y:y + table_height, x:x + table_width], axis=0)
        y_lines = line_positions(horizontal[y:y + table_height, x:x + table_width], axis=1)
        if len(x_lines) < 2 or len(y_lines) < 2:
            continue

        cells = []
        for left, right in zip(x_lines, x_lines[1:]):
            for top, bottom in zip(y_lines, y_lines[1:]):
                cell_width = right - left
                cell_height = bottom - top
                if cell_width < 8 or cell_height < 8:
                    continue
                cells.append(OcrTableCell(x=x + left, y=y + top, width=cell_width, height=cell_height))

        if cells:
            tables.append(OcrTable(cells=cells))

    return sorted(tables, key=lambda table: (min(cell.y for cell in table.cells), min(cell.x for cell in table.cells)))


def detect_marks(
    image: np.ndarray,
    data: dict,
    minimum_confidence: float,
    tables: list[OcrTable],
) -> list[OcrMark]:
    """Find only high-confidence signature and seal candidates outside recognized text."""
    height, width = image.shape[:2]
    binary = cv2.adaptiveThreshold(
        image,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        11,
    )
    text_mask = np.zeros_like(binary)
    for index, value in enumerate(data.get("text", [])):
        if not str(value or "").strip() or parse_confidence(data["conf"][index]) < minimum_confidence:
            continue
        x, y = int(data["left"][index]), int(data["top"][index])
        word_width, word_height = int(data["width"][index]), int(data["height"][index])
        cv2.rectangle(text_mask, (max(0, x - 3), max(0, y - 3)), (x + word_width + 3, y + word_height + 3), 255, -1)

    table_mask = np.zeros_like(binary)
    for table in tables:
        for cell in table.cells:
            cv2.rectangle(
                table_mask,
                (cell.x, cell.y),
                (cell.x + cell.width, cell.y + cell.height),
                255,
                thickness=4,
            )

    remaining = cv2.bitwise_and(binary, cv2.bitwise_not(text_mask))
    remaining = cv2.bitwise_and(remaining, cv2.bitwise_not(table_mask))
    grouped = cv2.morphologyEx(
        remaining,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(18, width // 70), max(3, height // 350))),
    )
    contours, _ = cv2.findContours(grouped, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    marks: list[OcrMark] = []

    for contour in contours:
        x, y, mark_width, mark_height = cv2.boundingRect(contour)
        area = mark_width * mark_height
        if area < width * height * 0.00018 or mark_width < 28 or mark_height < 10:
            continue

        source = remaining[y:y + mark_height, x:x + mark_width]
        density = cv2.countNonZero(source) / max(area, 1)
        aspect = mark_width / max(mark_height, 1)
        lower_page = y >= height * 0.28

        if lower_page and aspect >= 2.4 and 0.015 <= density <= 0.38:
            marks.append(OcrMark(kind="signature", x=x, y=y, width=mark_width, height=mark_height, confidence=0.8))
        elif 0.65 <= aspect <= 1.55 and min(mark_width, mark_height) >= 34 and 0.07 <= density <= 0.5:
            marks.append(OcrMark(kind="seal", x=x, y=y, width=mark_width, height=mark_height, confidence=0.7))

    return deduplicate_marks(marks)[:6]


def deduplicate_marks(marks: list[OcrMark]) -> list[OcrMark]:
    ordered = sorted(marks, key=lambda mark: mark.width * mark.height, reverse=True)
    unique: list[OcrMark] = []
    for mark in ordered:
        if all(overlap_ratio(mark, existing) < 0.45 for existing in unique):
            unique.append(mark)
    return sorted(unique, key=lambda mark: (mark.y, mark.x))


def overlap_ratio(left: OcrMark, right: OcrMark) -> float:
    intersection_left = max(left.x, right.x)
    intersection_top = max(left.y, right.y)
    intersection_right = min(left.x + left.width, right.x + right.width)
    intersection_bottom = min(left.y + left.height, right.y + right.height)
    if intersection_right <= intersection_left or intersection_bottom <= intersection_top:
        return 0.0
    intersection = (intersection_right - intersection_left) * (intersection_bottom - intersection_top)
    smaller_area = min(left.width * left.height, right.width * right.height)
    return intersection / max(smaller_area, 1)


def line_positions(image: np.ndarray, axis: int) -> list[int]:
    projection = np.count_nonzero(image, axis=axis)
    threshold = max(2, int(image.shape[axis] * 0.35))
    active = np.where(projection >= threshold)[0]
    if active.size == 0:
        return []

    positions: list[int] = []
    run_start = int(active[0])
    previous = int(active[0])
    for value in active[1:]:
        current = int(value)
        if current > previous + 1:
            positions.append((run_start + previous) // 2)
            run_start = current
        previous = current
    positions.append((run_start + previous) // 2)
    return positions


def parse_confidence(value: object) -> float:
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return 0.0
