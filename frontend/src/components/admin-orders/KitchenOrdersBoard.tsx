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
  { id: "confirmada", title: "Na fila", empty: "Nada em fila" },
  { id: "em_preparacao", title: "Em preparação", empty: "Nada em preparação agora" },
  { id: "pronta", title: "Prontos", empty: "Nenhum pedido pronto" },
];

export default function KitchenOrdersBoard({ orders, onRefresh, onUpdateStatus }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState("all");

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id_carrinho === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const visibleOrders = useMemo(() => {
    if (quickFilter === "customized") return orders.filter(hasCustomization);
    if (quickFilter !== "all") return orders.filter((order) => order.estado === quickFilter);
    return orders;
  }, [orders, quickFilter]);

  const grouped = useMemo(() => (
    Object.fromEntries(columns.map((column) => [
      column.id,
      visibleOrders.filter((order) => order.estado === column.id),
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
          ["confirmada", "Na fila"],
          ["em_preparacao", "Em preparação"],
          ["pronta", "Prontos"],
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
                <article key={order.id_carrinho} className={`kitchen-order-card kitchen-order-card-${order.estado}`}>
                  <header className="kitchen-order-card-header">
                    <div>
                      <h4>#{order.id_carrinho}</h4>
                      <span className="order-table-chip kitchen">{fulfillmentLabel(order)}</span>
                      <span className="order-table-chip kitchen">{handoffLabel(order)}</span>
                    </div>
                    <OrderAgeBadge order={order} />
                  </header>

                  {order.notas && (
                    <div className="order-note-box compact">
                      <strong>Notas</strong>
                      <p>{order.notas}</p>
                    </div>
                  )}

                  <div className="kitchen-item-list">
                    {order.items.map((item, index) => {
                      const lines = visibleCustomizationLines(item.customizacao_resumo);
                      return (
                        <div key={`${item.id_produto}-${index}`} className="kitchen-item">
                          <div className="kitchen-item-main">
                            <span>{item.quantidade}x</span>
                            <strong>{item.nome}</strong>
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
                    {order.estado === "confirmada" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.id_carrinho, "em_preparacao")}>Começar preparação</button>
                    )}
                    {order.estado === "em_preparacao" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.id_carrinho, "pronta")}>Marcar como pronto</button>
                    )}
                    <button className="ad-btn ad-btn-ghost" onClick={() => setSelectedOrderId(order.id_carrinho)}>{formatOrderStatus(order.estado)}</button>
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
