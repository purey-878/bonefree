import { API_BASE } from "../services/api"

export const productImageFallback = "/assets/images/menu-images/acai.avif"

export function useApiImageFallback(image: HTMLImageElement, fallback = productImageFallback) {
  if (image.dataset.apiFallbackTried !== "true") {
    const sourceUrl = new URL(image.currentSrc || image.src, window.location.origin)
    if (sourceUrl.origin === window.location.origin && sourceUrl.pathname.startsWith("/assets/images/menu-images/")) {
      image.dataset.apiFallbackTried = "true"
      image.src = `${API_BASE}${sourceUrl.pathname}`
      return
    }
  }

  if (!image.src.endsWith(fallback)) image.src = fallback
}
