FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

RUN groupadd --system --gid 10001 bonefree \
    && useradd --system --uid 10001 --gid bonefree --home-dir /app --shell /usr/sbin/nologin bonefree

COPY backend/requirements.txt /tmp/requirements.txt
RUN python -m pip install --no-cache-dir --requirement /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY --chown=bonefree:bonefree backend/ /app/backend/
COPY --chown=bonefree:bonefree frontend/public/assets/ /app/public/assets/

RUN mkdir -p /app/uploads /app/public/assets \
    && chown -R bonefree:bonefree /app/uploads /app/public

USER bonefree

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips=*"]
