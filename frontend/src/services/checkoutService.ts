import {
  checkoutCancelOrder,
  checkoutCreateOrder,
  checkoutDownloadOrderReceiptPdf,
  checkoutListAvailableCoupons,
  checkoutListOrderHistory,
  checkoutValidateCoupon,
} from '../api/generated';
import type { CheckoutRequest } from '../api/generated';
import { apiData, customerApiClient } from '../api/clients';
import { toDomain, toDto } from '../api/mappers';
import type { CheckoutPayload, Coupon, CouponValidation, OrderResponse } from '../types/checkout';

export function contentDispositionFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition');
  if (!disposition) return fallback;
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].replace(/"/g, ''));
    } catch {
      return fallback;
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallback;
}

export const checkoutService = {
  async createOrder(payload: CheckoutPayload): Promise<OrderResponse> {
    const body = toDto<CheckoutRequest>({ ...payload, paymentMethod: 'counter' });
    return toDomain<OrderResponse>(await apiData(checkoutCreateOrder({
      body,
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async downloadReceipt(orderId: number): Promise<{ blob: Blob; filename: string }> {
    const result = await checkoutDownloadOrderReceiptPdf({
      path: { order_id: orderId },
      client: customerApiClient,
      throwOnError: true,
    });
    return {
      blob: result.data instanceof Blob ? result.data : new Blob([result.data]),
      filename: contentDispositionFilename(result.response, `receipt-${orderId}.pdf`),
    };
  },

  async getHistory(): Promise<OrderResponse[]> {
    return toDomain<OrderResponse[]>(await apiData(checkoutListOrderHistory({
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async cancelOrder(orderId: number): Promise<OrderResponse> {
    return toDomain<OrderResponse>(await apiData(checkoutCancelOrder({
      path: { order_id: orderId },
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async getCoupons(): Promise<Coupon[]> {
    return toDomain<Coupon[]>(await apiData(checkoutListAvailableCoupons({
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async validateCoupon(code: string, subtotal: number): Promise<CouponValidation> {
    return toDomain<CouponValidation>(await apiData(checkoutValidateCoupon({
      body: { code, subtotal },
      client: customerApiClient,
      throwOnError: true,
    })));
  },
};
