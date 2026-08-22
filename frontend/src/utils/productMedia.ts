import type { MediaVariantKind, ProductMedia } from '../types/product';

export function primaryProductMedia(media: ProductMedia[] | null | undefined): ProductMedia | null {
  if (!media?.length) return null;
  return media.find((item) => item.isPrimary)
    ?? [...media].sort((left, right) => left.sortOrder - right.sortOrder || left.mediaId - right.mediaId)[0]
    ?? null;
}

export function productMediaUrl(
  media: ProductMedia | null | undefined,
  kind: MediaVariantKind,
): string | null {
  if (!media) return null;
  return media.variants?.find((variant) => variant.kind === kind)?.url ?? media.originalUrl ?? null;
}

export function primaryProductMediaUrl(
  media: ProductMedia[] | null | undefined,
  kind: MediaVariantKind,
): string | null {
  return productMediaUrl(primaryProductMedia(media), kind);
}
