import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminProduct, AdminProductPayload } from '../types/admin'
import type { ProductMedia } from '../types/product'
import { createProduct, updateProduct, uploadProductMedia } from './adminService'
import { saveProductDraft } from './productEditor'

vi.mock('./adminService', () => ({ createProduct: vi.fn(), updateProduct: vi.fn(), uploadProductMedia: vi.fn() }))

const draft = { name: 'Soup', price: 6, totalCalories: null, ingredients: [] } as unknown as AdminProductPayload
const product = { ...draft, productId: 7, media: [] } as unknown as AdminProduct
const media = (id: number) => ({ mediaId: id, isPrimary: id === 1, sortOrder: id - 1 }) as ProductMedia

describe('product editor save checkpoints', () => {
  beforeEach(() => vi.resetAllMocks())

  it('creates one product and appends all selected images without replacing earlier ones', async () => {
    const files = [new File(['a'], 'one.png'), new File(['b'], 'two.png'), new File(['c'], 'three.png')]
    vi.mocked(createProduct).mockResolvedValue(product)
    vi.mocked(uploadProductMedia).mockImplementation(async (_id, file) => ({ media: media(files.indexOf(file) + 1), message: 'Uploaded' }))
    const checkpoint = vi.fn()
    const uploaded = vi.fn()
    await saveProductDraft(null, draft, files, checkpoint, uploaded)
    expect(createProduct).toHaveBeenCalledTimes(1)
    expect(checkpoint).toHaveBeenCalledWith(product)
    expect(uploaded).toHaveBeenCalledTimes(3)
    files.forEach((file, index) => expect(uploadProductMedia).toHaveBeenNthCalledWith(index + 1, 7, file, false))
  })

  it('retains the created ID and completed uploads so retries do not create a duplicate product', async () => {
    const files = [new File(['a'], 'one.png'), new File(['b'], 'two.png'), new File(['c'], 'three.png')]
    let saved: AdminProduct | null = null
    let pending = [...files]
    const checkpoint = (value: AdminProduct) => { saved = value }
    const uploaded = (file: File, value: ProductMedia) => {
      saved = { ...saved!, media: [...saved!.media, value] }
      pending = pending.filter(item => item !== file)
    }
    vi.mocked(createProduct).mockResolvedValue(product)
    vi.mocked(uploadProductMedia).mockResolvedValueOnce({ media: media(1), message: 'Uploaded' }).mockRejectedValueOnce(new Error('Network error'))
    await expect(saveProductDraft(null, draft, files, checkpoint, uploaded)).rejects.toThrow('two.png')
    expect(pending).toEqual(files.slice(1))
    expect(saved).toMatchObject({ productId: 7, media: [media(1)] })
    vi.mocked(updateProduct).mockResolvedValue(saved!)
    vi.mocked(uploadProductMedia).mockResolvedValueOnce({ media: media(2), message: 'Uploaded' }).mockResolvedValueOnce({ media: media(3), message: 'Uploaded' })
    await saveProductDraft(saved, draft, pending, checkpoint, uploaded)
    expect(createProduct).toHaveBeenCalledTimes(1)
    expect(updateProduct).toHaveBeenCalledWith(7, draft)
    expect(pending).toEqual([])
    expect(saved!.media.map(item => item.mediaId)).toEqual([1, 2, 3])
  })

  it('does not start uploads or change editor state when the product update fails', async () => {
    vi.mocked(updateProduct).mockRejectedValue(new Error('Validation failed'))
    const checkpoint = vi.fn()
    await expect(saveProductDraft(product, draft, [new File(['a'], 'one.png')], checkpoint, vi.fn())).rejects.toThrow('Validation failed')
    expect(checkpoint).not.toHaveBeenCalled()
    expect(uploadProductMedia).not.toHaveBeenCalled()
  })
})
