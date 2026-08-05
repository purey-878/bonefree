import type { ItemCustomization } from "./cart";

export type FulfillmentMethod = "dine_in" | "pickup" | "takeaway";
export type PaymentMethod = "card" | "cash" | "mbway";

export interface CheckoutCustomer {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  nif?: string | null;
  table_number?: number | null;
}

export interface CheckoutItem {
  id_produto: number;
  quantidade: number;
  customizacao?: ItemCustomization | null;
}

export interface CheckoutPayload {
  customer: CheckoutCustomer;
  fulfillment_method: FulfillmentMethod;
  payment_method: PaymentMethod;
  items: CheckoutItem[];
  promo_code?: string | null;
}

export interface Coupon {
  id_cupom: number;
  codigo: string;
  tipo: "VALOR_FIXO" | "PERCENTAGEM";
  valor: number;
  valor_minimo_pedido: number;
  expira_em?: string | null;
}

export interface CouponValidation {
  codigo: string;
  desconto: number;
  valor: number;
  tipo: "VALOR_FIXO" | "PERCENTAGEM";
  valor_minimo_pedido: number;
}

export interface OrderItem {
  id_produto: number;
  id_produto_display: string;
  nome_produto: string;
  preco_unitario: number;
  quantidade: number;
  subtotal: number;
  customizacao?: ItemCustomization | null;
  imagem?: string | null;
  calorias?: number | null;
}

export interface OrderResponse {
  id_pedido: number;
  numero_pedido: string;
  status: string;
  estado_pagamento: string;
  can_cancel: boolean;
  cancellation_source?: string | null;
  cancelled_at?: string | null;
  refund_status?: string;
  refund_amount?: number | null;
  refund_reason?: string | null;
  refund_date?: string | null;
  metodo_entrega: FulfillmentMethod;
  metodo_pagamento: PaymentMethod;
  subtotal: number;
  desconto: number;
  taxa_entrega: number;
  taxa_servico: number;
  total: number;
  cupom_codigo?: string | null;
  cupom_gerado?: string | null;
  data_criacao: string;
  itens: OrderItem[];
}
