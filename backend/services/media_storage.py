from __future__ import annotations

import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps

from schemas.enums import MediaVariantKind
from utils.id_format import format_product_id


PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_ROOT = PROJECT_ROOT / "uploads"
PRODUCT_MEDIA_DIR = UPLOADS_ROOT / "products"

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"}
VARIANT_SIZES: dict[MediaVariantKind, tuple[int, int]] = {
    MediaVariantKind.THUMB: (160, 160),
    MediaVariantKind.CARD: (640, 480),
    MediaVariantKind.DETAIL: (1280, 960),
}


@dataclass(frozen=True)
class StoredImageVariant:
    kind: MediaVariantKind
    storage_key: str
    public_url: str
    content_type: str
    width: int | None
    height: int | None
    size_bytes: int


@dataclass(frozen=True)
class StoredProductMedia:
    original_filename: str | None
    content_type: str
    storage_key: str
    public_url: str
    width: int | None
    height: int | None
    size_bytes: int
    variants: list[StoredImageVariant]


def public_url_for_storage_key(storage_key: str) -> str:
    return f"/uploads/{storage_key}"


def _product_media_directory(product_id: int) -> Path:
    return PRODUCT_MEDIA_DIR / format_product_id(product_id)


def _relative_key(path: Path) -> str:
    return path.relative_to(UPLOADS_ROOT).as_posix()


def _webp_compatible(image: Image.Image) -> Image.Image:
    if image.mode not in ("RGB", "RGBA"):
        return image.convert("RGBA")
    return image


def _save_original(source: Image.Image, destination: Path) -> tuple[int, int, int]:
    image = _webp_compatible(source.copy())
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=86, method=6)
    return image.width, image.height, destination.stat().st_size


def _save_variant(source: Image.Image, destination: Path, kind: MediaVariantKind, size: tuple[int, int]) -> StoredImageVariant:
    variant_image = _webp_compatible(source.copy())
    variant_image.thumbnail(size, Image.Resampling.LANCZOS)

    destination.parent.mkdir(parents=True, exist_ok=True)
    variant_image.save(destination, "WEBP", quality=82, method=6)

    storage_key = _relative_key(destination)
    return StoredImageVariant(
        kind=kind,
        storage_key=storage_key,
        public_url=public_url_for_storage_key(storage_key),
        content_type="image/webp",
        width=variant_image.width,
        height=variant_image.height,
        size_bytes=destination.stat().st_size,
    )


def store_product_media_upload(product_id: int, file: UploadFile) -> StoredProductMedia:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("unsupported_image_type")

    directory = _product_media_directory(product_id)
    directory.mkdir(parents=True, exist_ok=True)

    media_token = uuid.uuid4().hex
    original_path = directory / f"{media_token}-original.webp"
    output_paths = [
        original_path,
        *(directory / f"{media_token}-{kind.value}.webp" for kind in VARIANT_SIZES),
    ]

    try:
        with Image.open(BytesIO(file.file.read())) as opened_image:
            source = ImageOps.exif_transpose(opened_image)
            width, height, size_bytes = _save_original(source, original_path)
            variants = [
                _save_variant(source, directory / f"{media_token}-{kind.value}.webp", kind, size)
                for kind, size in VARIANT_SIZES.items()
            ]
    except Exception as exc:
        for output_path in output_paths:
            output_path.unlink(missing_ok=True)
        raise ValueError("invalid_image_file") from exc

    storage_key = _relative_key(original_path)
    return StoredProductMedia(
        original_filename=file.filename,
        content_type="image/webp",
        storage_key=storage_key,
        public_url=public_url_for_storage_key(storage_key),
        width=width,
        height=height,
        size_bytes=size_bytes,
        variants=variants,
    )


def delete_storage_key(storage_key: str) -> None:
    path = UPLOADS_ROOT / storage_key
    try:
        path.relative_to(UPLOADS_ROOT)
    except ValueError:
        return
    path.unlink(missing_ok=True)
