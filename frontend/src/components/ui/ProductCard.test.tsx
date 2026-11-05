import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n, { i18nReady } from '../../i18n';
import { ProductCard } from './ProductCard';

beforeAll(async () => {
  await i18nReady;
  await i18n.changeLanguage('en-GB');
});
describe('browse-only product card', () => {
  it('keeps dish information and navigation without purchase controls', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ id: 1, name: 'Plant burger', description: 'Fresh ingredients', category: 'Burgers', price: 12, available: false, totalCalories: 350, media: [] }} onSelect={vi.fn()} />);
    expect(html).toContain('Plant burger');
    expect(html).toContain('Fresh ingredients');
    expect(html).toContain('Currently unavailable');
    expect(html).toContain('View Plant burger');
    expect(html).toContain('View details');
    expect(html).not.toMatch(/add to|basket|checkout|quantity|customise/i);
  });
});
