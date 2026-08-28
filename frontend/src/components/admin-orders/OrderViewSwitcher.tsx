import { useTranslation } from "react-i18next";
import { ChefHat, ClipboardList, Store, type LucideIcon } from "lucide-react";
import type { AdminOrderView } from "../../utils/adminOrderViews";

type Props = {
  availableViews: readonly AdminOrderView[];
  currentView: AdminOrderView;
  onChange: (view: AdminOrderView) => void;
};

const VIEW_OPTIONS: Record<AdminOrderView, { labelKey: string; Icon: LucideIcon }> = {
  service: { labelKey: "orders.views.service", Icon: Store },
  kitchen: { labelKey: "orders.views.kitchen", Icon: ChefHat },
  management: { labelKey: "orders.views.management", Icon: ClipboardList },
};

export default function OrderViewSwitcher({ availableViews, currentView, onChange }: Props) {
  const { t } = useTranslation("admin");

  return (
    <section className="order-view-switcher" aria-labelledby="order-view-switcher-title">
      <div>
        <strong id="order-view-switcher-title">{t("orders.views.title")}</strong>
        <span>{t("orders.views.subtitle")}</span>
      </div>
      <div className="order-view-switcher-options" role="tablist" aria-label={t("orders.views.title")}>
        {availableViews.map((view) => {
          const { labelKey, Icon } = VIEW_OPTIONS[view];
          return (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={currentView === view}
              className={currentView === view ? "active" : ""}
              onClick={() => onChange(view)}
            >
              <Icon size={21} strokeWidth={2.2} aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
