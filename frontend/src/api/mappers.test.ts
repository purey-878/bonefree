import { describe, expect, it } from 'vitest';

import { toDomain, toDto } from './mappers';

describe('DTO/domain mappers', () => {
  it('maps nested snake_case DTOs to camelCase domain values', () => {
    expect(toDomain({
      category_id: 42,
      category: { display_name: 'Soup', sort_order: 2 },
      catalog_items: [{ product_id: 7, unit_price: 9.5 }],
    })).toEqual({
      categoryId: 42,
      category: { displayName: 'Soup', sortOrder: 2 },
      catalogItems: [{ productId: 7, unitPrice: 9.5 }],
    });
  });

  it('maps camelCase payloads to snake_case and omits undefined values', () => {
    expect(toDto({
      menuTags: 'Vegan',
      description: undefined,
      ingredient: { displayName: 'Tofu', caloriesPerGram: null },
    })).toEqual({
      menu_tags: 'Vegan',
      ingredient: { display_name: 'Tofu', calories_per_gram: null },
    });
  });

  it('does not traverse binary values', () => {
    const blob = new Blob(['image'], { type: 'image/webp' });
    expect(toDomain(blob)).toBe(blob);
    expect(toDto(blob)).toBe(blob);
  });
});

describe('catalog translation serialization', () => {
  it('preserves locale keys while mapping nested API fields', () => {
    const draft = { translations: { 'en-GB': { name: 'Soup', menuTags: 'Vegan' }, 'de-DE': null } };
    const dto = toDto(draft);
    expect(dto).toEqual({ translations: { 'en-GB': { name: 'Soup', menu_tags: 'Vegan' }, 'de-DE': null } });
    expect(toDomain(dto)).toEqual(draft);
  });
});
