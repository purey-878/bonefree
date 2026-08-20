import { useMemo, useState } from "react";
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
};

const columns = [
  { id: "confirmed", title: "Na fila", empty: "Nada em fila" },
  { id: "in_preparation", title: "Em preparação", empty: "Nada em preparação agora" },
  { id: "ready", title: "Prontos", empty: "Nenhum pedido pronto" },
];

export default function KitchenOrdersBoard({ orders, onRefresh, onUpdateStatus }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState("all");

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

  return (
    <div className="orders-workspace kitchen-workspace">
      <div className="orders-toolbar">
        <div>
          <h2 className="ad-section-title">Ecrã da cozinha</h2>
          <p className="orders-toolbar-copy">Cartões de preparação grandes, sem ruído de pagamento ou cliente.</p>
        </div>
        <button className="ad-btn ad-btn-ghost" onClick={onRefresh}>Atualizar</button>
      </div>

      <div className="order-quick-filters" role="group" aria-label="Filtros de pedidos da cozinha">
        {[
          ["all", "Todos"],
          ["confirmed", "Na fila"],
          ["in_preparation", "Em preparação"],
          ["ready", "Prontos"],
          ["customized", "Com personalizações"],
        ].map(([value, label]) => (
          <button key={value} className={quickFilter === value ? "active" : ""} onClick={() => setQuickFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      <div className="orders-kanban orders-kanban-kitchen">
        {columns.map((column) => (
          <section key={column.id} className={`orders-column orders-column-${column.id}`}>
            <header className="orders-column-header">
              <h3>{column.title}</h3>
              <span>{grouped[column.id].length}</span>
            </header>

            <div className="orders-column-list">
              {grouped[column.id].map((order) => (
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
                      <strong>Notas</strong>
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
                    {order.state === "confirmed" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.orderId, "in_preparation")}>Começar preparação</button>
                    )}
                    {order.state === "in_preparation" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.orderId, "ready")}>Marcar como pronto</button>
                    )}
                    <button className="ad-btn ad-btn-ghost" onClick={() => setSelectedOrderId(order.orderId)}>{formatOrderStatus(order.state)}</button>
                  </div>
                </article>
              ))}

              {grouped[column.id].length === 0 && <p className="orders-column-empty">{column.empty}</p>}
            </div>
          </section>
        ))}
      </div>

      <OrderDetailsDrawer order={selectedOrder} kitchenMode onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}
