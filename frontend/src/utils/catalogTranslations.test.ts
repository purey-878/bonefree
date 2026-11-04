import { describe, expect, it } from 'vitest';
import { catalogText, editCatalogTranslation } from './catalogTranslations';
import { buildCatalogProductPayload } from './catalogProduct';
import type { AdminProductPayload } from '../types/admin';

describe('catalog translation drafts', () => {
  it('keeps independent unsaved language drafts and the Portuguese source when tabs change', () => {
    const original = { name: 'Cogumelos', description: 'Prato portugues', menuTags: 'Caseiro' };
    const english = editCatalogTranslation(undefined, 'en-GB', 'name', 'Mushrooms');
    const german = editCatalogTranslation(english, 'de-DE', 'name', 'Pilze');
    const descriptions = editCatalogTranslation(german, 'en-GB', 'description', 'English draft');
    expect(catalogText(original, descriptions, 'pt-PT')).toEqual(original);
    expect(catalogText(original, descriptions, 'en-GB')).toEqual({ name: 'Mushrooms', description: 'English draft' });
    expect(catalogText(original, descriptions, 'de-DE')).toEqual({ name: 'Pilze' });
    expect(english).toEqual({ 'en-GB': { name: 'Mushrooms' } });
  });
  it('keeps missing translations blank for editing and explicitly clears an empty locale only', () => {
    expect(catalogText({ name: 'Original' }, undefined, 'en-GB')).toEqual({});
    const draft = { 'en-GB': { name: 'English' }, 'de-DE': { name: 'Deutsch' } };
    expect(editCatalogTranslation(draft, 'en-GB', 'name', '  ')).toEqual({ 'en-GB': null, 'de-DE': { name: 'Deutsch' } });
  });
  it('includes translations in catalog saves while preserving the legacy product fields', () => {
    const draft: AdminProductPayload = { name: 'Prato', productDescription: 'Original', price: 10, available: true, categoryId: 1, customizable: false, menuTags: 'Vegan', featured: false, discountPercentage: 0, glutenFree: true, containsAlcohol: false, ingredients: [], translations: { 'en-GB': { name: 'Dish', menuTags: 'Plant-based' } } };
    expect(buildCatalogProductPayload(draft, null).translations).toEqual(draft.translations);
    expect(buildCatalogProductPayload(draft, null).name).toBe('Prato');
  });
});
