from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from database import SessionLocal
from core.organizations import bind_session_to_organization
from models import Media, MediaVariant, Product, ProductMedia
from schemas.enums import MediaOwnerType, MediaVariantKind
from services.media_storage import PRODUCT_MEDIA_DIR, UPLOADS_ROOT, public_url_for_storage_key


PRODUCT_FOLDER_PATTERN = re.compile(r"^PRD-(\d+)$")
FILE_SUFFIXES: dict[str, MediaVariantKind | None] = {
    "original": None,
    "thumb": MediaVariantKind.THUMB,
    "card": MediaVariantKind.CARD,
    "detail": MediaVariantKind.DETAIL,
}


class MediaMigrationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ImageFileMetadata:
    path: Path
    storage_key: str
    public_url: str
    width: int
    height: int
    size_bytes: int


@dataclass(frozen=True)
class ProductFolderMedia:
    product_id: int
    folder: Path
    original: ImageFileMetadata
    variants: dict[MediaVariantKind, ImageFileMetadata]


@dataclass(frozen=True)
class MigrationSummary:
    product_folders: int
    media: int
    variants: int
    product_links: int


def _log(message: str) -> None:
    print(message, flush=True)


def _relative_storage_key(path: Path, uploads_root: Path) -> str:
    try:
        return path.relative_to(uploads_root).as_posix()
    except ValueError as exc:
        raise MediaMigrationError(f"Media file is outside uploads: {path}") from exc


def _metadata(path: Path, uploads_root: Path) -> ImageFileMetadata:
    try:
        with Image.open(path) as image:
            width, height = image.size
            image.verify()
    except Exception as exc:
        raise MediaMigrationError(f"Invalid image file: {path}") from exc

    storage_key = _relative_storage_key(path, uploads_root)
    return ImageFileMetadata(
        path=path,
        storage_key=storage_key,
        public_url=public_url_for_storage_key(storage_key),
        width=width,
        height=height,
        size_bytes=path.stat().st_size,
    )


def _single_file_for_suffix(folder: Path, suffix: str) -> Path:
    matches = sorted(
        path
        for path in folder.iterdir()
        if path.is_file() and path.name.endswith(f"-{suffix}.webp")
    )
    if len(matches) != 1:
        raise MediaMigrationError(
            f"{folder.name} must contain exactly one *-{suffix}.webp file; found {len(matches)}."
        )
    return matches[0]


def discover_product_folders(
    *,
    product_media_dir: Path | None = None,
    uploads_root: Path | None = None,
) -> list[ProductFolderMedia]:
    product_media_dir = product_media_dir or PRODUCT_MEDIA_DIR
    uploads_root = uploads_root or UPLOADS_ROOT
    if not product_media_dir.exists():
        return []

    discovered: list[ProductFolderMedia] = []
    seen_product_ids: set[int] = set()
    for folder in sorted(path for path in product_media_dir.iterdir() if path.is_dir()):
        match = PRODUCT_FOLDER_PATTERN.fullmatch(folder.name)
        if match is None:
            continue

        product_id = int(match.group(1))
        if product_id in seen_product_ids:
            raise MediaMigrationError(f"Duplicate product folder for product {product_id}.")
        seen_product_ids.add(product_id)

        files = {
            suffix: _metadata(_single_file_for_suffix(folder, suffix), uploads_root)
            for suffix in FILE_SUFFIXES
        }
        discovered.append(
            ProductFolderMedia(
                product_id=product_id,
                folder=folder,
                original=files["original"],
                variants={
                    variant_kind: files[suffix]
                    for suffix, variant_kind in FILE_SUFFIXES.items()
                    if variant_kind is not None
                },
            )
        )

    return discovered


def _load_products(db: Session, product_ids: set[int]) -> dict[int, Product]:
    if not product_ids:
        return {}
    products = db.scalars(select(Product).where(Product.id.in_(product_ids))).all()
    return {product.id: product for product in products}


