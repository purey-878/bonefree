import { API_BASE, authHeaders } from "./api";
import type { Coupon, CouponValidation, CheckoutPayload, OrderResponse } from "../types/checkout";
import { translateUserMessage } from "../utils/messages";

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(translateUserMessage(data.detail || fallback));
  } catch {
    return new Error(translateUserMessage(fallback));
  }
}

function receiptFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get("Content-Disposition");
  if (!disposition) return fallback;

  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].replace(/"/g, ""));
    } catch {
      return fallback;
    }
  }

  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || fallback;
}

export const checkoutService = {
  async createOrder(payload: CheckoutPayload): Promise<OrderResponse> {
    const response = await fetch(`${API_BASE}/checkout/orders`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await parseError(response, "Não foi possível efetuar o pedido.");
    }

    return response.json();
  },

  async downloadReceipt(orderId: number): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`${API_BASE}/checkout/orders/${orderId}/receipt.pdf`, {
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw await parseError(response, "Não foi possível descarregar o recibo.");
    }

    return {
      blob: await response.blob(),
      filename: receiptFilename(response, `receipt-${orderId}.pdf`),
    };
  },

  async getHistory(): Promise<OrderResponse[]> {
    const response = await fetch(`${API_BASE}/checkout/orders/history`, {
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw await parseError(response, "Não foi possível carregar o histórico de pedidos.");
    }

    return response.json();
  },

  async cancelOrder(orderId: number): Promise<OrderResponse> {
    const response = await fetch(`${API_BASE}/checkout/orders/${orderId}/cancel`, {
      method: "POST",
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw await parseError(response, "Não foi possível cancelar o pedido.");
    }

    return response.json();
  },

  async getCoupons(): Promise<Coupon[]> {
    const response = await fetch(`${API_BASE}/checkout/coupons`, {
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw await parseError(response, "Não foi possível carregar os cupões.");
    }

    return response.json();
  },

  async validateCoupon(codigo: string, subtotal: number): Promise<CouponValidation> {
    const response = await fetch(`${API_BASE}/checkout/coupons/validate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ codigo, subtotal }),
    });

    if (!response.ok) {
      throw await parseError(response, "Não foi possível validar o cupão.");
    }

    return response.json();
  },
};
