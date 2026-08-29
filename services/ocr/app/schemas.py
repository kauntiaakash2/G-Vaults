from pydantic import BaseModel, Field

class OCRRequest(BaseModel):
    document_version_id: str = Field(min_length=1)
    content_base64: str = Field(min_length=1, max_length=30_000_000, description="Supplied by the trusted API worker; never a client path")
    mime_type: str

class OCRResponse(BaseModel):
    document_version_id: str
    text: str
    page_count: int
    engine: str
    language: str = "und"