def _validate_products_exist(db: Session, folders: list[ProductFolderMedia]) -> dict[int, Product]:
    product_ids = {folder.product_id for folder in folders}
    products = _load_products(db, product_ids)
    missing_ids = sorted(product_ids - set(products))
    if missing_ids:
        formatted = ", ".join(str(product_id) for product_id in missing_ids)
        raise MediaMigrationError(f"Upload folders have no matching product: {formatted}.")
    return products


def _apply_file_metadata(media: Media, metadata: ImageFileMetadata) -> None:
    media.owner_type = MediaOwnerType.PRODUCT
    media.original_filename = metadata.path.name
    media.content_type = "image/webp"
    media.storage_key = metadata.storage_key
    media.public_url = metadata.public_url
    media.width = metadata.width
    media.height = metadata.height
    media.size_bytes = metadata.size_bytes


def _apply_variant_metadata(variant: MediaVariant, kind: MediaVariantKind, metadata: ImageFileMetadata) -> None:
    variant.kind = kind
    variant.storage_key = metadata.storage_key
    variant.public_url = metadata.public_url
    variant.content_type = "image/webp"
    variant.width = metadata.width
    variant.height = metadata.height
    variant.size_bytes = metadata.size_bytes


def _reconcile_database(db: Session, folders: list[ProductFolderMedia]) -> MigrationSummary:
    products = _validate_products_exist(db, folders)
    expected_original_keys = {folder.original.storage_key for folder in folders}

    existing_media = (
        db.scalars(
            select(Media)
            .options(selectinload(Media.variants), selectinload(Media.product_links))
            .where(Media.storage_key.in_(expected_original_keys))
        ).unique().all()
        if expected_original_keys
        else []
    )
    media_by_storage_key = {media.storage_key: media for media in existing_media}

    expected_media_ids: set[int] = set()
    expected_links: set[tuple[int, int]] = set()
    for folder in folders:
        media = media_by_storage_key.get(folder.original.storage_key)
        if media is None:
            media = Media(
                owner_type=MediaOwnerType.PRODUCT,
                original_filename=folder.original.path.name,
                content_type="image/webp",
                storage_key=folder.original.storage_key,
                public_url=folder.original.public_url,
                width=folder.original.width,
                height=folder.original.height,
                size_bytes=folder.original.size_bytes,
            )
            db.add(media)
            db.flush()
            media_by_storage_key[folder.original.storage_key] = media
        else:
            _apply_file_metadata(media, folder.original)

        variants_by_kind = {variant.kind: variant for variant in media.variants}
        for kind, metadata in folder.variants.items():
            variant = variants_by_kind.get(kind)
            if variant is None:
                variant = MediaVariant(media_id=media.id, kind=kind)
                db.add(variant)
            _apply_variant_metadata(variant, kind, metadata)

        for variant in [item for item in media.variants if item.kind not in folder.variants]:
            db.delete(variant)

        expected_media_ids.add(media.id)
        expected_links.add((folder.product_id, media.id))

        link = next(
            (item for item in media.product_links if item.product_id == folder.product_id),
            None,
        )
        if link is None:
            link = ProductMedia(product_id=folder.product_id, media_id=media.id)
            db.add(link)
        link.sort_order = 0
        link.alt_text = products[folder.product_id].name
        link.is_primary = True

    all_links = db.scalars(select(ProductMedia)).all()
    for link in all_links:
        if (link.product_id, link.media_id) not in expected_links:
            db.delete(link)

    db.flush()
    stale_media_statement = select(Media.id).where(Media.owner_type == MediaOwnerType.PRODUCT)
    if expected_media_ids:
        stale_media_statement = stale_media_statement.where(Media.id.not_in(expected_media_ids))
    stale_media_ids = list(db.scalars(stale_media_statement).all())
    if stale_media_ids:
        organization_id = db.info["organization_id"]
        db.execute(
            delete(MediaVariant).where(
                MediaVariant.media_id.in_(stale_media_ids),
                MediaVariant.organization_id == organization_id,
            )
        )
        db.execute(
            delete(Media).where(
                Media.id.in_(stale_media_ids),
                Media.organization_id == organization_id,
            )
        )

    return MigrationSummary(
        product_folders=len(folders),
        media=len(folders),
        variants=len(folders) * 3,
        product_links=len(folders),
    )


