import type { AdminOrder } from "../../types/admin";
import { formatEuro } from "../../utils/money";
import OrderAgeBadge from "./OrderAgeBadge";
import OrderStatusBadge from "./OrderStatusBadge";
import { customizationText, customizationTone, fulfillmentLabel, handoffLabel, paymentLabel, visibleCustomizationLines } from "./orderUtils";

type Props = {
  order: AdminOrder | null;
  kitchenMode?: boolean;
  canRefund?: boolean;
  onInitiateRefund?: (order: AdminOrder) => void;
  onClose: () => void;
};

export default function OrderDetailsDrawer({ order, kitchenMode = false, canRefund = false, onInitiateRefund, onClose }: Props) {
  if (!order) return null;
  const refundAvailable = canRefund && !kitchenMode && order.estado_pagamento === "pago" && order.estado !== "reembolsada";

  return (
    <>
      <div className="order-drawer-backdrop" onClick={onClose} />
      <aside className="order-drawer" aria-label={`Detalhes do pedido ${order.id_carrinho}`}>
        <header className="order-drawer-header">
          <div>
            <p className="order-drawer-kicker">Pedido #{order.id_carrinho}</p>
            <h3>Detalhes</h3>
          </div>
          <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={onClose}>Fechar</button>
        </header>

        <div className="order-drawer-meta">
          <OrderStatusBadge status={order.estado} />
          <OrderAgeBadge order={order} />
          <span className="order-meta-chip">{fulfillmentLabel(order)}</span>
          <span className="order-meta-chip">{handoffLabel(order)}</span>
          {!kitchenMode && <span className="order-meta-chip">{paymentLabel(order)}</span>}
        </div>

        {!kitchenMode && (
          <section className="order-drawer-section">
            <h4>Estado do reembolso</h4>
            <p>{order.refund_status ?? "Nenhum"}</p>
            {order.refund_id && (
              <div className="order-refund-audit">
                <span>Processado por: {order.refund_processed_by}</span>
                <span>Cargo: {order.refund_processed_by_role}</span>
                <span>Valor reembolsado: {formatEuro(order.refund_amount ?? 0)}</span>
                <span>Motivo: {order.refund_reason}</span>
                <span>Data: {order.refund_date ? new Date(order.refund_date).toLocaleString("pt-PT") : "-"}</span>
              </div>
            )}
            {refundAvailable && (
              <button className="ad-btn ad-btn-primary" onClick={() => onInitiateRefund?.(order)}>Iniciar reembolso</button>
            )}
          </section>
        )}

        {!kitchenMode && (
          <section className="order-drawer-section">
            <h4>Cliente</h4>
            <p>{order.cliente_nome || "Cliente"}</p>
            <p>{order.cliente_telefone || "Sem telefone"}</p>
            <p>{order.cliente_email || "Sem email"}</p>
          </section>
        )}

        <section className="order-drawer-section">
          <h4>Itens</h4>
          <div className="order-drawer-items">
            {order.items.map((item, index) => {
              const lines = visibleCustomizationLines(item.customizacao_resumo);
              return (
                <div key={`${item.id_produto}-${index}`} className="order-drawer-item">
                  <div className="order-drawer-item-title">
                    <strong>{item.quantidade}x {item.nome}</strong>
                    {!kitchenMode && <span>{formatEuro(item.total)}</span>}
                  </div>
                  {lines.length > 0 && (
                    <div className="order-customization-chips">
                      {lines.map((line) => {
                        const chip = customizationText(line);
                        return (
                          <span key={line} className={`order-custom-chip order-custom-chip-${customizationTone(line)}`}>
                            <strong>{chip.label}</strong> {chip.value}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {!kitchenMode && (
          <footer className="order-drawer-total">
            <span>Total</span>
            <strong>{formatEuro(order.total ?? 0)}</strong>
          </footer>
        )}
      </aside>
    </>
  );
}
