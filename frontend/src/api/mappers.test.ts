import { describe, expect, it } from 'vitest';

import { toDomain, toDto } from './mappers';

describe('DTO/domain mappers', () => {
  it('maps nested snake_case DTOs to camelCase domain values', () => {
    expect(toDomain({
      order_id: 42,
      customer: { first_name: 'Maria', last_name: 'Silva' },
      line_items: [{ product_id: 7, unit_price: 9.5 }],
    })).toEqual({
      orderId: 42,
      customer: { firstName: 'Maria', lastName: 'Silva' },
      lineItems: [{ productId: 7, unitPrice: 9.5 }],
    });
  });

  it('maps camelCase payloads to snake_case and omits undefined values', () => {
    expect(toDto({
      fulfillmentMethod: 'takeaway',
      promoCode: undefined,
      customer: { firstName: 'Maria', taxId: null },
    })).toEqual({
      fulfillment_method: 'takeaway',
      customer: { first_name: 'Maria', tax_id: null },
    });
  });

  it('does not traverse binary values', () => {
    const blob = new Blob(['receipt'], { type: 'application/pdf' });
    expect(toDomain(blob)).toBe(blob);
    expect(toDto(blob)).toBe(blob);
  });
});
