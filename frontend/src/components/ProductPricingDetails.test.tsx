import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n, { i18nReady } from '../i18n';
import ProductPricingDetails from './ProductPricingDetails';
import PricingOptionsEditor from './admin/PricingOptionsEditor';
import { displayedProductPrice, formatCatalogPrice, pricingOptionsInvalid } from '../utils/pricing';
import { ProductCard } from './ui/ProductCard';

beforeAll(async () => { await i18nReady; await i18n.changeLanguage('en-GB'); });
const portions = [{ id: 1, label: '3 pieces', price: 8.5, isAvailable: true }, { id: 2, label: '6 pieces', price: 15, isAvailable: false }];
const extras = [{ label: 'Sweet potato instead of regular fries', priceDelta: 1, type: 'replacement' as const, isAvailable: true }, { label: 'Cheese', priceDelta: 1.5, type: 'addon' as const, isAvailable: true }];

describe('informational catalog pricing', () => {
  it('shows portion totals and separates replacements from add-ons without purchase controls', () => {
    const html = renderToStaticMarkup(<ProductPricingDetails portions={portions} extras={extras} />);
    expect(html).toContain('3 pieces'); expect(html).toContain('6 pieces');
    expect(html).toContain('Currently unavailable');
    expect(html).toContain('Replacement upgrades'); expect(html).toContain('Optional extras');
    expect(html).toContain('Sweet potato instead of regular fries');
    expect(html).toMatch(/\+.*1[,.]00/);
    expect(html).not.toMatch(/<button|<input|cart|checkout|quantity/i);
  });
  it('adds no detail section for legacy products', () => {
    expect(renderToStaticMarkup(<ProductPricingDetails />)).toBe('');
  });
  it('uses the supplied backend price on cards and only summarizes available options', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ id: 1, name: 'Tacos', category: 'Food', price: 8.5, portions, extras }} />);
    expect(html).not.toContain('From'); expect(html).toContain('×'); expect(html).not.toContain('6 pieces');
    expect(html).toContain('Extras available'); expect(html).not.toContain('Sweet potato');
    expect(html).toMatch(/8[,.]50/);
    const legacy = renderToStaticMarkup(<ProductCard product={{ id: 2, name: 'Pasta', category: 'Food', price: 9.5 }} />);
    expect(legacy).not.toContain('From'); expect(legacy).not.toContain('Extras available');
  });
  it('keeps admin option controls and label translations in the existing editor', () => {
    const html = renderToStaticMarkup(<PricingOptionsEditor portions={portions} extras={extras} locale="en-GB" onLocaleChange={vi.fn()} onPortionsChange={vi.fn()} onExtrasChange={vi.fn()} />);
    expect(html).toContain('Total price'); expect(html).toContain('Additional price');
    expect(html).toContain('Replacement'); expect(html).toContain('Add-on');
    expect(html).toContain('Move 3 pieces up'); expect(html).toContain('Remove Cheese');
    expect(html).toContain('lang="en-GB"'); expect(html).toContain('Add size');
  });
  it('validates unique source labels and finite non-negative cent prices, including free options', () => {
    expect(pricingOptionsInvalid([], [])).toBe(false);
    expect(pricingOptionsInvalid([{ label: 'Free', price: 0, isAvailable: true }], [])).toBe(false);
    for (const price of [-1, NaN, Infinity, 1.001, 100000000]) expect(pricingOptionsInvalid([{ label: 'A', price, isAvailable: true }])).toBe(true);
    expect(pricingOptionsInvalid([{ label: ' ', price: 1, isAvailable: true }])).toBe(true);
    expect(pricingOptionsInvalid([{ label: 'A', price: 1, isAvailable: true }, { label: ' a ', price: 2, isAvailable: false }])).toBe(true);
    expect(pricingOptionsInvalid([], [{ label: 'Sauce', priceDelta: 0, type: 'addon', isAvailable: true }])).toBe(false);
  });
  it('uses backend-derived admin prices without falling back to a base price when all portions are unavailable', () => {
    expect(formatCatalogPrice(null)).toBe('—');
    expect(formatCatalogPrice(0)).toMatch(/0[,.]00/);
    expect(displayedProductPrice({ price: 9.5 })).toBe(9.5);
    expect(displayedProductPrice({ price: 99, portions, effectiveStartingPrice: 8.5 })).toBe(8.5);
    expect(displayedProductPrice({ price: 99, portions, effectiveStartingPrice: null })).toBeNull();
  });
  it('translates pricing labels in all supported languages', async () => {
    for (const [locale, heading] of [['pt-PT', 'Tamanhos'], ['en-GB', 'Sizes'], ['de-DE', 'Größen']]) {
      await i18n.changeLanguage(locale);
      expect(renderToStaticMarkup(<ProductPricingDetails portions={portions} />)).toContain(heading);
    }
    await i18n.changeLanguage('en-GB');
  });
});
