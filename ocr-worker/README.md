# NyaySetu Internal OCR Worker

This is the self-hosted OCR service used by Type Copy when `INTERNAL_OCR_WORKER_URL` is set.

It runs Tesseract language models inside the NyaySetu worker image, returns line coordinates and confidence-aware text, and never calls an external OCR API.

Build and run locally with Docker:

```bash
docker build -t nyaysetu-ocr ./ocr-worker
docker run --rm -p 8080:8080 nyaysetu-ocr
```

The worker accepts `POST /v1/ocr` as multipart form data with a `file` field. The response contains page width, page height, and positioned text lines.

## Vercel deployment

The root `vercel.json` declares the worker as a private Vercel Container service. The `web` service receives the worker URL through a service binding named `INTERNAL_OCR_WORKER_URL`; do not add that variable manually in Vercel or expose a public rewrite for the worker.

Before the first deployment, enable Vercel Services for the `nyaysetu` project. The worker image starts on the platform-provided `PORT` and remains inaccessible from the public internet. Its only caller is the NyaySetu web service.
