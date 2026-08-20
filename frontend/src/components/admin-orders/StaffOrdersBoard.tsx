import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { AdminOrder } from "../../types/admin";
import { formatEuro } from "../../utils/money";
import OrderAgeBadge from "./OrderAgeBadge";
import OrderDetailsDrawer from "./OrderDetailsDrawer";
import OrderStatusBadge from "./OrderStatusBadge";
import {
  formatOrderStatus,
  fulfillmentLabel,
  handoffLabel,
  hasCustomization,
  orderCustomizations,
  paymentLabel,
} from "./orderUtils";

type Props = {
  orders: AdminOrder[];
  onRefresh: () => void;
  onMarkPaid: (orderId: number) => Promise<void> | void;
  onUpdateStatus: (orderId: number, status: string) => Promise<void> | void;
};

const columns = [
  {
    id: "needs-payment",
    title: "A aguardar pagamento / pendente",
    statuses: ["pending"],
    empty: "Nenhum pedido à espera de pagamento",
  },
  {
    id: "in-kitchen",
    title: "Na cozinha / em preparação",
    statuses: ["confirmed", "in_preparation"],
    empty: "Nenhum pedido ativo na cozinha",
  },
  {
    id: "ready",
    title: "Pronto para entrega",
    statuses: ["ready"],
    empty: "Nada pronto agora",
  },
  {
    id: "completed",
    title: "Concluídos hoje",
    statuses: ["delivered"],
    empty: "Nenhuma entrega concluída hoje",
  },
  {
    id: "cancelled",
    title: "Cancelados",
    statuses: ["cancelled"],
    empty: "Nenhum pedido cancelado",
  },
];

const defaultStaffOrderFilters = {
  search: "",
  status: "",
  paymentMethod: "",
  dateFrom: "",
  dateTo: "",
};

