import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, CreditCard, Store } from "lucide-react";
import type { AdminOrder } from "../../types/admin";
import { formatEuro } from "../../utils/money";
import OrderAgeBadge from "./OrderAgeBadge";
import OrderDetailsDrawer from "./OrderDetailsDrawer";
import OrderStatusBadge from "./OrderStatusBadge";
import { formatOrderAge, formatOrderStatus, fulfillmentLabel, handoffLabel, localDateInputValue, paymentLabel, shouldShowOrderAge } from "./orderUtils";
import CustomSelect from "../ui/CustomSelect";
import { formatPaymentMethod, formatPaymentStatus } from "../../utils/adminEnumLabels";
import { Pagination } from "../ui";

export type ManagementOrderFilters = {
  search: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  dateFrom: string;
  dateTo: string;
  customization: string;
};

type Props = {
  orders: AdminOrder[];
  onRefresh: () => void;
  onUpdateStatus: (orderId: number, status: string) => Promise<void> | void;
  onDelete: (orderId: number) => Promise<void> | void;
  onFiltersChange: (filters: ManagementOrderFilters) => void;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  summary: { pending: number; preparing: number; ready: number; completed: number; revenue: number };
};

const allStatuses = ["pending", "confirmed", "in_preparation", "ready", "delivered", "cancelled"];

const emptyOrderFilters = {
  search: "",
  status: "",
  paymentMethod: "",
  paymentStatus: "",
  dateFrom: "",
  dateTo: "",
  customization: "all",
};

const initialOrderFilters = () => {
  const today = localDateInputValue();
  return { ...emptyOrderFilters, dateFrom: today, dateTo: today };
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

export default function SuperAdminOrdersView({ orders, onRefresh, onUpdateStatus, onDelete, onFiltersChange, page, perPage, total, totalPages, onPageChange, onPerPageChange, summary: serverSummary }: Props) {
  const { t } = useTranslation("admin");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState("all");
  const [ordersSectionCollapsed, setOrdersSectionCollapsed] = useState(false);
  const [filters, setFilters] = useState(initialOrderFilters);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.orderId === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => onFiltersChange(filters), 350);
    return () => window.clearTimeout(timer);
  }, [filters, onFiltersChange]);

  const paymentMethods = useMemo(() => Array.from(new Set(orders.map((order) => order.paymentMethod).filter(Boolean))) as string[], [orders]);
  const paymentStatuses = useMemo(() => Array.from(new Set(orders.map((order) => order.paymentStatus).filter(Boolean))) as string[], [orders]);

  const clearAllFilters = () => {
    setQuickFilter("all");
    setFilters(emptyOrderFilters);
  };

  const filteredOrders = orders;

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
        <div className="order-summary-card"><span>{t("orders.super.summary.pending")}</span><strong>{serverSummary.pending}</strong></div>
        <div className="order-summary-card"><span>{t("orders.super.summary.preparing")}</span><strong>{serverSummary.preparing}</strong></div>
        <div className="order-summary-card"><span>{t("orders.super.summary.ready")}</span><strong>{serverSummary.ready}</strong></div>
        <div className="order-summary-card"><span>{t("orders.super.summary.completedToday")}</span><strong>{serverSummary.completed}</strong></div>
        <div className="order-summary-card"><span>{t("orders.super.summary.revenueToday")}</span><strong>{formatEuro(serverSummary.revenue)}</strong></div>
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
          <button key={value} className={quickFilter === value ? "active" : ""} onClick={() => {
            setQuickFilter(value);
            setFilters((current) => ({
              ...current,
              status: value === "needs-payment" ? "pending" : value === "queued" ? "confirmed" : value === "preparing" || value === "ready" || value === "cancelled" ? value : "",
              customization: value === "customized" ? "customized" : "all",
            }));
          }}>
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className="ad-card order-admin-filters management-order-filters">
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
            <CustomSelect className="ad-select" value={filters.paymentMethod} onChange={(nextValue) => setFilters({ ...filters, paymentMethod: String(nextValue) })} options={[{ value: "", label: t("orders.payment.allMethods") }, ...paymentMethods.map((method) => ({ value: method, label: formatPaymentMethod(method) }))]} />
          </div>
          <div className="ad-form-group">
            <label>{t("orders.common.paymentStatus")}</label>
            <CustomSelect className="ad-select" value={filters.paymentStatus} onChange={(nextValue) => setFilters({ ...filters, paymentStatus: String(nextValue) })} options={[{ value: "", label: t("orders.payment.allPayments") }, ...paymentStatuses.map((status) => ({ value: status, label: formatPaymentStatus(status) }))]} />
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
                  {order.state === "cancelled" && (
                    <button className="ad-btn ad-btn-danger" onClick={() => onDelete(order.orderId)}>{t("orders.common.delete")}</button>
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
                    {order.state === "cancelled" && (
                      <button className="ad-btn ad-btn-sm ad-btn-danger" onClick={() => onDelete(order.orderId)}>{t("orders.common.delete")}</button>
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

      <Pagination variant="admin" page={page} perPage={perPage} total={total} totalPages={totalPages} onPageChange={onPageChange} onPerPageChange={onPerPageChange} />

      <OrderDetailsDrawer order={selectedOrder} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}