def _audit_database(db: Session, folders: list[ProductFolderMedia]) -> MigrationSummary:
    _validate_products_exist(db, folders)
    expected_original_keys = {folder.original.storage_key for folder in folders}
    media_rows = db.scalars(
        select(Media)
        .options(selectinload(Media.variants), selectinload(Media.product_links))
        .where(Media.owner_type == MediaOwnerType.PRODUCT)
    ).unique().all()
    media_by_key = {media.storage_key: media for media in media_rows}

    if set(media_by_key) != expected_original_keys:
        missing = sorted(expected_original_keys - set(media_by_key))
        unexpected = sorted(set(media_by_key) - expected_original_keys)
        raise MediaMigrationError(
            f"Media storage keys do not match uploads; missing={missing}, unexpected={unexpected}."
        )

    for folder in folders:
        media = media_by_key[folder.original.storage_key]
        expected_variants = {
            kind: metadata.storage_key
            for kind, metadata in folder.variants.items()
        }
        actual_variants = {variant.kind: variant.storage_key for variant in media.variants}
        if actual_variants != expected_variants:
            raise MediaMigrationError(f"Variant records do not match files for {folder.folder.name}.")

        matching_links = [
            link
            for link in media.product_links
            if link.product_id == folder.product_id
        ]
        if len(matching_links) != 1:
            raise MediaMigrationError(f"Expected one product link for {folder.folder.name}.")
        link = matching_links[0]
        if link.sort_order != 0 or not link.is_primary:
            raise MediaMigrationError(f"Invalid primary media link for {folder.folder.name}.")

    all_links = db.scalars(select(ProductMedia)).all()
    if len(all_links) != len(folders):
        raise MediaMigrationError("ProductMedia rows do not match upload folders.")

    return MigrationSummary(
        product_folders=len(folders),
        media=len(media_rows),
        variants=sum(len(media.variants) for media in media_rows),
        product_links=len(all_links),
    )


def migrate_product_images_to_media(
    *,
    apply: bool,
    organization_slug: str = "bonefree",
    product_media_dir: Path | None = None,
    uploads_root: Path | None = None,
    session_factory: Callable[[], Session] | None = None,
) -> MigrationSummary:
    product_media_dir = product_media_dir or PRODUCT_MEDIA_DIR
    uploads_root = uploads_root or UPLOADS_ROOT
    session_factory = session_factory or SessionLocal
    folders = discover_product_folders(
        product_media_dir=product_media_dir,
        uploads_root=uploads_root,
    )
    _log(f"Discovered {len(folders)} product media folders in {product_media_dir}.")

    db = session_factory()
    try:
        bind_session_to_organization(db, organization_slug)
        if apply:
            summary = _reconcile_database(db, folders)
            db.commit()
            _log("Media database records reconciled successfully.")
        else:
            summary = _audit_database(db, folders)
            _log("Media database records match the upload folders.")
        return summary
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Register product Media records from existing uploads without changing files."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Validate files and database without writing.")
    mode.add_argument("--apply", action="store_true", help="Create or repair Media database records.")
    parser.add_argument(
        "--organization-slug",
        default="bonefree",
        help="Organization whose catalog media will be reconciled.",
    )
    args = parser.parse_args()

    summary = migrate_product_images_to_media(
        apply=args.apply,
        organization_slug=args.organization_slug,
    )
    _log(
        "Summary: "
        f"folders={summary.product_folders}, media={summary.media}, "
        f"variants={summary.variants}, product_links={summary.product_links}."
    )


if __name__ == "__main__":
    main()
