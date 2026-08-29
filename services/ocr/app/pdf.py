from io import BytesIO
import fitz

def extract_pdf(data: bytes) -> tuple[str, int]:
    with fitz.open(stream=BytesIO(data), filetype="pdf") as document:
        pages = [page.get_text("text") for page in document]
        return "\n".join(pages).strip(), len(document)
