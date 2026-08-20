import { API_BASE } from "../services/api"

export const productImageFallback = "/assets/images/menu-images/acai.avif"

export function resolveProductImageUrl(image: string | null | undefined, fallback = productImageFallback) {
  if (!image) return fallback
  if (/^(https?:|data:|blob:)/.test(image)) return image
  if (image.startsWith("/uploads/")) return `${API_BASE}${image}`
  if (image.startsWith("uploads/")) return `${API_BASE}/${image}`
  if (image.startsWith("/assets/")) return image
  if (image.startsWith("/menu-images/")) return `/assets/images${image}`
  if (image.startsWith("menu-images/")) return `/assets/images/${image}`
  if (image.startsWith("/")) return `/assets/images${image}`
  return `/assets/images/menu-images/${image}`
}

export function applyApiImageFallback(image: HTMLImageElement, fallback = productImageFallback) {
  if (image.dataset.apiFallbackTried !== "true") {
    const sourceUrl = new URL(image.currentSrc || image.src, window.location.origin)
    const canRetryFromApi =
      sourceUrl.origin === window.location.origin &&
      (sourceUrl.pathname.startsWith("/assets/images/menu-images/") || sourceUrl.pathname.startsWith("/uploads/"))

    if (canRetryFromApi) {
      image.dataset.apiFallbackTried = "true"
      image.src = `${API_BASE}${sourceUrl.pathname}`
      return
    }
  }

  if (!image.src.endsWith(fallback)) image.src = fallback
}
