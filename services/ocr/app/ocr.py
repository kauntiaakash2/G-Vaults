import base64
from io import BytesIO
from .pdf import extract_pdf
from .schemas import OCRRequest, OCRResponse

def process(request: OCRRequest) -> OCRResponse:
    data = base64.b64decode(request.content_base64, validate=True)
    if request.mime_type == "application/pdf":
        text, pages = extract_pdf(data)
        # Some malformed/generated PDFs expose their container dictionary as
        # "text". Never index that binary-ish payload; send it through OCR.
        looks_like_pdf_bytes = text.lstrip().startswith("%PDF-")
        if text and not looks_like_pdf_bytes:
            return OCRResponse(document_version_id=request.document_version_id, text=" ".join(text.split()), page_count=pages, engine="pymupdf")
        text, pages = _ocr_pdf(data)
        return OCRResponse(document_version_id=request.document_version_id, text=text, page_count=pages, engine="paddleocr")
    if request.mime_type in {"text/plain", "text/markdown"}:
        return OCRResponse(document_version_id=request.document_version_id, text=data.decode("utf-8", errors="replace"), page_count=1, engine="text")
    text = _ocr_image(data)
    return OCRResponse(document_version_id=request.document_version_id, text=text, page_count=1, engine="paddleocr" if text else "paddleocr_unavailable")

def _ocr_pdf(data: bytes) -> tuple[str, int]:
    import fitz
    with fitz.open(stream=BytesIO(data), filetype="pdf") as document:
        pages = len(document)
        text = "\n".join(_ocr_image(page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).tobytes("png")) for page in document)
        return " ".join(text.split()), pages

def _ocr_image(data: bytes) -> str:
    import numpy as np
    from PIL import Image
    from paddleocr import PaddleOCR

    image = np.array(Image.open(BytesIO(data)).convert("RGB"))
    engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    result = engine.ocr(image, cls=True)
    lines: list[str] = []
    for page in result or []:
        for item in page or []:
            if len(item) > 1 and item[1]:
                lines.append(str(item[1][0]))
    return " ".join(lines)
