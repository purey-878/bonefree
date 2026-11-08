import { beforeAll, describe, expect, it } from 'vitest';
import i18n, { i18nReady } from '../i18n';
import { formatProductPrices, formatSizePrice } from './pricing';

beforeAll(async () => { await i18nReady; await i18n.changeLanguage('en-GB'); });
const size = (label: string, price: number, isAvailable = true) => ({ label, price, isAvailable });
const spaces = (value: string) => value.replace(/\s/g, ' ');

describe('explicit size rates', () => {
  it('shows both prices instead of a starting price or repeated size labels', () => {
    expect(spaces(formatProductPrices({ price: 10, portions: [size('3 pieces', 10), size('6 peças', 15)] }))).toBe('3 × €10.00 · 6 × €15.00');
    expect(spaces(formatSizePrice(size('6 Stück', 15)))).toBe('6 × €15.00');
  });
  it('keeps named sizes meaningful and does not invent a quantity', () => {
    expect(spaces(formatSizePrice(size('Large taco platter', 15)))).toBe('Large taco platter · €15.00');
  });
  it('preserves single prices, free sizes and unavailable-size handling', () => {
    expect(formatProductPrices({ price: 9.5 })).toBe('€9.50');
    expect(spaces(formatProductPrices({ portions: [size('3', 0)] }))).toBe('3 × €0.00');
    expect(formatProductPrices({ price: 99, portions: [size('3', 10, false)] })).toBe('—');
    expect(spaces(formatProductPrices({ portions: [size('3', 10, false), size('6', 15)] }))).toBe('6 × €15.00');
  });
  it('keeps cards compact when there are more than two available sizes', () => {
    expect(spaces(formatProductPrices({ portions: [size('3', 10), size('6', 15), size('9', 20)] }))).toBe('3 × €10.00 · 6 × €15.00 +1');
  });
});
