import { useState } from "react";
import type { AdminOrder } from "../../types/admin";
import { useTranslation } from "react-i18next";
import AdaptivePanel from "../admin/AdaptivePanel";
import type { AdaptivePanelMode } from "../../utils/adaptivePanelMode";
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
  const [mode, setMode] = useState<AdaptivePanelMode>("drawer");
  if (!order) return null;

  return (
    <OrderDetailsPanel
      key={order.orderId}
      order={order}
      kitchenMode={kitchenMode}
      onClose={onClose}
      mode={mode}
      onModeChange={setMode}
    />
  );
}

function OrderDetailsPanel({ order, kitchenMode, onClose, mode, onModeChange }: Omit<Props, "order"> & {
  order: AdminOrder;
  mode: AdaptivePanelMode;
  onModeChange: (mode: AdaptivePanelMode) => void;
}) {
  const { t } = useTranslation("admin");
  const [closing, setClosing] = useState(false);

  return (
    <AdaptivePanel
      ariaLabel={t("orders.drawer.aria", { id: order.orderId })}
      closeLabel={t("orders.drawer.close")}
      closing={closing}
      mode={mode}
      onExited={onClose}
      onModeChange={onModeChange}
      onRequestClose={() => setClosing(true)}
      panelClassName="ad-order-details-panel"
    >
      <header className="order-drawer-header">
        <div>
          <p className="order-drawer-kicker">{t("orders.drawer.order", { id: order.orderId })}</p>
          <h3>{t("orders.drawer.title")}</h3>
        </div>
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
    </AdaptivePanel>
  );
}
