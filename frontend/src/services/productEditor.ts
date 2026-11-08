import type { AdminProduct, AdminProductPayload } from '../types/admin'
import type { ProductMedia } from '../types/product'
import { createProduct, updateProduct, uploadProductMedia } from './adminService'

/** Product data and each image are separate API transactions. Checkpoint each
 * success so a retry continues with the saved product and remaining files. */
export async function saveProductDraft(
  original: AdminProduct | null,
  payload: AdminProductPayload,
  files: readonly File[],
  onSaved: (product: AdminProduct) => void,
  onUploaded: (file: File, media: ProductMedia) => void,
) {
  const saved = original
    ? await updateProduct(original.productId, payload)
    : await createProduct(payload)
  onSaved(saved)
  for (const file of files) {
    try {
      const { media } = await uploadProductMedia(saved.productId, file, false)
      onUploaded(file, media)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Upload failed.'
      throw new Error(`Product saved, but "${file.name}" could not be uploaded. Retry to upload the remaining images. ${detail}`)
    }
  }
  return saved
}
