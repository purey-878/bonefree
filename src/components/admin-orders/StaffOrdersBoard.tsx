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
  onInitiateRefund: (order: AdminOrder) => void;
  onUpdateStatus: (orderId: number, status: string) => Promise<void> | void;
};

const columns = [
  {
    id: "needs-payment",
    title: "A aguardar pagamento / pendente",
    statuses: ["pendente"],
    empty: "Nenhum pedido à espera de pagamento",
  },
  {
    id: "in-kitchen",
    title: "Na cozinha / em preparação",
    statuses: ["confirmada", "em_preparacao"],
    empty: "Nenhum pedido ativo na cozinha",
  },
  {
    id: "ready",
    title: "Pronto para entrega",
    statuses: ["pronta"],
    empty: "Nada pronto agora",
  },
  {
    id: "completed",
    title: "Concluídos hoje",
    statuses: ["entregue"],
    empty: "Nenhuma entrega concluída hoje",
  },
  {
    id: "cancelled",
    title: "Cancelados",
    statuses: ["cancelada"],
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

export default function StaffOrdersBoard({ orders, onRefresh, onMarkPaid, onInitiateRefund, onUpdateStatus }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState("all");
  const [collapsedOrderIds, setCollapsedOrderIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState(defaultStaffOrderFilters);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id_carrinho === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const paymentMethods = useMemo(() => Array.from(new Set(orders.map((order) => order.metodo_pagamento).filter(Boolean))) as string[], [orders]);

  const clearAllFilters = () => {
    setQuickFilter("all");
    setFilters(defaultStaffOrderFilters);
    onRefresh();
  };

  const visibleOrders = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return orders.filter((order) => {
      if (quickFilter === "needs-payment" && order.estado !== "pendente") return false;
      if (quickFilter === "queued" && order.estado !== "confirmada") return false;
      if (quickFilter === "preparing" && order.estado !== "em_preparacao") return false;
      if (quickFilter === "ready" && order.estado !== "pronta") return false;
      if (quickFilter === "cancelled" && order.estado !== "cancelada") return false;
      if (quickFilter === "customized" && !hasCustomization(order)) return false;

      if (filters.status && order.estado !== filters.status) return false;
      if (filters.paymentMethod && order.metodo_pagamento !== filters.paymentMethod) return false;

      const created = new Date(order.data_criacao);
      if (filters.dateFrom && created < new Date(`${filters.dateFrom}T00:00:00`)) return false;
      if (filters.dateTo && created > new Date(`${filters.dateTo}T23:59:59`)) return false;

      if (!query) return true;
      const haystack = [
        order.id_carrinho,
        `#${order.id_carrinho}`,
        order.cliente_nome,
        order.cliente_email,
        order.cliente_telefone,
        order.estado,
        order.metodo_pagamento,
        order.estado_pagamento,
        order.fulfillment_method,
        fulfillmentLabel(order),
        handoffLabel(order),
        order.table_number ? `table ${order.table_number}` : "",
        order.items.map((item) => item.nome).join(" "),
      ].join(" ").toLowerCase();

      return haystack.includes(query);
    });
  }, [filters, orders, quickFilter]);

  const grouped = useMemo(() => (
    Object.fromEntries(columns.map((column) => [
      column.id,
      visibleOrders.filter((order) => column.statuses.includes(order.estado)),
    ])) as Record<string, AdminOrder[]>
  ), [visibleOrders]);

  const visibleOrderIds = useMemo(() => visibleOrders.map((order) => order.id_carrinho), [visibleOrders]);
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
              {["pendente", "confirmada", "em_preparacao", "pronta", "entregue", "cancelada"].map((status) => (
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
                const isCollapsed = collapsedOrderIds.has(order.id_carrinho);
                const customizations = orderCustomizations(order);

                return (
                <article
                  key={order.id_carrinho}
                  className={`order-card-v2 order-card-status-${order.estado} ${isCollapsed ? "is-collapsed" : "is-expanded"}`}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button, a, input, select, textarea, summary, details")) return;
                    handleToggleOrderCard(order.id_carrinho);
                  }}
                  onKeyDown={isCollapsed ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleToggleOrderCard(order.id_carrinho);
                    }
                  } : undefined}
                  role={isCollapsed ? "button" : undefined}
                  tabIndex={isCollapsed ? 0 : undefined}
                  aria-label={isCollapsed ? `Expandir pedido ${order.id_carrinho}` : undefined}
                >
                  <header className="order-card-v2-header">
                    <div>
                      <h4>#{order.id_carrinho}</h4>
                      <p>{order.cliente_nome || "Cliente"}</p>
                    </div>
                    <div className="order-card-v2-header-actions">
                      <OrderStatusBadge status={order.estado} />
                      <button
                        type="button"
                        className="order-card-collapse-toggle"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleOrderCard(order.id_carrinho);
                        }}
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? "Expandir" : "Recolher"} pedido ${order.id_carrinho}`}
                        title={isCollapsed ? "Expandir pedido" : "Recolher pedido"}
                      >
                        {isCollapsed ? <ChevronDown size={16} strokeWidth={2.4} /> : <ChevronUp size={16} strokeWidth={2.4} />}
                      </button>
                    </div>
                  </header>

                  <div className="order-card-v2-meta">
                    <OrderAgeBadge order={order} />
                    <span className="order-table-chip">{handoffLabel(order)}</span>
                    <span>{order.total_items} itens</span>
                    <strong className="order-card-v2-price">{formatEuro(order.total ?? 0)}</strong>
                  </div>

                  {!isCollapsed && (
                    <div className="order-card-v2-lines">
                      <span>{order.cliente_telefone || order.cliente_email || "Sem contacto"}</span>
                      <span>{fulfillmentLabel(order)}</span>
                      <span>{paymentLabel(order)}</span>
                    </div>
                  )}

                  {!isCollapsed && order.notas && <p className="order-note-inline">{order.notas}</p>}

                  {!isCollapsed && customizations.length > 0 && (
                    <p className="order-custom-summary">{customizations.length} item(ns) personalizado(s)</p>
                  )}

                  {!isCollapsed && (
                  <div className="order-card-actions">
                    {order.estado === "pendente" && order.metodo_pagamento === "balcao" && order.estado_pagamento !== "pago" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onMarkPaid(order.id_carrinho)}>Confirmar pagamento</button>
                    )}
                    {order.estado === "pendente" && order.estado_pagamento === "pago" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.id_carrinho, "confirmada")}>Enviar para a cozinha</button>
                    )}
                    {order.estado === "pronta" && (
                      <button className="ad-btn ad-btn-primary" onClick={() => onUpdateStatus(order.id_carrinho, "entregue")}>Concluir entrega</button>
                    )}
                    <button className="ad-btn ad-btn-ghost" onClick={() => setSelectedOrderId(order.id_carrinho)}>Ver detalhes</button>
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

      <OrderDetailsDrawer order={selectedOrder} canRefund onInitiateRefund={onInitiateRefund} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}
