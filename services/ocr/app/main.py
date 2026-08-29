import os
import secrets
from fastapi import FastAPI, Header, HTTPException
from .ocr import process
from .schemas import OCRRequest, OCRResponse

app = FastAPI(title="SIH OCR worker", docs_url=None, redoc_url=None)
internal_token = os.environ.get("OCR_INTERNAL_TOKEN", "")
if len(internal_token) < 32:
    raise RuntimeError("OCR_INTERNAL_TOKEN must contain at least 32 characters")

@app.post("/internal/process", response_model=OCRResponse)
def process_document(request: OCRRequest, x_ocr_token: str = Header(default="")) -> OCRResponse:
    if not secrets.compare_digest(x_ocr_token, internal_token):
        raise HTTPException(status_code=401, detail="Invalid internal service credential")
    return process(request)
