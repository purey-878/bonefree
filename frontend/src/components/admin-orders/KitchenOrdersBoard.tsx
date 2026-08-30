import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp } from "lucide-react";
import type { AdminOrder } from "../../types/admin";
import OrderAgeBadge from "./OrderAgeBadge";
import OrderDetailsDrawer from "./OrderDetailsDrawer";
import {
  customizationText,
  customizationTone,
  fulfillmentLabel,
  formatOrderStatus,
  handoffLabel,
  hasCustomization,
  visibleCustomizationLines,
} from "./orderUtils";

type Props = {
  orders: AdminOrder[];
  onRefresh: () => void;
  onUpdateStatus: (orderId: number, status: string) => Promise<void> | void;
  readOnly?: boolean;
};

const columns = [
  { id: "confirmed", titleKey: "orders.kitchen.columns.queuedTitle", emptyKey: "orders.kitchen.columns.queuedEmpty" },
  { id: "in_preparation", titleKey: "orders.kitchen.columns.preparingTitle", emptyKey: "orders.kitchen.columns.preparingEmpty" },
  { id: "ready", titleKey: "orders.kitchen.columns.readyTitle", emptyKey: "orders.kitchen.columns.readyEmpty" },
];

export default function KitchenOrdersBoard({ orders, onRefresh, onUpdateStatus, readOnly = false }: Props) {
  const { t } = useTranslation("admin");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState("all");
  const [collapsedColumnIds, setCollapsedColumnIds] = useState<Set<string>>(new Set());

  const selectedOrder = useMemo(
    () => orders.find((order) => order.orderId === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const visibleOrders = useMemo(() => {
    if (quickFilter === "customized") return orders.filter(hasCustomization);
    if (quickFilter !== "all") return orders.filter((order) => order.state === quickFilter);
    return orders;
  }, [orders, quickFilter]);

  const grouped = useMemo(() => (
    Object.fromEntries(columns.map((column) => [
      column.id,
      visibleOrders.filter((order) => order.state === column.id),
    ])) as Record<string, AdminOrder[]>
  ), [visibleOrders]);

  const handleToggleColumn = (columnId: string) => {
    setCollapsedColumnIds((current) => {
      const next = new Set(current);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  };

  return (
    <div className="orders-workspace kitchen-workspace">
      <div className="orders-toolbar">
        <div>
          <h2 className="ad-section-title">{t("orders.kitchen.title")}</h2>
          <p className="orders-toolbar-copy">{t("orders.kitchen.subtitle")}</p>
        </div>
        <button className="ad-btn ad-btn-ghost" onClick={onRefresh}>{t("orders.common.refresh")}</button>
      </div>

      <div className="order-quick-filters" role="group" aria-label={t("orders.kitchen.filters")}>
        {[
          ["all", "orders.common.all"],
          ["confirmed", "orders.common.queued"],
          ["in_preparation", "orders.common.preparing"],
          ["ready", "orders.common.ready"],
          ["customized", "orders.common.customised"],
        ].map(([value, labelKey]) => (
          <button key={value} className={quickFilter === value ? "active" : ""} onClick={() => setQuickFilter(value)}>
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className="orders-kanban orders-kanban-kitchen">
        {columns.map((column) => {
          const columnOrders = grouped[column.id];
          const isColumnCollapsed = collapsedColumnIds.has(column.id);
          const columnToggleLabel = `${t(isColumnCollapsed ? "orders.common.expandAll" : "orders.common.collapseAll")}: ${t(column.titleKey)}`;

          return (
          <section
            key={column.id}
            className={`orders-column orders-column-${column.id} ${columnOrders.length === 0 ? "is-empty" : ""} ${isColumnCollapsed ? "is-collapsed" : ""}`}
            onClick={isColumnCollapsed ? (event) => {
              const target = event.target as HTMLElement;
              if (target.closest("button, a, input, select, textarea")) return;
              handleToggleColumn(column.id);
            } : undefined}
          >
            <header className="orders-column-header">
              <h3>{t(column.titleKey)}</h3>
              <div className="orders-column-header-actions">
                <span>{columnOrders.length}</span>
                <button
                  type="button"
                  className="orders-column-collapse-toggle"
                  onClick={() => handleToggleColumn(column.id)}
                  disabled={columnOrders.length === 0}
                  aria-expanded={!isColumnCollapsed}
                  aria-label={columnToggleLabel}
                  title={columnToggleLabel}
                >
                  <ChevronUp size={15} strokeWidth={2.4} />
                </button>
              </div>
            </header>

            <div className="orders-column-collapsible" aria-hidden={isColumnCollapsed}>
            <div className="orders-column-list">
              {columnOrders.map((order) => (
                <article key={order.orderId} className={`kitchen-order-card kitchen-order-card-${order.state}`}>
                  <header className="kitchen-order-card-header">
                    <div>
                      <h4>#{order.orderId}</h4>
                      <span className="order-table-chip kitchen">{fulfillmentLabel(order)}</span>
                      <span className="order-table-chip kitchen">{handoffLabel(order)}</span>
                    </div>
                    <OrderAgeBadge order={order} />
                  </header>

                  {order.notes && (
                    <div className="order-note-box compact">
                      <strong>{t("orders.kitchen.notes")}</strong>
                      <p>{order.notes}</p>
                    </div>
                  )}

                  <div className="kitchen-item-list">
                    {order.items.map((item, index) => {
                      const lines = visibleCustomizationLines(item.customizationSummary);
                      return (
                        <div key={`${item.productId}-${index}`} className="kitchen-item">
                          <div className="kitchen-item-main">
                            <span>{item.quantity}x</span>
                            <strong>{item.name}</strong>
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

                  <div className="order-card-actions">
                    {!readOnly && order.state === "confirmed" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.orderId, "in_preparation")}>{t("orders.kitchen.start")}</button>
                    )}
                    {!readOnly && order.state === "in_preparation" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.orderId, "ready")}>{t("orders.kitchen.markReady")}</button>
                    )}
                    <button className="ad-btn ad-btn-ghost" onClick={() => setSelectedOrderId(order.orderId)}>{formatOrderStatus(order.state)}</button>
                  </div>
                </article>
              ))}

              {columnOrders.length === 0 && <p className="orders-column-empty">{t(column.emptyKey)}</p>}
            </div>
            </div>
            <div className="orders-column-collapsed-summary" aria-hidden={!isColumnCollapsed}>
              <p className="orders-column-empty">
                {t("orders.common.collapsedColumnSummary", { count: columnOrders.length, state: t(column.titleKey) })}
              </p>
            </div>
          </section>
          );
        })}
      </div>

      <OrderDetailsDrawer order={selectedOrder} kitchenMode onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}
