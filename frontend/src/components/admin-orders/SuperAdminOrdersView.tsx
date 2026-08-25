import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  onUpdateStatus: (orderId: number, status: string) => Promise<void> | void;
};

const allStatuses = ["pending", "confirmed", "in_preparation", "ready", "delivered", "cancelled"];

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
  const name = order.customerName?.trim();
  if (!name) return "CL";
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function paymentParts(order: AdminOrder): { method: string; status: string } {
  const [method = "-", status = "-"] = paymentLabel(order).split(" / ");
  return { method, status };
}

export default function SuperAdminOrdersView({ orders, onRefresh, onUpdateStatus }: Props) {
  const { t } = useTranslation("admin");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState("all");
  const [ordersSectionCollapsed, setOrdersSectionCollapsed] = useState(false);
  const [filters, setFilters] = useState(defaultOrderFilters);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.orderId === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const summary = useMemo(() => {
    const todayOrders = orders.filter((order) => isToday(order.updatedAt ?? order.createdAt));
    return {
      pending: orders.filter((order) => order.state === "pending").length,
      preparing: orders.filter((order) => order.state === "in_preparation").length,
      ready: orders.filter((order) => order.state === "ready").length,
      completedToday: todayOrders.filter((order) => order.state === "delivered").length,
      revenueToday: todayOrders
        .filter((order) => order.paymentStatus === "paid")
        .reduce((sum, order) => sum + (order.total ?? 0), 0),
    };
  }, [orders]);

  const paymentMethods = useMemo(() => Array.from(new Set(orders.map((order) => order.paymentMethod).filter(Boolean))) as string[], [orders]);
  const paymentStatuses = useMemo(() => Array.from(new Set(orders.map((order) => order.paymentStatus).filter(Boolean))) as string[], [orders]);

  const clearAllFilters = () => {
    setQuickFilter("all");
    setFilters(defaultOrderFilters);
    onRefresh();
  };

  const filteredOrders = useMemo(() => {
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
      if (filters.paymentStatus && order.paymentStatus !== filters.paymentStatus) return false;
      if (filters.customization === "customized" && !hasCustomization(order)) return false;
      if (filters.customization === "plain" && hasCustomization(order)) return false;

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

  return (
    <div className="orders-workspace">
      <div className="orders-toolbar">
        <div>
          <h2 className="ad-section-title">{t("orders.super.title")}</h2>
          <p className="orders-toolbar-copy">{t("orders.super.subtitle")}</p>
        </div>
        <div className="orders-toolbar-actions">
          <button className="ad-btn ad-btn-ghost" onClick={() => setOrdersSectionCollapsed((value) => !value)}>
            {ordersSectionCollapsed ? t("orders.common.expandAll") : t("orders.common.collapseAll")}
          </button>
          <button className="ad-btn ad-btn-ghost" onClick={onRefresh}>{t("orders.common.refresh")}</button>
        </div>
      </div>

      <div className="order-summary-grid">
        <div className="order-summary-card"><span>{t("orders.super.summary.pending")}</span><strong>{summary.pending}</strong></div>
        <div className="order-summary-card"><span>{t("orders.super.summary.preparing")}</span><strong>{summary.preparing}</strong></div>
        <div className="order-summary-card"><span>{t("orders.super.summary.ready")}</span><strong>{summary.ready}</strong></div>
        <div className="order-summary-card"><span>{t("orders.super.summary.completedToday")}</span><strong>{summary.completedToday}</strong></div>
        <div className="order-summary-card"><span>{t("orders.super.summary.revenueToday")}</span><strong>{formatEuro(summary.revenueToday)}</strong></div>
      </div>

      <div className="order-quick-filters" role="group" aria-label={t("orders.super.quickFilters")}>
        {[
          ["all", "orders.common.all"],
          ["needs-payment", "orders.staff.columns.paymentTitle"],
          ["queued", "orders.common.queued"],
          ["preparing", "orders.common.preparing"],
          ["ready", "orders.common.ready"],
          ["cancelled", "orders.common.cancelled"],
          ["customized", "orders.common.customised"],
        ].map(([value, labelKey]) => (
          <button key={value} className={quickFilter === value ? "active" : ""} onClick={() => setQuickFilter(value)}>
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className="ad-card order-admin-filters">
        <div className="ad-filter-grid">
          <div className="ad-form-group">
            <label>{t("orders.common.search")}</label>
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder={t("orders.common.searchPlaceholderFull")} />
          </div>
          <div className="ad-form-group">
            <label>{t("orders.common.state")}</label>
            <CustomSelect className="ad-select" value={filters.status} onChange={(nextValue) => setFilters({ ...filters, status: String(nextValue) })} options={[{ value: "", label: t("orders.status.all") }, ...allStatuses.map((status) => ({ value: status, label: formatOrderStatus(status) }))]} />
          </div>
          <div className="ad-form-group">
            <label>{t("orders.common.paymentMethod")}</label>
            <CustomSelect className="ad-select" value={filters.paymentMethod} onChange={(nextValue) => setFilters({ ...filters, paymentMethod: String(nextValue) })} options={[{ value: "", label: t("orders.payment.allMethods") }, ...paymentMethods.map((method) => ({ value: method, label: method }))]} />
          </div>
          <div className="ad-form-group">
            <label>{t("orders.common.paymentStatus")}</label>
            <CustomSelect className="ad-select" value={filters.paymentStatus} onChange={(nextValue) => setFilters({ ...filters, paymentStatus: String(nextValue) })} options={[{ value: "", label: t("orders.payment.allPayments") }, ...paymentStatuses.map((status) => ({ value: status, label: status }))]} />
          </div>
          <div className="ad-form-group"><label>{t("orders.common.dateFrom")}</label><input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></div>
          <div className="ad-form-group"><label>{t("orders.common.dateTo")}</label><input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></div>
          <div className="ad-form-group">
            <label>{t("orders.super.customization")}</label>
            <CustomSelect className="ad-select" value={filters.customization} onChange={(nextValue) => setFilters({ ...filters, customization: String(nextValue) })} options={[{ value: "all", label: t("orders.super.allOrders") }, { value: "customized", label: t("orders.super.withCustomisations") }, { value: "plain", label: t("orders.super.withoutCustomisations") }]} />
          </div>
          <button type="button" className="ad-btn ad-btn-ghost ad-order-clear" onClick={clearAllFilters}>
            {t("orders.common.clearFilters")}
          </button>
        </div>
      </div>

      <div className="ad-card order-admin-table-card">
        {ordersSectionCollapsed ? (
          <p className="ad-empty">{t("orders.super.collapsed")}</p>
        ) : (
        <>
        <div className="order-admin-card-list row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-3">
          {filteredOrders.map((order) => {
            const payment = paymentParts(order);

            return (
              <div key={order.orderId} className="col d-flex">
                <article className="order-admin-card">
                <header className="order-admin-card-head">
                  <h3>{t("orders.super.order", { id: order.orderId })}</h3>
                  <strong>{t("orders.common.items", { count: order.totalItems })}</strong>
                </header>

                <div className="order-admin-card-chips">
                  <span className="order-table-chip">{fulfillmentLabel(order)}</span>
                  <OrderStatusBadge status={order.state} />
                </div>

                <div className="order-admin-card-line">
                  <Store size={16} />
                  <span>{handoffLabel(order)}</span>
                </div>

                <div className="order-admin-card-customer">
                  <span className="order-admin-avatar">{customerInitials(order)}</span>
                  <div>
                    <strong>{order.customerName || t("orders.common.customer")}</strong>
                    {order.customerPhone && <span>{order.customerPhone}</span>}
                    {order.customerEmail && <small>{order.customerEmail}</small>}
                  </div>
                </div>

                <div className="order-admin-card-line order-admin-payment-line">
                  <CreditCard size={16} />
                  <span>{payment.method}</span>
                  <strong className={`order-payment-pill order-payment-${order.paymentStatus || "unknown"}`}>{payment.status}</strong>
                </div>

                {shouldShowOrderAge(order) && (
                  <div className="order-admin-card-line order-admin-wait-line">
                    <Clock size={16} />
                    <span>{t("orders.super.waiting", { age: formatOrderAge(order) })}</span>
                  </div>
                )}

                <div className="order-admin-card-total">
                  <span>{t("orders.common.total")}</span>
                  <strong>{formatEuro(order.total ?? 0)}</strong>
                </div>

                <div className="order-admin-card-actions">
                  <CustomSelect className="ad-select" value={order.state} onChange={(nextValue) => onUpdateStatus(order.orderId, String(nextValue))} options={allStatuses.map((status) => ({ value: status, label: formatOrderStatus(status) }))} />
                  {order.state !== "cancelled" && (
                    <button className="ad-btn ad-btn-danger" onClick={() => onUpdateStatus(order.orderId, "cancelled")}>{t("orders.common.cancel")}</button>
                  )}
                  <button className="ad-btn ad-btn-ghost" onClick={() => setSelectedOrderId(order.orderId)}>{t("orders.common.details")}</button>
                </div>
                </article>
              </div>
            );
          })}
        </div>
        <table className="ad-table order-admin-table">
          <thead>
            <tr>
              <th>{t("orders.super.table.order")}</th>
              <th>{t("orders.super.table.delivery")}</th>
              <th>{t("orders.super.table.customer")}</th>
              <th>{t("orders.super.table.status")}</th>
              <th>{t("orders.super.table.payment")}</th>
              <th>{t("orders.super.table.time")}</th>
              <th>{t("orders.super.table.total")}</th>
              <th>{t("orders.super.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr key={order.orderId}>
                <td><strong>#{order.orderId}</strong><br /><span>{t("orders.common.items", { count: order.totalItems })}</span></td>
                <td>
                  <span className="order-table-chip">{fulfillmentLabel(order)}</span>
                  <br />
                  <span>{handoffLabel(order)}</span>
                </td>
                <td>
                  {order.customerName || t("orders.common.customer")}
                  <br />
                  <span>{[order.customerPhone, order.customerEmail].filter(Boolean).join(" / ") || "-"}</span>
                </td>
                <td><OrderStatusBadge status={order.state} /></td>
                <td>{paymentLabel(order)}</td>
                <td><OrderAgeBadge order={order} /></td>
                <td><strong>{formatEuro(order.total ?? 0)}</strong></td>
                <td>
                  <div className="order-admin-actions">
                    <CustomSelect className="ad-select" value={order.state} onChange={(nextValue) => onUpdateStatus(order.orderId, String(nextValue))} options={allStatuses.map((status) => ({ value: status, label: formatOrderStatus(status) }))} />
                    {order.state !== "cancelled" && (
                      <button className="ad-btn ad-btn-sm ad-btn-danger" onClick={() => onUpdateStatus(order.orderId, "cancelled")}>{t("orders.common.cancel")}</button>
                    )}
                    <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => setSelectedOrderId(order.orderId)}>{t("orders.common.details")}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOrders.length === 0 && <p className="ad-empty">{t("orders.super.empty")}</p>}
        </>
        )}
      </div>

      <OrderDetailsDrawer order={selectedOrder} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}
