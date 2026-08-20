import type { ItemCustomization } from './cart';

export type FulfillmentMethod = 'dine_in' | 'pickup' | 'takeaway';
export type PaymentMethod = 'card' | 'cash' | 'mbway' | 'qr_pay';

export interface CheckoutCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  taxId?: string | null;
  tableNumber?: number | null;
}

export interface CheckoutItem { productId: number; quantity: number; customization?: ItemCustomization | null; }

export interface CheckoutPayload {
  customer: CheckoutCustomer;
  fulfillmentMethod: FulfillmentMethod;
  paymentMethod: PaymentMethod;
  items: CheckoutItem[];
  promoCode?: string | null;
}

export interface Coupon { couponId: number; code: string; type: 'fixed_value' | 'percentage'; value: number; minimumOrderValue: number; expiresAt?: string | null; }
export interface CouponValidation { code: string; discount: number; value: number; type: 'fixed_value' | 'percentage'; minimumOrderValue: number; }

export interface OrderItem {
  productId: number;
  productDisplayId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  customization?: ItemCustomization | null;
  image?: string | null;
  calories?: number | null;
}

export interface OrderResponse {
  orderId: number;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  canCancel: boolean;
  cancellationSource?: string | null;
  cancelledAt?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  refundReason?: string | null;
  refundDate?: string | null;
  deliveryMethod: FulfillmentMethod;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  couponCode?: string | null;
  generatedCoupon?: string | null;
  createdAt: string;
  items: OrderItem[];
}
