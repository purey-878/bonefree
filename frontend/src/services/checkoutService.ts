import {
  checkoutCancelOrder,
  checkoutClaimGuestOrders,
  checkoutCreateOrder,
  checkoutDownloadOrderReceiptPdf,
  checkoutGetOrder,
  checkoutListAvailableCoupons,
  checkoutListOrderHistory,
  checkoutValidateCoupon,
} from '../api/generated';
import type { CheckoutRequest, GuestOrderClaimRequest } from '../api/generated';
import { apiData, customerApiClient } from '../api/clients';
import { toDomain, toDto } from '../api/mappers';
import type { CheckoutPayload, Coupon, CouponValidation, GuestOrderClaimInput, GuestOrderClaimResult, OrderCreateResponse, OrderResponse } from '../types/checkout';
import type { Page, PageRequest } from '../types/pagination';

function orderAccessHeaders(accessToken?: string | null) {
  return accessToken ? { 'X-Order-Token': accessToken } : undefined;
}

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
  async createOrder(payload: CheckoutPayload): Promise<OrderCreateResponse> {
    const body = toDto<CheckoutRequest>({ ...payload, paymentMethod: 'counter' });
    return toDomain<OrderCreateResponse>(await apiData(checkoutCreateOrder({
      body,
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async downloadReceipt(orderId: number, accessToken?: string | null): Promise<{ blob: Blob; filename: string }> {
    const result = await checkoutDownloadOrderReceiptPdf({
      path: { order_id: orderId },
      headers: orderAccessHeaders(accessToken),
      client: customerApiClient,
      throwOnError: true,
    });
    return {
      blob: result.data instanceof Blob ? result.data : new Blob([result.data]),
      filename: contentDispositionFilename(result.response, `receipt-${orderId}.pdf`),
    };
  },

  async getHistory(options: PageRequest = {}): Promise<Page<OrderResponse>> {
    return toDomain<Page<OrderResponse>>(await apiData(checkoutListOrderHistory({
      query: { page: options.page, per_page: options.perPage },
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async getAllHistory(): Promise<OrderResponse[]> {
    const first = await this.getHistory({ page: 1, perPage: 100 });
    const items = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) {
      items.push(...(await this.getHistory({ page, perPage: 100 })).items);
    }
    return items;
  },

  async claimGuestOrders(orders: GuestOrderClaimInput[]): Promise<GuestOrderClaimResult> {
    const body = toDto<GuestOrderClaimRequest>({ orders });
    return toDomain<GuestOrderClaimResult>(await apiData(checkoutClaimGuestOrders({
      body,
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async getOrder(orderId: number, accessToken?: string | null): Promise<OrderResponse> {
    return toDomain<OrderResponse>(await apiData(checkoutGetOrder({
      path: { order_id: orderId },
      headers: orderAccessHeaders(accessToken),
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async cancelOrder(orderId: number, accessToken?: string | null): Promise<OrderResponse> {
    return toDomain<OrderResponse>(await apiData(checkoutCancelOrder({
      path: { order_id: orderId },
      headers: orderAccessHeaders(accessToken),
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async getCoupons(options: PageRequest = {}): Promise<Page<Coupon>> {
    return toDomain<Page<Coupon>>(await apiData(checkoutListAvailableCoupons({
      query: { page: options.page, per_page: options.perPage },
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async getAllCoupons(): Promise<Coupon[]> {
    const first = await this.getCoupons({ page: 1, perPage: 100 });
    const items = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) {
      items.push(...(await this.getCoupons({ page, perPage: 100 })).items);
    }
    return items;
  },

  async validateCoupon(code: string, subtotal: number): Promise<CouponValidation> {
    return toDomain<CouponValidation>(await apiData(checkoutValidateCoupon({
      body: { code, subtotal },
      client: customerApiClient,
      throwOnError: true,
    })));
  },
};
