# OCR service

Run with `uvicorn app.main:app --host 0.0.0.0 --port 8000` after installing
`requirements.txt`, or use `docker compose --profile ocr up -d` (the OCR service is an optional Compose profile). Set
`OCR_SERVICE_URL=http://localhost:8000` in the API environment. The internal endpoint accepts a document version ID and
bytes supplied by a trusted API worker; it never accepts client filesystem
paths. PyMuPDF handles text PDFs first, while PaddleOCR can be enabled for
scanned images/PDF pages without changing the API security boundary.

Set the same random, 32-character-or-longer `OCR_INTERNAL_TOKEN` for the API
and worker. Compose provides a local-development default; deployed environments
must replace it. Requests without this service credential are rejected.

After starting the service, click **Extract text & summarize** again on the
document page. This requeues completed processing jobs, so older PDF results
created by a previous fallback are replaced with real extracted/OCR text.
