"""Store validated event photos independently of product media."""
from io import BytesIO
from pathlib import Path
from uuid import uuid4
import warnings

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from core.errors import AppHTTPException

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'}


def store_event_image(file: UploadFile, uploads_root: Path):
    if file.content_type not in ALLOWED_TYPES:
        raise AppHTTPException(status_code=400, error='invalid_image_type', message='Use a JPEG, PNG, WebP, GIF or AVIF image.')
    content = file.file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise AppHTTPException(status_code=413, error='image_too_large', message='Event images must be 8 MB or smaller.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                if source.width * source.height > 24_000_000:
                    raise ValueError('Image dimensions are too large')
                image = ImageOps.exif_transpose(source).convert('RGBA')
                image.thumbnail((1920, 1920))
                output = BytesIO()
                image.save(output, format='WEBP', quality=88, method=4)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise AppHTTPException(status_code=400, error='invalid_image', message='Use a valid image with no more than 24 million pixels.')
    key = f'events/{uuid4().hex}.webp'
    destination = uploads_root / key
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        destination.write_bytes(output.getvalue())
    except OSError:
        destination.unlink(missing_ok=True)
        raise
    return {'image_url': f'/uploads/{key}', 'width': image.width, 'height': image.height}
