from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image, ImageOps
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session, joinedload

from database import SessionLocal
from models import Media, MediaVariant, Product, ProductImage, ProductMedia
from schemas.enums import MediaOwnerType, MediaVariantKind
from services.media_storage import PRODUCT_MEDIA_DIR, UPLOADS_ROOT, VARIANT_SIZES, public_url_for_storage_key
from utils.id_format import format_product_id


PROJECT_ROOT = BACKEND_DIR.parent
LEGACY_MENU_IMAGES_ROOT = PROJECT_ROOT / "frontend" / "public" / "assets" / "images" / "menu-images"
LEGACY_FRONTEND_ASSET_ROOT = PROJECT_ROOT / "frontend" / "public" / "assets"
LEGACY_ASSET_ROOT = PROJECT_ROOT / "public" / "assets"
LEGACY_UPLOADS_ROOT = PROJECT_ROOT / "uploads"


@dataclass(frozen=True)
class LegacyProductImage:
    product_id: int
    source_id: str
    image_path: str
    source_label: str
    product_name: str | None = None
    product: Product | None = None
    product_image: ProductImage | None = None
    legacy_product_image_id: int | None = None
    update_legacy_product: bool = False
    create_product_image: bool = False


def _log(message: str) -> None:
    print(message, flush=True)


def _source_path_for_public_url(public_url: str) -> Path | None:
    candidate_paths: list[Path] = []

    if public_url.startswith("/uploads/"):
        candidate_paths.append(LEGACY_UPLOADS_ROOT / public_url.removeprefix("/uploads/"))
    elif public_url.startswith("/assets/images/menu-images/"):
        candidate_paths.append(LEGACY_MENU_IMAGES_ROOT / public_url.removeprefix("/assets/images/menu-images/"))
    elif public_url.startswith("/assets/"):
        relative_path = public_url.removeprefix("/assets/")
        candidate_paths.append(LEGACY_FRONTEND_ASSET_ROOT / relative_path)
        candidate_paths.append(LEGACY_ASSET_ROOT / relative_path)
    elif public_url.startswith("/menu-images/"):
        candidate_paths.append(LEGACY_MENU_IMAGES_ROOT / public_url.removeprefix("/menu-images/"))
    else:
        candidate_paths.extend(
            [
                LEGACY_UPLOADS_ROOT / public_url,
                LEGACY_UPLOADS_ROOT / "images" / public_url,
                LEGACY_MENU_IMAGES_ROOT / public_url,
                LEGACY_FRONTEND_ASSET_ROOT / public_url,
                LEGACY_ASSET_ROOT / public_url,
            ]
        )

    for path in candidate_paths:
        if path.exists():
            return path

    return None


def _relative_storage_key(path: Path) -> str:
    return path.relative_to(UPLOADS_ROOT).as_posix()


def _safe_source_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-") or "image"


def _webp_compatible(image: Image.Image) -> Image.Image:
    if image.mode not in ("RGB", "RGBA"):
        return image.convert("RGBA")
    return image


def _copy_original(source_path: Path, product_id: int, source_id: str) -> Path:
    destination_dir = PRODUCT_MEDIA_DIR / format_product_id(product_id)
    destination_dir.mkdir(parents=True, exist_ok=True)

    destination = destination_dir / f"legacy-{_safe_source_id(source_id)}-original.webp"
    if not destination.exists():
        with Image.open(source_path) as opened_image:
            image = _webp_compatible(ImageOps.exif_transpose(opened_image))
            image.save(destination, "WEBP", quality=86, method=6)
    return destination


def _save_variant(source: Image.Image, destination: Path, kind: MediaVariantKind, size: tuple[int, int]) -> MediaVariant:
    image = _webp_compatible(source.copy())
    image.thumbnail(size, Image.Resampling.LANCZOS)

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=82, method=6)

    storage_key = _relative_storage_key(destination)
    return MediaVariant(
        kind=kind,
        storage_key=storage_key,
        public_url=public_url_for_storage_key(storage_key),
        content_type="image/webp",
        width=image.width,
        height=image.height,
        size_bytes=destination.stat().st_size,
    )


def _table_exists(db: Session, table_name: str) -> bool:
    return inspect(db.get_bind()).has_table(table_name)


def _product_exists(db: Session, product_id: int) -> bool:
    return db.scalar(select(Product.id).where(Product.id == product_id).limit(1)) is not None


def _already_migrated(db: Session, product_id: int, source_id: str) -> bool:
    storage_key_pattern = f"products/{format_product_id(product_id)}/legacy-{_safe_source_id(source_id)}-original%"
    return db.scalar(select(Media.id).where(Media.storage_key.like(storage_key_pattern)).limit(1)) is not None


