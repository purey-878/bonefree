import type { AdminOrder } from "../../types/admin";
import { formatEuro } from "../../utils/money";
import OrderAgeBadge from "./OrderAgeBadge";
import OrderStatusBadge from "./OrderStatusBadge";
import { customizationText, customizationTone, fulfillmentLabel, handoffLabel, paymentLabel, visibleCustomizationLines } from "./orderUtils";

type Props = {
  order: AdminOrder | null;
  kitchenMode?: boolean;
  onClose: () => void;
};

export default function OrderDetailsDrawer({ order, kitchenMode = false, onClose }: Props) {
  if (!order) return null;

  return (
    <>
      <div className="order-drawer-backdrop" onClick={onClose} />
      <aside className="order-drawer" aria-label={`Detalhes do pedido ${order.orderId}`}>
        <header className="order-drawer-header">
          <div>
            <p className="order-drawer-kicker">Pedido #{order.orderId}</p>
            <h3>Detalhes</h3>
          </div>
          <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={onClose}>Fechar</button>
        </header>

        <div className="order-drawer-meta">
          <OrderStatusBadge status={order.state} />
          <OrderAgeBadge order={order} />
          <span className="order-meta-chip">{fulfillmentLabel(order)}</span>
          <span className="order-meta-chip">{handoffLabel(order)}</span>
          {!kitchenMode && <span className="order-meta-chip">{paymentLabel(order)}</span>}
        </div>

        {!kitchenMode && (
          <section className="order-drawer-section">
            <h4>Cliente</h4>
            <p>{order.customerName || "Cliente"}</p>
            <p>{order.customerPhone || "Sem telefone"}</p>
            <p>{order.customerEmail || "Sem email"}</p>
          </section>
        )}

        <section className="order-drawer-section">
          <h4>Itens</h4>
          <div className="order-drawer-items">
            {order.items.map((item, index) => {
              const lines = visibleCustomizationLines(item.customizationSummary);
              return (
                <div key={`${item.productId}-${index}`} className="order-drawer-item">
                  <div className="order-drawer-item-title">
                    <strong>{item.quantity}x {item.name}</strong>
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
