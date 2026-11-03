import { describe, expect, it } from 'vitest';
import type { AdminProduct, AdminProductPayload } from '../types/admin';
import { buildCatalogProductPayload } from './catalogProduct';

const draft: AdminProductPayload = {
  name: 'Dish', productDescription: 'Updated description', price: 12, available: true,
  categoryId: 1, customizable: true, discountPercentage: 20, menuTags: '', featured: false,
  glutenFree: true, containsAlcohol: false, totalCalories: 100,
  ingredients: [{ ingredientId: 2, type: 'normal', quantity: '50g', includedByDefault: true, removable: false, substitutable: false }],
};
describe('browse-only catalog payloads', () => {
  it('preserves existing ordering fields while updating ordinary catalog data', () => {
    const original = { ...draft, productId: 1, discountPercentage: 5, ingredients: [{ ...draft.ingredients[0], includedByDefault: false, removable: true, substitutable: true }] } as AdminProduct;
    const result = buildCatalogProductPayload(draft, original);
    expect(result.customizable).toBe(true);
    expect(result.discountPercentage).toBe(5);
    expect(result.ingredients[0]).toMatchObject({ includedByDefault: false, removable: true, substitutable: true, quantity: '50g' });
    expect(result).toMatchObject({ productDescription: 'Updated description', price: 12, totalCalories: 100 });
    expect(draft.ingredients[0].removable).toBe(false);
  });
  it('disables ordering options for new products and newly added ingredients', () => {
    const result = buildCatalogProductPayload(draft, null);
    expect(result).toMatchObject({ customizable: false, discountPercentage: 0 });
    expect(result.ingredients[0]).toMatchObject({ includedByDefault: true, removable: false, substitutable: false });
  });
  it('does not reintroduce deliberately removed ingredient associations', () => {
    const original = { ...draft, productId: 1 } as AdminProduct;
    expect(buildCatalogProductPayload({ ...draft, ingredients: [] }, original).ingredients).toEqual([]);
  });
});
