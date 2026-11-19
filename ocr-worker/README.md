# NyaySetu Internal OCR Worker

This is the self-hosted OCR service used by Type Copy when `INTERNAL_OCR_WORKER_URL` is set.

It runs Tesseract language models inside the NyaySetu worker image, returns line coordinates and confidence-aware text, and never calls an external OCR API.

Build and run locally with Docker:

```bash
docker build -t nyaysetu-ocr ./ocr-worker
docker run --rm -p 8080:8080 nyaysetu-ocr
```

The worker accepts `POST /v1/ocr` as multipart form data with a `file` field. The response contains page width, page height, and positioned text lines.

For production, expose this service only to the NyaySetu web backend and set `INTERNAL_OCR_WORKER_URL` to its private address.