def _resolved_source_key(image_path: str) -> str | None:
    source_path = _source_path_for_public_url(image_path)
    if source_path is None:
        return None
    try:
        return str(source_path.resolve())
    except OSError:
        return str(source_path)


def _legacy_file_image_path(path: Path) -> str:
    return f"/assets/images/menu-images/{path.name}"


def _legacy_product_names(db: Session) -> dict[int, str | None]:
    if not _table_exists(db, "produto"):
        return {}
    rows = db.execute(text("SELECT id_produto, nome FROM produto ORDER BY id_produto")).mappings().all()
    return {int(row["id_produto"]): row["nome"] for row in rows}


def _legacy_product_images(db: Session) -> list[LegacyProductImage]:
    legacy_images: list[LegacyProductImage] = []
    seen_sources: set[tuple[int, str]] = set()
    legacy_names = _legacy_product_names(db)

    product_images = db.scalars(
        select(ProductImage)
        .options(joinedload(ProductImage.product))
        .join(Product, Product.id == ProductImage.product_id)
        .order_by(ProductImage.product_id.asc(), ProductImage.id.asc())
    ).all()

    for image in product_images:
        legacy_images.append(
            LegacyProductImage(
                product_id=image.product_id,
                source_id=f"product-image-{image.id}",
                image_path=image.image_path,
                source_label=f"product_image {image.id}",
                product_name=image.product.name if image.product else legacy_names.get(image.product_id),
                product=image.product,
                product_image=image,
            )
        )
        source_key = _resolved_source_key(image.image_path)
        if source_key is not None:
            seen_sources.add((image.product_id, source_key))

    products = db.scalars(select(Product).order_by(Product.id.asc())).all()
    product_map = {product.id: product for product in products}
    for product in products:
        if product.image:
            source_key = _resolved_source_key(product.image)
            if source_key is not None and (product.id, source_key) not in seen_sources:
                legacy_images.append(
                    LegacyProductImage(
                        product_id=product.id,
                        source_id=f"product-{product.id}-image",
                        image_path=product.image,
                        source_label="product.image",
                        product_name=product.name,
                        product=product,
                        create_product_image=True,
                    )
                )
                seen_sources.add((product.id, source_key))

    if _table_exists(db, "imagem_produto"):
        rows = db.execute(
            text(
                "SELECT id_imagem, id_produto, caminho_imagem "
                "FROM imagem_produto "
                "ORDER BY id_produto, id_imagem"
            )
        ).mappings().all()
        for row in rows:
            product_id = int(row["id_produto"])
            image_path = row["caminho_imagem"]
            source_key = _resolved_source_key(image_path)
            if source_key is not None:
                if (product_id, source_key) in seen_sources:
                    continue
                seen_sources.add((product_id, source_key))
            image_id = int(row["id_imagem"])
            product = product_map.get(product_id)
            legacy_images.append(
                LegacyProductImage(
                    product_id=product_id,
                    source_id=f"legacy-product-image-{image_id}",
                    image_path=image_path,
                    source_label=f"imagem_produto {image_id}",
                    product_name=product.name if product else legacy_names.get(product_id),
                    product=product,
                    legacy_product_image_id=image_id,
                    create_product_image=product is not None,
                )
            )

    if _table_exists(db, "produto"):
        rows = db.execute(
            text(
                "SELECT id_produto, nome, imagem "
                "FROM produto "
                "WHERE imagem IS NOT NULL AND imagem != '' "
                "ORDER BY id_produto"
            )
        ).mappings().all()
        for row in rows:
            product_id = int(row["id_produto"])
            image_path = row["imagem"]
            source_key = _resolved_source_key(image_path)
            if source_key is not None:
                if (product_id, source_key) in seen_sources:
                    continue
                seen_sources.add((product_id, source_key))
            product = product_map.get(product_id)
            legacy_images.append(
                LegacyProductImage(
                    product_id=product_id,
                    source_id=f"legacy-product-{product_id}-image",
                    image_path=image_path,
                    source_label="produto.imagem",
                    product_name=product.name if product else row["nome"],
                    product=product,
                    update_legacy_product=True,
                    create_product_image=product is not None,
                )
            )

    file_product_ids = sorted(set(product_map) | set(legacy_names))
    for product_id in file_product_ids:
        for source_path in sorted(LEGACY_MENU_IMAGES_ROOT.glob(f"{format_product_id(product_id)}*")):
            if not source_path.is_file():
                continue
            try:
                source_key = str(source_path.resolve())
            except OSError:
                source_key = str(source_path)
            if (product_id, source_key) in seen_sources:
                continue
            product = product_map.get(product_id)
            legacy_images.append(
                LegacyProductImage(
                    product_id=product_id,
                    source_id=f"legacy-product-{product_id}-file-{source_path.stem}",
                    image_path=_legacy_file_image_path(source_path),
                    source_label="legacy file",
                    product_name=product.name if product else legacy_names.get(product_id),
                    product=product,
                    update_legacy_product=product is None,
                    create_product_image=product is not None,
                )
            )
            seen_sources.add((product_id, source_key))

    return legacy_images


