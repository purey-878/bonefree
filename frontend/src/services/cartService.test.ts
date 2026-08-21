import { beforeEach, describe, expect, it, vi } from 'vitest';

import { guestCartService, hasUnavailableCartItems, normalizeCustomization } from './cartService';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('guest cart domain logic', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent: vi.fn() },
    });
  });

  it('normalizes and deduplicates customizations', () => {
    expect(normalizeCustomization({
      remove: [' Onion ', 'onion'],
      add: [],
      preferences: [],
      note: '  well done  ',
      removedIngredients: [8, 3, 8, -1],
      extras: [{ optionId: 4, quantity: 2 }, { optionId: 0, quantity: 1 }],
      substitutions: [{ originalIngredientId: 3, newIngredientId: 5 }],
      finalUnitPrice: 12,
    })).toEqual({
      remove: ['Onion'],
      add: [],
      preferences: [],
      note: 'well done',
      removedIngredients: [3, 8],
      extras: [{ optionId: 4, quantity: 2 }],
      substitutions: [{ originalIngredientId: 3, newIngredientId: 5 }],
      finalUnitPrice: 12,
    });
  });

  it('keeps separately customized guest items and caps each line at 99', () => {
    guestCartService.addItem(10, 60, null);
    guestCartService.addItem(10, 60, null);
    guestCartService.addItem(10, 1, {
      remove: ['onion'], add: [], preferences: [], note: null,
      removedIngredients: [], extras: [], substitutions: [], finalUnitPrice: null,
    });

    expect(guestCartService.get()).toEqual([
      { productId: 10, quantity: 99, customization: null },
      expect.objectContaining({ productId: 10, quantity: 1 }),
    ]);
  });

  it('blocks checkout only when a resolved cart line is unavailable', () => {
    expect(hasUnavailableCartItems([{ productId: 10, quantity: 1 }])).toBe(false);
    expect(hasUnavailableCartItems([{
      cartProductId: 1,
      productId: 10,
      productDisplayId: 'P10',
      name: 'Dish',
      price: 10,
      quantity: 1,
      available: false,
      unavailableReason: 'Currently unavailable',
      subtotal: 10,
    }])).toBe(true);
  });
});
