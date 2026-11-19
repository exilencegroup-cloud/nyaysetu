FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl libgl1 tesseract-ocr \
  && mkdir -p "$TESSDATA_PREFIX" \
  && for language in eng guj hin mar san urd; do \
       curl --fail --location --retry 3 \
         "https://github.com/tesseract-ocr/tessdata_best/raw/main/${language}.traineddata" \
         --output "$TESSDATA_PREFIX/${language}.traineddata"; \
     done \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