export default function StaffOrdersBoard({ orders, onRefresh, onMarkPaid, onUpdateStatus }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState("all");
  const [collapsedOrderIds, setCollapsedOrderIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState(defaultStaffOrderFilters);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.orderId === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const paymentMethods = useMemo(() => Array.from(new Set(orders.map((order) => order.paymentMethod).filter(Boolean))) as string[], [orders]);

  const clearAllFilters = () => {
    setQuickFilter("all");
    setFilters(defaultStaffOrderFilters);
    onRefresh();
  };

  const visibleOrders = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return orders.filter((order) => {
      if (quickFilter === "needs-payment" && order.state !== "pending") return false;
      if (quickFilter === "queued" && order.state !== "confirmed") return false;
      if (quickFilter === "preparing" && order.state !== "in_preparation") return false;
      if (quickFilter === "ready" && order.state !== "ready") return false;
      if (quickFilter === "cancelled" && order.state !== "cancelled") return false;
      if (quickFilter === "customized" && !hasCustomization(order)) return false;

      if (filters.status && order.state !== filters.status) return false;
      if (filters.paymentMethod && order.paymentMethod !== filters.paymentMethod) return false;

      const created = new Date(order.createdAt);
      if (filters.dateFrom && created < new Date(`${filters.dateFrom}T00:00:00`)) return false;
      if (filters.dateTo && created > new Date(`${filters.dateTo}T23:59:59`)) return false;

      if (!query) return true;
      const haystack = [
        order.orderId,
        `#${order.orderId}`,
        order.customerName,
        order.customerEmail,
        order.customerPhone,
        order.state,
        order.paymentMethod,
        order.paymentStatus,
        order.fulfillmentMethod,
        fulfillmentLabel(order),
        handoffLabel(order),
        order.tableNumber ? `table ${order.tableNumber}` : "",
        order.items.map((item) => item.name).join(" "),
      ].join(" ").toLowerCase();

      return haystack.includes(query);
    });
  }, [filters, orders, quickFilter]);

  const grouped = useMemo(() => (
    Object.fromEntries(columns.map((column) => [
      column.id,
      visibleOrders.filter((order) => column.statuses.includes(order.state)),
    ])) as Record<string, AdminOrder[]>
  ), [visibleOrders]);

  const visibleOrderIds = useMemo(() => visibleOrders.map((order) => order.orderId), [visibleOrders]);
  const allVisibleCollapsed = visibleOrderIds.length > 0 && visibleOrderIds.every((orderId) => collapsedOrderIds.has(orderId));

  const handleToggleAllCards = () => {
    setCollapsedOrderIds((current) => {
      const next = new Set(current);
      if (allVisibleCollapsed) {
        visibleOrderIds.forEach((orderId) => next.delete(orderId));
      } else {
        visibleOrderIds.forEach((orderId) => next.add(orderId));
      }
      return next;
    });
  };

  const handleToggleOrderCard = (orderId: number) => {
    setCollapsedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  return (
    <div className="orders-workspace">
      <div className="orders-toolbar">
        <div>
          <h2 className="ad-section-title">Painel de pedidos da equipa</h2>
          <p className="orders-toolbar-copy">Pagamento, progresso da cozinha e entrega num só olhar.</p>
        </div>
        <div className="orders-toolbar-actions">
          <button className="ad-btn ad-btn-ghost" onClick={handleToggleAllCards} disabled={visibleOrderIds.length === 0}>
            {allVisibleCollapsed ? "Expandir tudo" : "Recolher tudo"}
          </button>
          <button className="ad-btn ad-btn-ghost" onClick={onRefresh}>Atualizar</button>
        </div>
      </div>

      <div className="order-quick-filters" role="group" aria-label="Filtros de pedidos da equipa">
        {[
          ["all", "Todos"],
          ["needs-payment", "A aguardar pagamento"],
          ["queued", "Na fila"],
          ["preparing", "Em preparação"],
          ["ready", "Prontos"],
          ["cancelled", "Cancelados"],
          ["customized", "Com personalizações"],
        ].map(([value, label]) => (
          <button key={value} className={quickFilter === value ? "active" : ""} onClick={() => setQuickFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      <div className="ad-card order-admin-filters staff-order-filters">
        <div className="ad-filter-grid">
          <div className="ad-form-group">
            <label>Pesquisar</label>
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="ID do pedido, cliente, telefone..." />
          </div>
          <div className="ad-form-group">
            <label>Estado</label>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Todos os estados</option>
              {["pending", "confirmed", "in_preparation", "ready", "delivered", "cancelled"].map((status) => (
                <option key={status} value={status}>{formatOrderStatus(status)}</option>
              ))}
            </select>
          </div>
          <div className="ad-form-group">
            <label>Pagamento</label>
            <select value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}>
              <option value="">Todos os métodos</option>
              {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </div>
          <div className="ad-form-group"><label>Data desde</label><input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></div>
          <div className="ad-form-group"><label>Data até</label><input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></div>
          <button type="button" className="ad-btn ad-btn-ghost ad-order-clear" onClick={clearAllFilters}>
            Clear all filters
          </button>
        </div>
      </div>

      <div className="orders-kanban orders-kanban-staff">
        {columns.map((column) => (
          <section key={column.id} className={`orders-column orders-column-${column.id}`}>
            <header className="orders-column-header">
              <h3>{column.title}</h3>
              <span>{grouped[column.id].length}</span>
            </header>

            <div className="orders-column-list">
              {grouped[column.id].map((order) => {
                const isCollapsed = collapsedOrderIds.has(order.orderId);
                const customizations = orderCustomizations(order);

                return (
                <article
                  key={order.orderId}
                  className={`order-card-v2 order-card-status-${order.state} ${isCollapsed ? "is-collapsed" : "is-expanded"}`}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button, a, input, select, textarea, summary, details")) return;
                    handleToggleOrderCard(order.orderId);
                  }}
                  onKeyDown={isCollapsed ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleToggleOrderCard(order.orderId);
                    }
                  } : undefined}
                  role={isCollapsed ? "button" : undefined}
                  tabIndex={isCollapsed ? 0 : undefined}
                  aria-label={isCollapsed ? `Expandir pedido ${order.orderId}` : undefined}
                >
                  <header className="order-card-v2-header">
                    <div>
                      <h4>#{order.orderId}</h4>
                      <p>{order.customerName || "Cliente"}</p>
                    </div>
                    <div className="order-card-v2-header-actions">
                      <OrderStatusBadge status={order.state} />
                      <button
                        type="button"
                        className="order-card-collapse-toggle"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleOrderCard(order.orderId);
                        }}
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? "Expandir" : "Recolher"} pedido ${order.orderId}`}
                        title={isCollapsed ? "Expandir pedido" : "Recolher pedido"}
                      >
                        {isCollapsed ? <ChevronDown size={16} strokeWidth={2.4} /> : <ChevronUp size={16} strokeWidth={2.4} />}
                      </button>
                    </div>
                  </header>

                  <div className="order-card-v2-meta">
                    <OrderAgeBadge order={order} />
                    <span className="order-table-chip">{handoffLabel(order)}</span>
                    <span>{order.totalItems} itens</span>
                    <strong className="order-card-v2-price">{formatEuro(order.total ?? 0)}</strong>
                  </div>

                  {!isCollapsed && (
                    <div className="order-card-v2-lines">
                      <span>{order.customerPhone || order.customerEmail || "Sem contacto"}</span>
                      <span>{fulfillmentLabel(order)}</span>
                      <span>{paymentLabel(order)}</span>
                    </div>
                  )}

                  {!isCollapsed && order.notes && <p className="order-note-inline">{order.notes}</p>}

                  {!isCollapsed && customizations.length > 0 && (
                    <p className="order-custom-summary">{customizations.length} item(ns) personalizado(s)</p>
                  )}

                  {!isCollapsed && (
                  <div className="order-card-actions">
                    {order.state === "pending" && order.paymentMethod === "counter" && order.paymentStatus !== "paid" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onMarkPaid(order.orderId)}>Confirmar pagamento</button>
                    )}
                    {order.state === "pending" && order.paymentStatus === "paid" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.orderId, "confirmed")}>Enviar para a cozinha</button>
                    )}
                    {order.state === "ready" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.orderId, "delivered")}>Concluir entrega</button>
                    )}
                    <button className="ad-btn ad-btn-ghost" onClick={() => setSelectedOrderId(order.orderId)}>Ver detalhes</button>
                  </div>
                  )}
                </article>
                );
              })}

              {grouped[column.id].length === 0 && <p className="orders-column-empty">{column.empty}</p>}
            </div>
          </section>
        ))}
      </div>

      <OrderDetailsDrawer order={selectedOrder} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}