def _update_legacy_tables(db: Session, image: LegacyProductImage, migrated_public_url: str) -> None:
    if image.legacy_product_image_id is not None and _table_exists(db, "imagem_produto"):
        db.execute(
            text("UPDATE imagem_produto SET caminho_imagem = :image_path WHERE id_imagem = :image_id"),
            {"image_path": migrated_public_url, "image_id": image.legacy_product_image_id},
        )
    if image.update_legacy_product and _table_exists(db, "produto"):
        db.execute(
            text("UPDATE produto SET imagem = :image_path WHERE id_produto = :product_id"),
            {"image_path": migrated_public_url, "product_id": image.product_id},
        )


def migrate_product_images_to_media() -> None:
    _log("Starting product image migration.")
    _log(f"Backend directory: {BACKEND_DIR}")
    _log(f"Project root: {PROJECT_ROOT}")
    _log(f"Legacy menu images root: {LEGACY_MENU_IMAGES_ROOT}")
    _log(f"Legacy uploads root: {LEGACY_UPLOADS_ROOT}")
    _log(f"Destination product media directory: {PRODUCT_MEDIA_DIR}")

    db = SessionLocal()
    try:
        _log("Loading legacy product images from database and filesystem...")
        images = _legacy_product_images(db)

        total = len(images)
        _log(f"Found {total} legacy product images.")

        migrated = 0
        skipped = 0

        for index, image in enumerate(images, start=1):
            prefix = f"[{index}/{total}] {image.source_label} product {image.product_id}"
            _log(f"{prefix}: processing {image.image_path}")

            if _already_migrated(db, image.product_id, image.source_id):
                skipped += 1
                _log(f"{prefix}: skipped because it was already migrated.")
                continue

            source_path = _source_path_for_public_url(image.image_path)
            if source_path is None:
                skipped += 1
                _log(f"{prefix}: skipped missing source: {image.image_path}")
                continue

            _log(f"{prefix}: source found at {source_path}")

            original_path = _copy_original(source_path, image.product_id, image.source_id)
            storage_key = _relative_storage_key(original_path)
            _log(f"{prefix}: original copied to {original_path}")

            try:
                _log(f"{prefix}: opening image and generating variants...")
                with Image.open(original_path) as opened_image:
                    source = ImageOps.exif_transpose(opened_image)
                    width, height = source.size
                    variants = []
                    safe_source_id = _safe_source_id(image.source_id)
                    for kind, size in VARIANT_SIZES.items():
                        variant_path = original_path.parent / f"legacy-{safe_source_id}-{kind.value}.webp"
                        _log(f"{prefix}: generating {kind.value} variant at {variant_path}")
                        variants.append(_save_variant(source, variant_path, kind, size))
            except Exception as exc:
                skipped += 1
                _log(f"{prefix}: skipped invalid image: {exc}")
                continue

            original_public_url = public_url_for_storage_key(storage_key)
            card_variant = next((variant for variant in variants if variant.kind == MediaVariantKind.CARD), None)
            migrated_public_url = card_variant.public_url if card_variant else original_public_url

            _log(f"{prefix}: creating Media records...")
            media = Media(
                owner_type=MediaOwnerType.PRODUCT,
                original_filename=source_path.name,
                content_type="image/webp",
                storage_key=storage_key,
                public_url=original_public_url,
                width=width,
                height=height,
                size_bytes=original_path.stat().st_size,
                variants=variants,
            )
            db.add(media)
            db.flush()

            if _product_exists(db, image.product_id):
                db.add(
                    ProductMedia(
                        product_id=image.product_id,
                        media_id=media.id,
                        sort_order=0,
                        alt_text=image.product_name,
                        is_primary=True,
                    )
                )
                if image.product_image is not None:
                    image.product_image.image_path = migrated_public_url
                elif image.create_product_image:
                    db.add(ProductImage(product_id=image.product_id, image_path=migrated_public_url))
                if image.product is not None and (image.product.image == image.image_path or not image.product.image):
                    image.product.image = migrated_public_url
            else:
                _log(f"{prefix}: product table has no matching product; skipped ProductMedia link.")

            _update_legacy_tables(db, image, migrated_public_url)
            migrated += 1
            _log(f"{prefix}: migrated to {migrated_public_url}")

        _log("Committing migration changes...")
        db.commit()
        _log(f"Migration completed. Migrated {migrated} product images to media. Skipped {skipped}.")
    except Exception:
        _log("Migration failed. Rolling back database changes...")
        db.rollback()
        raise
    finally:
        db.close()
        _log("Database session closed.")


if __name__ == "__main__":
    migrate_product_images_to_media()
