import type { AdminOrder } from "../../types/admin";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("admin");
  if (!order) return null;

  return (
    <>
      <div className="order-drawer-backdrop" onClick={onClose} />
      <aside className="order-drawer" aria-label={t("orders.drawer.aria", { id: order.orderId })}>
        <header className="order-drawer-header">
          <div>
            <p className="order-drawer-kicker">{t("orders.drawer.order", { id: order.orderId })}</p>
            <h3>{t("orders.drawer.title")}</h3>
          </div>
          <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={onClose}>{t("orders.drawer.close")}</button>
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
            <h4>{t("orders.drawer.customer")}</h4>
            <p>{order.customerName || t("orders.common.customer")}</p>
            <p>{order.customerPhone || t("orders.drawer.noPhone")}</p>
            <p>{order.customerEmail || t("orders.drawer.noEmail")}</p>
          </section>
        )}

        <section className="order-drawer-section">
          <h4>{t("orders.drawer.items")}</h4>
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
            <span>{t("orders.drawer.total")}</span>
            <strong>{formatEuro(order.total ?? 0)}</strong>
          </footer>
        )}
      </aside>
    </>
  );
}
