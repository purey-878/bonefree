import type { AdminProduct, AdminProductPayload } from '../types/admin';

/** Keep legacy ordering fields compatible without exposing ordering editors. */
export function buildCatalogProductPayload(draft: AdminProductPayload, original: AdminProduct | null): AdminProductPayload {
  return {
    ...draft,
    customizable: original?.customizable ?? false,
    discountPercentage: original?.discountPercentage ?? 0,
    ingredients: draft.ingredients.map(ingredient => {
      const previous = original?.ingredients.find(item => ingredient.ingredientId != null && item.ingredientId === ingredient.ingredientId);
      return {
        ...ingredient,
        includedByDefault: previous?.includedByDefault ?? true,
        removable: previous?.removable ?? false,
        substitutable: previous?.substitutable ?? false,
      };
    }),
  };
}
