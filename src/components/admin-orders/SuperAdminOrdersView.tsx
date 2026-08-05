import { useMemo, useState } from "react";
import { Clock, CreditCard, Store } from "lucide-react";
import type { AdminOrder } from "../../types/admin";
import { formatEuro } from "../../utils/money";
import OrderAgeBadge from "./OrderAgeBadge";
import OrderDetailsDrawer from "./OrderDetailsDrawer";
import OrderStatusBadge from "./OrderStatusBadge";
import { formatOrderAge, formatOrderStatus, fulfillmentLabel, handoffLabel, hasCustomization, isToday, paymentLabel, shouldShowOrderAge } from "./orderUtils";
import CustomSelect from "../ui/CustomSelect";

type Props = {
  orders: AdminOrder[];
  onRefresh: () => void;
  onInitiateRefund: (order: AdminOrder) => void;
  onUpdateStatus: (orderId: number, status: string) => Promise<void> | void;
};

const allStatuses = ["pendente", "confirmada", "em_preparacao", "pronta", "entregue", "cancelada", "reembolsada"];

const defaultOrderFilters = {
  search: "",
  status: "",
  paymentMethod: "",
  paymentStatus: "",
  dateFrom: "",
  dateTo: "",
  customization: "all",
};

function customerInitials(order: AdminOrder): string {
  const name = order.cliente_nome?.trim();
  if (!name) return "CL";
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function paymentParts(order: AdminOrder): { method: string; status: string } {
  const [method = "-", status = "-"] = paymentLabel(order).split(" / ");
  return { method, status };
}

export default function SuperAdminOrdersView({ orders, onRefresh, onInitiateRefund, onUpdateStatus }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState("all");
  const [ordersSectionCollapsed, setOrdersSectionCollapsed] = useState(false);
  const [filters, setFilters] = useState(defaultOrderFilters);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id_carrinho === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const summary = useMemo(() => {
    const todayOrders = orders.filter((order) => isToday(order.data_atualizacao ?? order.data_criacao));
    return {
      pending: orders.filter((order) => order.estado === "pendente").length,
      preparing: orders.filter((order) => order.estado === "em_preparacao").length,
      ready: orders.filter((order) => order.estado === "pronta").length,
      completedToday: todayOrders.filter((order) => order.estado === "entregue").length,
      revenueToday: todayOrders
        .filter((order) => order.estado_pagamento === "pago")
        .reduce((sum, order) => sum + (order.total ?? 0), 0),
    };
  }, [orders]);

  const paymentMethods = useMemo(() => Array.from(new Set(orders.map((order) => order.metodo_pagamento).filter(Boolean))) as string[], [orders]);
  const paymentStatuses = useMemo(() => Array.from(new Set(orders.map((order) => order.estado_pagamento).filter(Boolean))) as string[], [orders]);

  const clearAllFilters = () => {
    setQuickFilter("all");
    setFilters(defaultOrderFilters);
    onRefresh();
  };

  const filteredOrders = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return orders.filter((order) => {
      if (quickFilter === "needs-payment" && order.estado !== "pendente") return false;
      if (quickFilter === "queued" && order.estado !== "confirmada") return false;
      if (quickFilter === "preparing" && order.estado !== "em_preparacao") return false;
      if (quickFilter === "ready" && order.estado !== "pronta") return false;
      if (quickFilter === "cancelled" && order.estado !== "cancelada") return false;
      if (quickFilter === "refunded" && order.estado !== "reembolsada") return false;
      if (quickFilter === "customized" && !hasCustomization(order)) return false;

      if (filters.status && order.estado !== filters.status) return false;
      if (filters.paymentMethod && order.metodo_pagamento !== filters.paymentMethod) return false;
      if (filters.paymentStatus && order.estado_pagamento !== filters.paymentStatus) return false;
      if (filters.customization === "customized" && !hasCustomization(order)) return false;
      if (filters.customization === "plain" && hasCustomization(order)) return false;

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

  return (
    <div className="orders-workspace">
      <div className="orders-toolbar">
        <div>
          <h2 className="ad-section-title">Gestão de pedidos</h2>
          <p className="orders-toolbar-copy">Controlos completos de pedidos, filtros, pagamento e estados.</p>
        </div>
        <div className="orders-toolbar-actions">
          <button className="ad-btn ad-btn-ghost" onClick={() => setOrdersSectionCollapsed((value) => !value)}>
            {ordersSectionCollapsed ? "Expandir tudo" : "Recolher tudo"}
          </button>
          <button className="ad-btn ad-btn-ghost" onClick={onRefresh}>Atualizar</button>
        </div>
      </div>

      <div className="order-summary-grid">
        <div className="order-summary-card"><span>Pendentes</span><strong>{summary.pending}</strong></div>
        <div className="order-summary-card"><span>Em preparação</span><strong>{summary.preparing}</strong></div>
        <div className="order-summary-card"><span>Prontos</span><strong>{summary.ready}</strong></div>
        <div className="order-summary-card"><span>Concluídos hoje</span><strong>{summary.completedToday}</strong></div>
        <div className="order-summary-card"><span>Receita hoje</span><strong>{formatEuro(summary.revenueToday)}</strong></div>
      </div>

      <div className="order-quick-filters" role="group" aria-label="Filtros rápidos de super admin">
        {[
          ["all", "Todos"],
          ["needs-payment", "A aguardar pagamento"],
          ["queued", "Na fila"],
          ["preparing", "Em preparação"],
          ["ready", "Prontos"],
          ["cancelled", "Cancelados"],
          ["refunded", "Reembolsados"],
          ["customized", "Com personalizações"],
        ].map(([value, label]) => (
          <button key={value} className={quickFilter === value ? "active" : ""} onClick={() => setQuickFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      <div className="ad-card order-admin-filters">
        <div className="ad-filter-grid">
          <div className="ad-form-group">
            <label>Pesquisar</label>
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="ID do pedido, cliente, telefone, produto..." />
          </div>
          <div className="ad-form-group">
            <label>Estado</label>
            <CustomSelect className="ad-select" value={filters.status} onChange={(nextValue) => setFilters({ ...filters, status: String(nextValue) })} options={[{ value: "", label: "Todos os estados" }, ...allStatuses.map((status) => ({ value: status, label: formatOrderStatus(status) }))]} />
          </div>
          <div className="ad-form-group">
            <label>Método de pagamento</label>
            <CustomSelect className="ad-select" value={filters.paymentMethod} onChange={(nextValue) => setFilters({ ...filters, paymentMethod: String(nextValue) })} options={[{ value: "", label: "Todos os métodos" }, ...paymentMethods.map((method) => ({ value: method, label: method }))]} />
          </div>
          <div className="ad-form-group">
            <label>Estado do pagamento</label>
            <CustomSelect className="ad-select" value={filters.paymentStatus} onChange={(nextValue) => setFilters({ ...filters, paymentStatus: String(nextValue) })} options={[{ value: "", label: "Todos os pagamentos" }, ...paymentStatuses.map((status) => ({ value: status, label: status }))]} />
          </div>
          <div className="ad-form-group"><label>Data desde</label><input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></div>
          <div className="ad-form-group"><label>Data até</label><input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></div>
          <div className="ad-form-group">
            <label>Personalização</label>
            <CustomSelect className="ad-select" value={filters.customization} onChange={(nextValue) => setFilters({ ...filters, customization: String(nextValue) })} options={[{ value: "all", label: "Todos os pedidos" }, { value: "customized", label: "Com personalizações" }, { value: "plain", label: "Sem personalizações" }]} />
          </div>
          <button type="button" className="ad-btn ad-btn-ghost ad-order-clear" onClick={clearAllFilters}>
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="ad-card order-admin-table-card">
        {ordersSectionCollapsed ? (
          <p className="ad-empty">Os pedidos estão recolhidos. Expanda tudo para ver os cartões e as ações.</p>
        ) : (
        <>
        <div className="order-admin-card-list row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-3">
          {filteredOrders.map((order) => {
            const payment = paymentParts(order);

            return (
              <div key={order.id_carrinho} className="col d-flex">
                <article className="order-admin-card">
                <header className="order-admin-card-head">
                  <h3>Pedido #{order.id_carrinho}</h3>
                  <strong>{order.total_items} {order.total_items === 1 ? "item" : "itens"}</strong>
                </header>

                <div className="order-admin-card-chips">
                  <span className="order-table-chip">{fulfillmentLabel(order)}</span>
                  <OrderStatusBadge status={order.estado} />
                </div>

                <div className="order-admin-card-line">
                  <Store size={16} />
                  <span>{handoffLabel(order)}</span>
                </div>

                <div className="order-admin-card-customer">
                  <span className="order-admin-avatar">{customerInitials(order)}</span>
                  <div>
                    <strong>{order.cliente_nome || "Cliente"}</strong>
                    {order.cliente_telefone && <span>{order.cliente_telefone}</span>}
                    {order.cliente_email && <small>{order.cliente_email}</small>}
                  </div>
                </div>

                <div className="order-admin-card-line order-admin-payment-line">
                  <CreditCard size={16} />
                  <span>{payment.method}</span>
                  <strong className={`order-payment-pill order-payment-${order.estado_pagamento || "unknown"}`}>{payment.status}</strong>
                </div>

                {shouldShowOrderAge(order) && (
                  <div className="order-admin-card-line order-admin-wait-line">
                    <Clock size={16} />
                    <span>À espera {formatOrderAge(order)}</span>
                  </div>
                )}

                <div className="order-admin-card-total">
                  <span>Total</span>
                  <strong>{formatEuro(order.total ?? 0)}</strong>
                </div>

                <div className="order-admin-card-actions">
                  <CustomSelect className="ad-select" value={order.estado} onChange={(nextValue) => onUpdateStatus(order.id_carrinho, String(nextValue))} options={allStatuses.map((status) => ({ value: status, label: formatOrderStatus(status) }))} />
                  {order.estado_pagamento === "pago" && order.estado !== "reembolsada" && (
                    <button className="ad-btn ad-btn-danger" onClick={() => onInitiateRefund(order)}>Reembolsar</button>
                  )}
                  {order.estado !== "cancelada" && (
                    <button className="ad-btn ad-btn-danger" onClick={() => onUpdateStatus(order.id_carrinho, "cancelada")}>Cancelar</button>
                  )}
                  <button className="ad-btn ad-btn-ghost" onClick={() => setSelectedOrderId(order.id_carrinho)}>Detalhes</button>
                </div>
                </article>
              </div>
            );
          })}
        </div>
        <table className="ad-table order-admin-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Entrega</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Pagamento</th>
              <th>Tempo</th>
              <th>Total</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr key={order.id_carrinho}>
                <td><strong>#{order.id_carrinho}</strong><br /><span>{order.total_items} itens</span></td>
                <td>
                  <span className="order-table-chip">{fulfillmentLabel(order)}</span>
                  <br />
                  <span>{handoffLabel(order)}</span>
                </td>
                <td>
                  {order.cliente_nome || "Cliente"}
                  <br />
                  <span>{[order.cliente_telefone, order.cliente_email].filter(Boolean).join(" / ") || "-"}</span>
                </td>
                <td><OrderStatusBadge status={order.estado} /></td>
                <td>{paymentLabel(order)}</td>
                <td><OrderAgeBadge order={order} /></td>
                <td><strong>{formatEuro(order.total ?? 0)}</strong></td>
                <td>
                  <div className="order-admin-actions">
                    <CustomSelect className="ad-select" value={order.estado} onChange={(nextValue) => onUpdateStatus(order.id_carrinho, String(nextValue))} options={allStatuses.map((status) => ({ value: status, label: formatOrderStatus(status) }))} />
                    {order.estado_pagamento === "pago" && order.estado !== "reembolsada" && (
                      <button className="ad-btn ad-btn-sm ad-btn-danger" onClick={() => onInitiateRefund(order)}>Reembolsar</button>
                    )}
                    {order.estado !== "cancelada" && (
                      <button className="ad-btn ad-btn-sm ad-btn-danger" onClick={() => onUpdateStatus(order.id_carrinho, "cancelada")}>Cancelar</button>
                    )}
                    <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => setSelectedOrderId(order.id_carrinho)}>Detalhes</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOrders.length === 0 && <p className="ad-empty">Nenhum pedido corresponde a estes filtros</p>}
        </>
        )}
      </div>

      <OrderDetailsDrawer order={selectedOrder} canRefund onInitiateRefund={onInitiateRefund} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}
