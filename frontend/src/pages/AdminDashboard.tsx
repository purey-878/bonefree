import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent, MouseEvent, ReactNode, SyntheticEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Heart, MessageCircle, MoreHorizontal, RefreshCw, Search, Send, Star, ThumbsUp, Trash2, X, Menu } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import "./AdminDashboard.css"
import {
  getDashboardAnalytics,
  getCurrentAdmin,
  listProducts,
  listOrders,
  listStaffOrders,
  listKitchenOrders,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getProductAnalytics,
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  setIngredientAvailability,
  getAnalyticsSeries,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  setProductAvailability,
  uploadProductMedia,
  deleteProductMedia,
  updateOrderStatus,
  payCounterOrder,
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listStaffAdmins,
  createStaffAdmin,
  updateStaffAdmin,
  deleteStaffAdmin,
  listProductReviews,
  createReviewReply,
  updateReviewReply,
  deleteReviewReply,
  setReviewReaction,
  deleteReviewReaction,
} from "../services/adminService"
import {
  getAdminChefSpecial,
  getAdminCompanyDetails,
  getAdminEventsSettings,
  getAdminLoyaltyCouponSettings,
  getAdminSocialMediaSettings,
  getAdminSiteTheme,
  updateAdminChefSpecial,
  updateAdminCompanyDetails,
  updateAdminEventsSettings,
  updateAdminLoyaltyCouponSettings,
  updateAdminSocialMediaSettings,
  updateAdminSiteTheme,
} from "../services/siteSettingsService"
import type {
  AdminOrder,
  AdminCustomer,
  AdminCustomerPayload,
  AnalyticsMetric,
  AnalyticsRange,
  AnalyticsSeries,
  AnalyticsSeriesPoint,
  AdminIngredient,
  AdminIngredientPayload,
  AdminProduct,
  AdminProductIngredient,
  AdminProductPayload,
  AdminReview,
  AdminRole,
  AdminUserPayload,
  Category,
  CategoryPayload,
  CurrentAdmin,
  DashboardData,
  ProductAnalytics,
  ProductFilters,
  SalesDay,
  ReactionType,
  IngredientType,
  UserStatus,
} from "../types/admin"
import type {
  ChefSpecialSettings,
  CompanyDetailsSettings,
  EventItemSettings,
  EventsSettings,
  LoyaltyCouponSettings,
  SiteThemeResponse,
  SocialLinkSettings,
  SocialMediaSettings,
  ThemeColors,
} from "../types/siteSettings"
import { defaultSiteThemeResponse, siteThemePresets, themePresetById } from "../siteThemes"
import { defaultEventsSettings } from "../utils/eventSettings"
import { defaultCompanyDetails, defaultSocialMediaSettings } from "../utils/footerSettings"
import StaffOrdersBoard from "../components/admin-orders/StaffOrdersBoard"
import KitchenOrdersBoard from "../components/admin-orders/KitchenOrdersBoard"
import SuperAdminOrdersView from "../components/admin-orders/SuperAdminOrdersView"
import CustomSelect from "../components/ui/CustomSelect"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import { useToast } from "../components/ui/toastContext"
import { formatCategoryId, formatProductId } from "../utils/ids"
import { applyApiImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { formatEuro } from "../utils/money"
import { translateUserMessage } from "../utils/messages"
import { persistOptimisticUpdate } from "../utils/optimisticUpdate"
import { primaryProductMediaUrl, productMediaUrl } from "../utils/productMedia"

function getImageUrl(imagePath: string): string {
  return resolveProductImageUrl(imagePath)
}

function handleAdminImageError(event: SyntheticEvent<HTMLImageElement>) {
  applyApiImageFallback(event.currentTarget)
}

type TabType = "dashboard" | "products" | "ingredients" | "categories" | "orders" | "reviews" | "analytics" | "clientes" | "staff" | "settings"
type AdminExperience = "staff" | "super" | "kitchen"
type AdminTheme = "light" | "dark"
type SiteSettingsTab = "promote" | "coupons" | "theme" | "company" | "social" | "events"

const defaultLoyaltyCouponSettings: LoyaltyCouponSettings = {
  enabled: true,
  qualifyingOrderCount: 3,
  qualifyingOrderMinimum: "50.00",
  discountType: "fixed_value",
  discountValue: "20.00",
  couponMinimumOrder: "0.00",
}

function normalizeLoyaltyCouponSettings(settings: LoyaltyCouponSettings): LoyaltyCouponSettings {
  const qualifyingOrderCount = Math.min(20, Math.max(1, Number(settings.qualifyingOrderCount) || 1))
  const qualifyingOrderMinimum = Math.max(0, Number(settings.qualifyingOrderMinimum) || 0)
  const couponMinimumOrder = Math.max(0, Number(settings.couponMinimumOrder) || 0)
  const rawDiscountValue = Math.max(0.01, Number(settings.discountValue) || 0.01)
  const discountValue = settings.discountType === "percentage"
    ? Math.min(100, rawDiscountValue)
    : rawDiscountValue

  return {
    ...settings,
    qualifyingOrderCount: qualifyingOrderCount,
    qualifyingOrderMinimum: qualifyingOrderMinimum.toFixed(2),
    discountValue: discountValue.toFixed(2),
    couponMinimumOrder: couponMinimumOrder.toFixed(2),
  }
}

type ProductFilterState = {
  name: string
  category: number | ""
  minPrice: string
  maxPrice: string
  featured: boolean
  glutenFree: boolean
  containsAlcohol: boolean
}
type ConfirmDialogState = {
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

const EMPTY_PRODUCT_FILTERS: ProductFilterState = {
  name: "",
  category: "",
  minPrice: "",
  maxPrice: "",
  featured: false,
  glutenFree: false,
  containsAlcohol: false,
}

const ADMIN_NAV_MOBILE_QUERY = "(max-width: 998px)"
const ADMIN_SIDEBAR_AUTO_COLLAPSE_QUERY = "(max-width: 1299.98px)"

function getErrorMessage(error: unknown, fallback: string): string {
  return translateUserMessage(error instanceof Error ? error.message : fallback)
}

const NAV_ITEMS: { tab: TabType; label: string; icon: string }[] = [
  { tab: "dashboard", label: "Visão geral", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { tab: "products", label: "Produtos", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { tab: "ingredients", label: "Ingredientes", icon: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" },
  { tab: "categories", label: "Categorias", icon: "M4 6h16M4 12h16M4 18h7" },
  { tab: "orders", label: "Pedidos", icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" },
  { tab: "reviews", label: "Avaliações", icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.364 1.118l1.286 3.958c.3.921-.755 1.688-1.539 1.118l-3.367-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.784.57-1.838-.197-1.539-1.118l1.286-3.958a1 1 0 00-.364-1.118L4.06 9.385c-.783-.57-.38-1.81.588-1.81H8.81a1 1 0 00.95-.69l1.286-3.958z" },
  { tab: "clientes", label: "Clientes", icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
  { tab: "staff", label: "Equipa", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8M16 11l2 2 4-4" },
  { tab: "settings", label: "Definições", icon: "M12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.65 1.65 0 0015 19.4a1.65 1.65 0 00-1 .6 1.65 1.65 0 00-.33 1.06V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-.6-1 1.65 1.65 0 00-1.06-.33H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-.6 1.65 1.65 0 00.33-1.06V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.38.37.72.68 1a1.65 1.65 0 001.06.33H21a2 2 0 010 4h-.09A1.65 1.65 0 0019.4 15z" },
  { tab: "analytics", label: "Análises", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
]

const SETTINGS_TABS: { id: SiteSettingsTab; label: string; description: string }[] = [
  { id: "promote", label: "Promover produtos", description: "Produto em destaque na página inicial" },
  { id: "coupons", label: "Definições de cupões", description: "Regras de recompensas por sequência" },
  { id: "theme", label: "Tema do site", description: "Aspeto sazonal do website" },
  { id: "company", label: "Detalhes da empresa", description: "Marca e contacto no rodapé" },
  { id: "social", label: "Redes sociais", description: "Links dos ícones do rodapé" },
  { id: "events", label: "Gerir eventos", description: "Datas e horários futuros" },
]

const THEME_COLOR_FIELDS: { key: keyof ThemeColors; label: string; helper: string }[] = [
  { key: "primary", label: "Primária", helper: "Botões e momentos principais da marca" },
  { key: "accent", label: "Destaque", helper: "Realces pequenos e estados ativos" },
  { key: "secondary", label: "Secundária", helper: "Misturas de botões e cor de apoio" },
  { key: "background", label: "Fundo da página", helper: "Fundo das páginas do cliente" },
  { key: "surface", label: "Superfície dos cartões", helper: "Cartões de menu e painéis" },
  { key: "text", label: "Texto", helper: "Texto principal legível" },
  { key: "textMuted", label: "Texto discreto", helper: "Descrições e metadados" },
  { key: "border", label: "Borda", helper: "Inputs, cartões e divisórias" },
  { key: "priceHighlight", label: "Destaque do preço", helper: "Descontos e preços" },
]

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

const OWNER_TABS: TabType[] = ["dashboard", "products", "ingredients", "categories", "orders", "reviews", "clientes", "staff", "settings", "analytics"]
const MANAGER_TABS: TabType[] = ["orders", "products", "ingredients", "categories"]
const WAITER_TABS: TabType[] = ["orders"]
const CHEF_TABS: TabType[] = ["orders"]
const NAV_GROUPS: { label: string; tabs: TabType[] }[] = [
  { label: "Principal", tabs: ["dashboard", "orders"] },
  { label: "Menu", tabs: ["products", "ingredients", "categories"] },
  { label: "Comunidade", tabs: ["reviews", "clientes"] },
  { label: "Admin", tabs: ["staff", "settings", "analytics"] },
]
const REVIEW_REACTION_OPTIONS = [
  { type: "like", label: "Gosto", Icon: ThumbsUp },
  { type: "heart", label: "Coração", Icon: Heart },
] as const satisfies Array<{ type: ReactionType; label: string; Icon: typeof Heart }>
const EURO_FORMATTER = { format: formatEuro }
const INGREDIENT_TYPES: IngredientType[] = ["normal", "sauce", "extra", "drink", "base", "side"]
const INGREDIENT_TYPE_LABELS: Record<IngredientType, string> = {
  normal: "Ingredientes normais",
  sauce: "Molho",
  extra: "Extra",
  drink: "Bebida",
  base: "Base",
  side: "Acompanhamento",
}
type CalorieMode = "manual" | "auto"
const PRODUCT_FORM_STEPS = ["Básico", "Preço", "Ingredientes", "Opções", "Multimédia"] as const
const STEP4_INGREDIENT_TYPES: IngredientType[] = ["normal", "extra", "sauce", "base", "side"]
const QUANTITY_PRESETS = ["1g", "5g", "10g", "25g", "50g", "75g", "100g", "150g", "200g", "300g", "400g"]
const isRemovableProductIngredientType = (type: IngredientType) => type === "normal"
const ingredientTypeLabel = (type: IngredientType | string) => (
  INGREDIENT_TYPE_LABELS[type as IngredientType] ?? type.replace("_", " ").toLowerCase()
)

function parseQuantityToGrams(quantity?: string | null): number | null {
  const value = quantity?.trim().replace(",", ".")
  if (!value) return null

  const match = value.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(g|gram|grams|kg|kilogram|kilograms)?$/i)
  if (!match) return null

  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount) || amount < 0) return null

  const unit = match[2]?.toLowerCase() ?? "g"
  return unit.startsWith("kg") || unit.startsWith("kilogram") ? amount * 1000 : amount
}

function ingredientCaloriesPerGram(ingredient: AdminProductIngredient): number | null {
  const calories = ingredient.caloriesPerGram
  return typeof calories === "number" && Number.isFinite(calories) && calories >= 0 ? calories : null
}

function calculateIngredientCalories(ingredient: AdminProductIngredient): number {
  const grams = parseQuantityToGrams(ingredient.quantity)
  const caloriesPerGram = ingredientCaloriesPerGram(ingredient)
  if (grams === null || caloriesPerGram === null) return 0
  return grams * caloriesPerGram
}

function calculateProductCalories(ingredients: AdminProductIngredient[]): number {
  return ingredients.reduce((total, ingredient) => total + calculateIngredientCalories(ingredient), 0)
}

function nullableNumberFromInput(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number.parseFloat(value.replace(",", "."))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatCalories(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-"
  return value.toLocaleString("pt-PT", { maximumFractionDigits: 1 })
}

function hasIngredientQuantity(ingredient: AdminProductIngredient): boolean {
  return parseQuantityToGrams(ingredient.quantity) !== null
}

type SalesChartPeriod = "hour" | "day" | "month" | "year"

const SALES_GRAPH_OPTIONS: { period: SalesChartPeriod; label: string; caption: string }[] = [
  { period: "hour", label: "Hora", caption: "Últimas 24 horas" },
  { period: "day", label: "Dia", caption: "Últimos 30 dias" },
  { period: "month", label: "Mês", caption: "Últimos 12 meses" },
  { period: "year", label: "Ano", caption: "Últimos 5 anos" },
]

const PRODUCT_ANALYTICS_RANGE_OPTIONS = [
  { days: 1, label: "1 dia", title: "Vendas de 1 dia" },
  { days: 7, label: "1 semana", title: "Vendas de 1 semana" },
  { days: 30, label: "30 dias", title: "Vendas de 30 dias" },
]

const ANALYTICS_METRICS: {
  metric: AnalyticsMetric
  title: string
  caption: string
  color: string
  valueLabel: string
}[] = [
  { metric: "sales", title: "Vendas", caption: "Receita ao longo do tempo", color: "#0f766e", valueLabel: "Receita" },
  { metric: "orders", title: "Pedidos", caption: "Volume de pedidos", color: "#4f46e5", valueLabel: "Pedidos" },
  { metric: "clients", title: "Clientes", caption: "Novas contas de cliente", color: "#db2777", valueLabel: "Clientes" },
  { metric: "products", title: "Produtos", caption: "Itens vendidos", color: "#d97706", valueLabel: "Itens" },
]

const ANALYTICS_RANGE_OPTIONS: { range: AnalyticsRange; label: string }[] = [
  { range: "day", label: "1 dia" },
  { range: "month", label: "Mês" },
  { range: "year", label: "Ano" },
  { range: "custom", label: "Personalizado" },
]

type DirectoryStatusFilter = "all" | "active" | "inactive"
type StaffRoleFilter = "all" | AdminRole

const DIRECTORY_STATUS_OPTIONS = [
  { value: "all", label: "Todos os estados" },
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
]

const STAFF_ROLE_OPTIONS = [
  { value: "all", label: "Todos os cargos" },
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "waiter", label: "Waiter" },
  { value: "chef", label: "Chef" },
]

function statusMatchesFilter(status: string | null | undefined, filter: DirectoryStatusFilter): boolean {
  if (filter === "all") return true
  return filter === "active" ? status === "active" : status !== "active"
}

function formatSalesTick(value: string, period: SalesChartPeriod): string {
  if (period === "hour") return value.slice(11)
  if (period === "day") return value.slice(5)
  if (period === "month") {
    const date = new Date(`${value}-01T00:00:00`)
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("en-US", { month: "short" })
  }
  return value
}

function getSalesGraphData(graphs: DashboardData["salesCharts"], period: SalesChartPeriod): SalesDay[] {
  if (period === "hour") return graphs.byHour
  if (period === "month") return graphs.byMonth
  if (period === "year") return graphs.byYear
  return graphs.byDay
}

type SalesChartRow = SalesDay & { label: string }

function SalesChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: SalesChartRow }>
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <div className="ad-recharts-tooltip">
      <strong>{point.period}</strong>
      <span>{EURO_FORMATTER.format(point.totalSales)}</span>
      <small>{point.orderCount} pedidos | {point.quantitySold} itens vendidos</small>
    </div>
  )
}

function AnalyticsTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean
  payload?: Array<{ payload: AnalyticsSeriesPoint }>
  metric: AnalyticsMetric
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  const value = metric === "sales" ? EURO_FORMATTER.format(point.value) : point.value.toLocaleString("pt-PT")

  return (
    <div className="ad-recharts-tooltip">
      <strong>{point.period}</strong>
      <span>{value}</span>
      {metric !== "clients" && (
        <small>{point.orderCount} pedidos | {point.quantitySold} itens</small>
      )}
    </div>
  )
}

function SalesOverviewChart({
  title,
  caption,
  data,
  period,
  controls,
}: {
  title: string
  caption: string
  data: SalesDay[]
  period: SalesChartPeriod
  controls?: ReactNode
}) {
  const values = data.map((point) => point.totalSales)
  const totalSales = values.reduce((sum, value) => sum + value, 0)
  const totalOrders = data.reduce((sum, point) => sum + point.orderCount, 0)
  const peakPoint = data.reduce<SalesDay | null>(
    (peak, point) => (!peak || point.totalSales > peak.totalSales ? point : peak),
    null,
  )
  const chartData: SalesChartRow[] = data.map((point) => ({
    ...point,
    label: formatSalesTick(point.period, period),
  }))

  return (
    <div className="ad-sales-chart">
      <div className="ad-sales-chart-head">
        <div>
          <h2 className="ad-card-title">{title}</h2>
          <p className="ad-sales-chart-caption">{caption}</p>
        </div>
        <div className="ad-sales-chart-actions">
          <strong>{EURO_FORMATTER.format(totalSales)}</strong>
          {controls}
        </div>
      </div>
      <div className="ad-sales-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 18, right: 18, bottom: 6, left: 2 }}>
            <defs>
              <linearGradient id="adminSalesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f766e" stopOpacity={0.34} />
                <stop offset="92%" stopColor="#0f766e" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#edf2f7" strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="period"
              axisLine={false}
              tickLine={false}
              minTickGap={20}
              tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 700 }}
              tickFormatter={(value: string) => formatSalesTick(value, period)}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={56}
              tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 700 }}
              tickFormatter={(value: number) => EURO_FORMATTER.format(value)}
            />
            <Tooltip content={<SalesChartTooltip />} cursor={{ stroke: "#0f766e", strokeWidth: 1.5, strokeDasharray: "4 4" }} />
            <Area
              type="monotone"
              dataKey="totalSales"
              stroke="#0f766e"
              strokeWidth={3}
              fill="url(#adminSalesGradient)"
              dot={{ r: 4, fill: "#fff", stroke: "#0f766e", strokeWidth: 2 }}
              activeDot={{ r: 7, fill: "#0f766e", stroke: "#ccfbf1", strokeWidth: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="ad-sales-chart-foot">
        <span>{totalOrders} pedidos</span>
        <span>Pico {peakPoint ? EURO_FORMATTER.format(peakPoint.totalSales) : EURO_FORMATTER.format(0)}</span>
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

function AnalyticsChartCard({
  config,
  series,
  range,
  customStart,
  customEnd,
  loading,
  onRangeChange,
  onCustomStartChange,
  onCustomEndChange,
  onRefresh,
}: {
  config: (typeof ANALYTICS_METRICS)[number]
  series?: AnalyticsSeries
  range: AnalyticsRange
  customStart: string
  customEnd: string
  loading: boolean
  onRangeChange: (range: AnalyticsRange) => void
  onCustomStartChange: (value: string) => void
  onCustomEndChange: (value: string) => void
  onRefresh: () => void
}) {
  const total = series?.total ?? 0
  const totalLabel = config.metric === "sales"
    ? EURO_FORMATTER.format(total)
    : total.toLocaleString("en-US")
  const gradientId = `analytics-${config.metric}-gradient`

  return (
    <article className="ad-analytics-card">
      <div className="ad-analytics-card-head">
        <div>
          <p>{config.caption}</p>
          <h3>{config.title}</h3>
        </div>
        <strong>{totalLabel}</strong>
      </div>
      <div className="ad-analytics-card-controls">
        <div className="ad-analytics-range-toggle">
          {ANALYTICS_RANGE_OPTIONS.map((option) => (
            <button
              key={option.range}
              className={range === option.range ? "active" : ""}
              onClick={() => onRangeChange(option.range)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="ad-analytics-custom-range">
            <input type="date" value={customStart} onChange={(event) => onCustomStartChange(event.target.value)} />
            <input type="date" value={customEnd} onChange={(event) => onCustomEndChange(event.target.value)} />
            <button type="button" onClick={onRefresh}>Aplicar</button>
          </div>
        )}
      </div>
      <div className="ad-analytics-chart">
        {loading ? (
          <p className="ad-empty">A carregar gráfico...</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series?.points ?? []} margin={{ top: 16, right: 14, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={config.color} stopOpacity={0.28} />
                  <stop offset="92%" stopColor={config.color} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#edf2f7" strokeDasharray="4 6" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                minTickGap={18}
                tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={54}
                tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
                tickFormatter={(value: number) => config.metric === "sales" ? EURO_FORMATTER.format(value) : value.toLocaleString("en-US")}
              />
              <Tooltip content={<AnalyticsTooltip metric={config.metric} />} cursor={{ stroke: config.color, strokeWidth: 1.4, strokeDasharray: "4 4" }} />
              <Area
                type="monotone"
                dataKey="value"
                name={config.valueLabel}
                stroke={config.color}
                strokeWidth={3}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 6, fill: config.color, stroke: "#fff", strokeWidth: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  )
}

function ProductAnalyticsDrawer({
  product,
  analytics,
  loading,
  rangeDays,
  onClose,
  onEdit,
  onDelete,
  onRangeChange,
}: {
  product: AdminProduct | null
  analytics: ProductAnalytics | null
  loading: boolean
  rangeDays: number
  onClose: () => void
  onEdit: (product: AdminProduct) => void
  onDelete: (product: AdminProduct) => void
  onRangeChange: (days: number) => void
}) {
  if (!product) return null

  const chartData: SalesChartRow[] = (analytics?.salesByDay ?? []).map((point) => ({
    ...point,
    label: formatSalesTick(point.period, "day"),
  }))
  const image = primaryProductMediaUrl(product.media, "card")
  const rating = analytics?.averageRating == null ? "Sem avaliação" : `${analytics.averageRating.toFixed(1)}/5`
  const selectedRange = PRODUCT_ANALYTICS_RANGE_OPTIONS.find((option) => option.days === rangeDays) ?? PRODUCT_ANALYTICS_RANGE_OPTIONS[2]

  return (
    <>
      <div className="ad-drawer-backdrop" onClick={onClose} />
      <aside className="ad-product-drawer" aria-label={`Análises de ${product.name}`}>
        <div className="ad-product-drawer-head">
          <div className="ad-product-drawer-title">
            {image ? (
              <img src={getImageUrl(image)} alt={product.name} onError={handleAdminImageError} />
            ) : (
              <div className="ad-product-avatar">{product.name.slice(0, 2).toUpperCase()}</div>
            )}
            <div>
              <p className="ad-product-drawer-kicker">Análises do produto</p>
              <h2>{product.name}</h2>
              <span>{product.productDisplayId ?? formatProductId(product.productId)}</span>
            </div>
          </div>
          <button type="button" className="ad-icon-btn" onClick={onClose} aria-label="Fechar análises">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <p className="ad-empty">A carregar análises do produto...</p>
        ) : analytics ? (
          <>
            <div className="ad-product-analytics-grid">
              <div><span>Receita</span><strong>{EURO_FORMATTER.format(analytics.totalSales)}</strong></div>
              <div><span>Unidades vendidas</span><strong>{analytics.quantitySold}</strong></div>
              <div><span>Pedidos</span><strong>{analytics.orderCount}</strong></div>
              <div><span>Avaliação</span><strong>{rating}</strong></div>
              <div><span>Preço</span><strong>{EURO_FORMATTER.format(analytics.currentPrice)}</strong></div>
              <div><span>Disponibilidade</span><strong>{analytics.effectiveAvailable ? "Disponível" : "Indisponível"}</strong></div>
            </div>

            <div className="ad-product-chart-card">
              <div className="ad-product-chart-head">
                <div>
                  <h3>{selectedRange.title}</h3>
                  <p>{analytics.totalReviews} avaliações | {analytics.quantitySold} itens vendidos</p>
                </div>
                <div className="ad-product-range-toggle" aria-label="Intervalo de vendas do produto">
                  {PRODUCT_ANALYTICS_RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.days}
                      type="button"
                      className={rangeDays === option.days ? "active" : ""}
                      onClick={() => onRangeChange(option.days)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ad-product-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id={`productSalesGradient-${product.productId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.32} />
                        <stop offset="92%" stopColor="#2563eb" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#edf2f7" strokeDasharray="4 6" vertical={false} />
                    <XAxis
                      dataKey="period"
                      axisLine={false}
                      tickLine={false}
                      minTickGap={18}
                      tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
                      tickFormatter={(value: string) => formatSalesTick(value, "day")}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={50}
                      tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
                      tickFormatter={(value: number) => EURO_FORMATTER.format(value)}
                    />
                    <Tooltip content={<SalesChartTooltip />} cursor={{ stroke: "#2563eb", strokeWidth: 1.5, strokeDasharray: "4 4" }} />
                    <Area
                      type="monotone"
                      dataKey="totalSales"
                      stroke="#2563eb"
                      strokeWidth={3}
                      fill={`url(#productSalesGradient-${product.productId})`}
                      dot={false}
                      activeDot={{ r: 6, fill: "#2563eb", stroke: "#dbeafe", strokeWidth: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="ad-product-drawer-actions">
              <button className="ad-btn ad-btn-primary" onClick={() => onEdit(product)}>Editar produto</button>
              <button className="ad-btn ad-btn-danger" onClick={() => onDelete(product)}>Eliminar produto</button>
              <button className="ad-btn ad-btn-ghost" onClick={onClose}>Fechar</button>
            </div>
          </>
        ) : (
          <p className="ad-empty">Sem análises disponíveis.</p>
        )}
      </aside>
    </>
  )
}

function SiteSettingsPanel({
  value,
  chefSpecial,
  loyaltyCoupon,
  companyDetails,
  socialMedia,
  eventsSettings,
  loading,
  products,
  saving,
  saved,
  onChange,
  onChefSpecialChange,
  onLoyaltyCouponChange,
  onCompanyDetailsChange,
  onSocialMediaChange,
  onEventsSettingsChange,
  onSave,
}: {
  value: SiteThemeResponse
  chefSpecial: ChefSpecialSettings
  loyaltyCoupon: LoyaltyCouponSettings
  companyDetails: CompanyDetailsSettings
  socialMedia: SocialMediaSettings
  eventsSettings: EventsSettings
  loading: boolean
  products: AdminProduct[]
  saving: boolean
  saved: boolean
  onChange: (value: SiteThemeResponse) => void
  onChefSpecialChange: (value: ChefSpecialSettings) => void
  onLoyaltyCouponChange: (value: LoyaltyCouponSettings) => void
  onCompanyDetailsChange: (value: CompanyDetailsSettings) => void
  onSocialMediaChange: (value: SocialMediaSettings) => void
  onEventsSettingsChange: (value: EventsSettings) => void
  onSave: () => void
}) {
  const [activeSettingsTab, setActiveSettingsTab] = useState<SiteSettingsTab>("promote")
  const colors = value.config.colors
  const selectedPreset = themePresetById(value.themeId)
  const selectedChefSpecial = products.find((product) => product.productId === chefSpecial.productId)
  const selectedChefSpecialImage = primaryProductMediaUrl(selectedChefSpecial?.media, "card")
  const socialLinks = defaultSocialMediaSettings.links.map((defaultLink) => (
    socialMedia.links.find((link) => link.platform === defaultLink.platform) ?? defaultLink
  ))

  const updateLoyaltyCoupon = (changes: Partial<LoyaltyCouponSettings>) => {
    onLoyaltyCouponChange({ ...loyaltyCoupon, ...changes })
  }

  const updateCompanyDetails = (changes: Partial<CompanyDetailsSettings>) => {
    onCompanyDetailsChange({ ...companyDetails, ...changes })
  }

  const updateSocialLink = (platform: SocialLinkSettings["platform"], changes: Partial<SocialLinkSettings>) => {
    onSocialMediaChange({
      links: socialLinks.map((link) => (
        link.platform === platform ? { ...link, ...changes } : link
      )),
    })
  }

  const updateEventSetting = (eventId: string, changes: Partial<EventItemSettings>) => {
    onEventsSettingsChange({
      events: eventsSettings.events.map((eventItem) => (
        eventItem.id === eventId ? { ...eventItem, ...changes } : eventItem
      )),
    })
  }

  const changePreset = (themeId: SiteThemeResponse["themeId"]) => {
    const preset = themePresetById(themeId)
    const previewColors = preset.colors ?? {
      ...colors,
      primary: preset.swatches[1],
      accent: preset.swatches[2],
      secondary: themeId === "normal" ? "#076050" : preset.swatches[2],
      background: preset.background,
    }
    onChange({
      ...value,
      themeId: themeId,
      colors: {},
      config: {
        ...value.config,
        id: themeId,
        name: preset.name,
        colors: previewColors,
        background: {
          ...value.config.background,
          value: themeId === "normal" ? defaultSiteThemeResponse.config.background.value : themeId === "presentation" ? "radial-gradient(circle at top left, rgba(224, 170, 0, 0.2), transparent 28rem), radial-gradient(circle at top right, rgba(95, 150, 54, 0.18), transparent 32rem), #eef5ea" : `linear-gradient(180deg, ${preset.background}, #ffffff)`,
        },
      },
    })
  }

  const updateThemeColor = (key: keyof ThemeColors, color: string) => {
    const nextColors = { ...value.colors, [key]: color }
    const nextConfigColors = { ...value.config.colors, [key]: color }
    onChange({
      ...value,
      colors: nextColors,
      config: {
        ...value.config,
        colors: nextConfigColors,
        background: key === "background"
          ? { ...value.config.background, type: "solid", value: color }
          : value.config.background,
      },
    })
  }

  const resetCustomThemeColors = () => {
    const preset = themePresetById(value.themeId)
    const previewColors = preset.colors ?? defaultSiteThemeResponse.config.colors
    const backgroundValue = value.themeId === "normal"
      ? defaultSiteThemeResponse.config.background.value
      : value.themeId === "presentation"
        ? "radial-gradient(circle at top left, rgba(224, 170, 0, 0.2), transparent 28rem), radial-gradient(circle at top right, rgba(95, 150, 54, 0.18), transparent 32rem), #eef5ea"
        : `linear-gradient(180deg, ${preset.background}, #ffffff)`
    onChange({
      ...value,
      colors: {},
      config: {
        ...value.config,
        colors: previewColors,
        background: {
          ...value.config.background,
          value: backgroundValue,
        },
      },
    })
  }

  return (
    <div className="ad-content">
      <div className="ad-section-bar">
        <div>
          <h2 className="ad-section-title">Definições do website</h2>
          <p className="ad-section-sub">Gerir promoções, cupões, tema, detalhes da empresa e links sociais do rodapé.</p>
        </div>
        <div className="ad-settings-actions">
          {saved && <span className="ad-settings-saved">Guardado</span>}
          {activeSettingsTab === "theme" && (
            <button className="ad-btn ad-btn-ghost" disabled={saving || loading} onClick={() => onChange(defaultSiteThemeResponse)}>Repor tema</button>
          )}
          <button className="ad-btn ad-btn-primary" disabled={saving || loading} onClick={onSave}>
            {saving ? "A guardar..." : "Publicar definições"}
          </button>
        </div>
      </div>

      <div className="ad-settings-tabs" role="tablist" aria-label="Secções das definições do website">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeSettingsTab === tab.id ? "active" : ""}
            onClick={() => setActiveSettingsTab(tab.id)}
            role="tab"
            aria-selected={activeSettingsTab === tab.id}
          >
            <strong>{tab.label}</strong>
            <span>{tab.description}</span>
          </button>
        ))}
      </div>

      {activeSettingsTab === "promote" && (
        <section className="ad-card ad-chef-special-settings">
          <h3 className="ad-card-title">Promover produtos</h3>
          <p className="ad-settings-note">Escolha o produto em destaque na área especial da página inicial do cliente.</p>
          <div className="ad-settings-main">
            <div className="ad-form-group">
              <label htmlFor="chef-special-product">Produto da página inicial</label>
              <CustomSelect
                id="chef-special-product"
                className="ad-select"
                value={chefSpecial.productId ?? ""}
                onChange={(nextValue) => onChefSpecialChange({ productId: nextValue === "" ? null : Number(nextValue) })}
                options={[
                  { value: "", label: "Escolha automática" },
                  ...products.map((product) => ({
                    value: product.productId,
                    label: `${product.productDisplayId ?? formatProductId(product.productId)} - ${product.name}`,
                  })),
                ]}
              />
            </div>
            {selectedChefSpecial ? (
              <div className="ad-chef-special-preview">
                {selectedChefSpecialImage ? (
                  <img
                    src={getImageUrl(selectedChefSpecialImage)}
                    alt={selectedChefSpecial.name}
                    onError={handleAdminImageError}
                  />
                ) : (
                  <span>{selectedChefSpecial.name.slice(0, 2).toUpperCase()}</span>
                )}
                <div>
                  <strong>{selectedChefSpecial.name}</strong>
                  <small>{EURO_FORMATTER.format(selectedChefSpecial.price)} | {selectedChefSpecial.effectiveAvailable ? "disponível" : "indisponível"}</small>
                </div>
              </div>
            ) : (
              <p className="ad-settings-note">A escolha automática usa o primeiro item ativo disponível no menu.</p>
            )}
          </div>
        </section>
      )}

      {activeSettingsTab === "coupons" && (
        <section className="ad-card ad-loyalty-settings">
          <h3 className="ad-card-title">Definições de cupões</h3>
          <button
            type="button"
            className={`ad-switch-card ad-coupon-settings-toggle ${loyaltyCoupon.enabled ? "active" : ""}`}
            aria-pressed={loyaltyCoupon.enabled}
            onClick={() => updateLoyaltyCoupon({ enabled: !loyaltyCoupon.enabled })}
          >
            <span className="ad-switch-control"><i /></span>
            <strong>{loyaltyCoupon.enabled ? "Promoção de cupões ativa" : "Promoção de cupões inativa"}</strong>
            <small>Permite iniciar novas sequências de fidelidade e ganhar recompensas em cupão.</small>
          </button>
          <p className="ad-settings-note">
            Quando estiver inativa, os clientes que já têm uma sequência em curso podem terminar essa sequência. Novas sequências ficam bloqueadas até voltar a ativar esta promoção.
          </p>
          <div className="ad-config-grid">
            <div className="ad-form-group">
              <label htmlFor="coupon-streak-count">Pedidos necessários</label>
              <input
                id="coupon-streak-count"
                type="number"
                min={1}
                max={20}
                value={loyaltyCoupon.qualifyingOrderCount}
                onChange={(event) => updateLoyaltyCoupon({ qualifyingOrderCount: Number(event.target.value || 1) })}
              />
            </div>
            <div className="ad-form-group">
              <label htmlFor="coupon-streak-minimum">Valor mínimo por pedido qualificável (EUR)</label>
              <input
                id="coupon-streak-minimum"
                type="number"
                min={0}
                step="0.01"
                value={loyaltyCoupon.qualifyingOrderMinimum}
                onChange={(event) => updateLoyaltyCoupon({ qualifyingOrderMinimum: event.target.value })}
              />
            </div>
            <div className="ad-form-group">
              <label htmlFor="coupon-discount-type">Tipo de desconto</label>
              <select
                id="coupon-discount-type"
                value={loyaltyCoupon.discountType}
                onChange={(event) => updateLoyaltyCoupon({ discountType: event.target.value as LoyaltyCouponSettings["discountType"] })}
              >
                <option value="fixed_value">Valor fixo</option>
                <option value="percentage">Percentagem</option>
              </select>
            </div>
            <div className="ad-form-group">
              <label htmlFor="coupon-discount-value">
                Valor do desconto {loyaltyCoupon.discountType === "percentage" ? "(%)" : "(EUR)"}
              </label>
              <input
                id="coupon-discount-value"
                type="number"
                min={0.01}
                max={loyaltyCoupon.discountType === "percentage" ? 100 : undefined}
                step="0.01"
                value={loyaltyCoupon.discountValue}
                onChange={(event) => updateLoyaltyCoupon({ discountValue: event.target.value })}
              />
            </div>
            <div className="ad-form-group">
              <label htmlFor="coupon-redeem-minimum">Valor mínimo para resgate (EUR)</label>
              <input
                id="coupon-redeem-minimum"
                type="number"
                min={0}
                step="0.01"
                value={loyaltyCoupon.couponMinimumOrder}
                onChange={(event) => updateLoyaltyCoupon({ couponMinimumOrder: event.target.value })}
              />
            </div>
          </div>
        </section>
      )}

      {activeSettingsTab === "theme" && (
        <div className="ad-settings-grid">
          <div className="ad-settings-main">
          <section className="ad-card ad-theme-presets-card">
            <h3 className="ad-card-title">Definições do tema do site</h3>
            <div className="ad-theme-preset-grid">
              {siteThemePresets.map((preset) => (
                <button
                  className={`ad-theme-preset ${value.themeId === preset.id ? "active" : ""}`}
                  key={preset.id}
                  type="button"
                  onClick={() => changePreset(preset.id)}
                >
                  <span className="ad-theme-preset-swatches">
                    <i className="ad-theme-preset-bg" style={{ background: preset.background }} />
                    <i style={{ background: preset.swatches[1] }} />
                    <i style={{ background: preset.swatches[2] }} />
                  </span>
                  <strong>{preset.name}</strong>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="ad-card ad-theme-custom-colors">
            <div className="ad-theme-custom-colors-head">
              <div>
                <h3 className="ad-card-title">Cores personalizadas</h3>
                <p className="ad-settings-note">Substitua as cores do preset selecionado e pré-visualize o tema do site antes de publicar.</p>
              </div>
            <button type="button" className="ad-btn ad-btn-ghost" onClick={resetCustomThemeColors} disabled={Object.keys(value.colors).length === 0}>
                Repor cores personalizadas
              </button>
            </div>
            <div className="ad-theme-color-grid">
              {THEME_COLOR_FIELDS.map((field) => {
                const color = colors[field.key]
                return (
                  <label key={field.key} className="ad-theme-color-field">
                    <span>{field.label}</span>
                    <small>{field.helper}</small>
                    <div>
                      <input
                        type="color"
                        value={isHexColor(color) ? color : "#000000"}
                        onChange={(event) => updateThemeColor(field.key, event.target.value)}
                        aria-label={`Cor de ${field.label}`}
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(event) => updateThemeColor(field.key, event.target.value)}
                        pattern="#[0-9a-fA-F]{6}"
                        aria-label={`Valor hexadecimal de ${field.label}`}
                      />
                    </div>
                  </label>
                )
              })}
            </div>
          </section>
          </div>

          <aside className="ad-card ad-theme-preview-card">
          <div className="ad-theme-preview" style={{
            background: value.config.background.value,
            color: colors.text,
          }}>
            <div className="ad-theme-preview-nav" style={{ borderColor: colors.border }}>
              <strong>BONEFREE</strong>
              <span style={{ background: colors.accent }} />
            </div>
            <div className="ad-theme-preview-hero">
              <p style={{ color: colors.accent }}>{selectedPreset.name}</p>
              <h3>Pré-visualização do website do cliente</h3>
              <div className="ad-theme-preview-product" style={{
                background: colors.surface,
                borderColor: colors.border,
                boxShadow: value.config.ui.cardShadow,
              }}>
                <span style={{ color: colors.textMuted }}>Prato em destaque</span>
                <strong style={{ color: colors.text }}>Taco de abóbora</strong>
                <em style={{ color: colors.priceHighlight }}>15% desconto</em>
              </div>
              <button style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, borderRadius: value.config.ui.buttonStyle === "pill" ? 999 : value.config.ui.buttonStyle === "sharp" ? 2 : value.config.ui.borderRadius }}>
                Pedir agora
              </button>
            </div>
          </div>

          <label className="ad-checkbox-row ad-seasonal-toggle">
            <input
              type="checkbox"
              checked={value.decorationEnabled}
              onChange={(event) => onChange({ ...value, decorationEnabled: event.target.checked })}
            />
            <span>Decorações ativas</span>
          </label>

          {["christmas", "halloween"].includes(value.themeId) && (
            <label className="ad-decoration-intensity">
              <span>Intensidade da decoração</span>
              <input
                type="range"
                min="1"
                max="3"
                step="1"
                value={value.decorationIntensity}
                onChange={(event) => onChange({ ...value, decorationIntensity: Number(event.target.value) })}
              />
              <small>{value.decorationIntensity === 1 ? "Baixa" : value.decorationIntensity === 3 ? "Alta" : "Média"}</small>
            </label>
          )}
          </aside>
        </div>
      )}

      {activeSettingsTab === "company" && (
        <section className="ad-card ad-company-settings">
          <h3 className="ad-card-title">Detalhes da empresa</h3>
          <p className="ad-settings-note">Estes valores aparecem na marca e nas colunas de contacto do rodapé público.</p>
          <div className="ad-config-grid">
            <div className="ad-form-group">
              <label htmlFor="company-brand-name">Nome da marca</label>
              <input
                id="company-brand-name"
                value={companyDetails.brandName}
                onChange={(event) => updateCompanyDetails({ brandName: event.target.value })}
              />
            </div>
            <div className="ad-form-group">
          <label htmlFor="company-phone">Telefone</label>
              <input
                id="company-phone"
                value={companyDetails.phone}
                onChange={(event) => updateCompanyDetails({ phone: event.target.value })}
              />
            </div>
            <div className="ad-form-group">
              <label htmlFor="company-email">Email</label>
              <input
                id="company-email"
                type="email"
                value={companyDetails.email}
                onChange={(event) => updateCompanyDetails({ email: event.target.value })}
              />
            </div>
            <div className="ad-form-group ad-form-group-wide">
              <label htmlFor="company-address">Morada</label>
              <input
                id="company-address"
                value={companyDetails.address}
                onChange={(event) => updateCompanyDetails({ address: event.target.value })}
              />
            </div>
            <div className="ad-form-group ad-form-group-wide">
              <label htmlFor="company-description">Descrição do rodapé</label>
              <textarea
                id="company-description"
                rows={4}
                value={companyDetails.description}
                onChange={(event) => updateCompanyDetails({ description: event.target.value })}
              />
            </div>
          </div>
        </section>
      )}

      {activeSettingsTab === "social" && (
        <section className="ad-card ad-social-settings">
          <h3 className="ad-card-title">Gestão de redes sociais</h3>
          <p className="ad-settings-note">Controle os rótulos, visibilidade e links de destino dos ícones do rodapé.</p>
          <div className="ad-social-link-grid">
            {socialLinks.map((link) => (
              <article key={link.platform} className="ad-social-link-card">
                <label className="ad-checkbox-row">
                  <input
                    type="checkbox"
                    checked={link.enabled}
                    onChange={(event) => updateSocialLink(link.platform, { enabled: event.target.checked })}
                  />
                  <span>Mostrar {link.label}</span>
                </label>
                <div className="ad-form-group">
                  <label htmlFor={`social-label-${link.platform}`}>Rótulo</label>
                  <input
                    id={`social-label-${link.platform}`}
                    value={link.label}
                    onChange={(event) => updateSocialLink(link.platform, { label: event.target.value })}
                  />
                </div>
                <div className="ad-form-group">
                  <label htmlFor={`social-href-${link.platform}`}>Link do ícone do rodapé</label>
                  <input
                    id={`social-href-${link.platform}`}
                    type="url"
                    value={link.href}
                    placeholder={`https://${link.platform}.com/bonefree`}
                    onChange={(event) => updateSocialLink(link.platform, { href: event.target.value })}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeSettingsTab === "events" && (
        <section className="ad-card ad-events-settings">
          <h3 className="ad-card-title">Gerir eventos</h3>
          <p className="ad-settings-note">Edite as datas e horários dos próximos eventos apresentados na página pública de Eventos.</p>
          <div className="ad-event-settings-grid">
            {eventsSettings.events.map((eventItem) => (
              <article key={eventItem.id} className="ad-event-settings-card">
                <img src={eventItem.imageUrl} alt={eventItem.title} onError={handleAdminImageError} />
                <div className="ad-event-settings-body">
                  <label className="ad-checkbox-row">
                    <input
                      type="checkbox"
                      checked={eventItem.enabled}
                      onChange={(event) => updateEventSetting(eventItem.id, { enabled: event.target.checked })}
                    />
                    <span>Mostrar evento</span>
                  </label>
                  <div className="ad-form-group">
                    <label htmlFor={`event-title-${eventItem.id}`}>Título do evento</label>
                    <input
                      id={`event-title-${eventItem.id}`}
                      value={eventItem.title}
                      onChange={(event) => updateEventSetting(eventItem.id, { title: event.target.value })}
                    />
                  </div>
                  <div className="ad-form-group">
                    <label htmlFor={`event-kicker-${eventItem.id}`}>Rótulo</label>
                    <input
                      id={`event-kicker-${eventItem.id}`}
                      value={eventItem.kicker}
                      onChange={(event) => updateEventSetting(eventItem.id, { kicker: event.target.value })}
                    />
                  </div>
                  <div className="ad-form-group ad-form-group-wide">
                    <label htmlFor={`event-description-${eventItem.id}`}>Descrição</label>
                    <textarea
                      id={`event-description-${eventItem.id}`}
                      rows={3}
                      value={eventItem.description}
                      onChange={(event) => updateEventSetting(eventItem.id, { description: event.target.value })}
                    />
                  </div>
                  <div className="ad-event-date-row">
                    <div className="ad-form-group">
                      <label htmlFor={`event-date-${eventItem.id}`}>Data</label>
                      <input
                        id={`event-date-${eventItem.id}`}
                        type="date"
                        value={eventItem.date}
                        onChange={(event) => updateEventSetting(eventItem.id, { date: event.target.value })}
                      />
                    </div>
                    <div className="ad-form-group">
                      <label htmlFor={`event-start-${eventItem.id}`}>Início</label>
                      <input
                        id={`event-start-${eventItem.id}`}
                        type="time"
                        value={eventItem.startTime}
                        onChange={(event) => updateEventSetting(eventItem.id, { startTime: event.target.value })}
                      />
                    </div>
                    <div className="ad-form-group">
                      <label htmlFor={`event-end-${eventItem.id}`}>Fim</label>
                      <input
                        id={`event-end-${eventItem.id}`}
                        type="time"
                        value={eventItem.endTime}
                        onChange={(event) => updateEventSetting(eventItem.id, { endTime: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}

export default function AdminDashboard({ experience = "super" }: { experience?: AdminExperience }) {
  const routeDefaultTab: TabType = experience === "super" ? "dashboard" : "orders"
  const [activeTab, setActiveTab] = useState<TabType>(routeDefaultTab)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("admin_sidebar_collapsed") === "true")
  const [isMobileAdminNav, setIsMobileAdminNav] = useState(() => (
    typeof window !== "undefined" ? window.matchMedia(ADMIN_NAV_MOBILE_QUERY).matches : false
  ))
  const [isAdminSidebarAutoCollapsed, setIsAdminSidebarAutoCollapsed] = useState(() => (
    typeof window !== "undefined" ? window.matchMedia(ADMIN_SIDEBAR_AUTO_COLLAPSE_QUERY).matches : false
  ))
  const [isAdminSidebarOpen, setIsAdminSidebarOpen] = useState(false)
  const [adminTheme, setAdminTheme] = useState<AdminTheme>(() => (localStorage.getItem("admin_theme") === "dark" ? "dark" : "light"))
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [deletedProducts, setDeletedProducts] = useState<AdminProduct[]>([])
  const [selectedAnalyticsProduct, setSelectedAnalyticsProduct] = useState<AdminProduct | null>(null)
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics | null>(null)
  const [productAnalyticsLoading, setProductAnalyticsLoading] = useState(false)
  const [productAnalyticsDays, setProductAnalyticsDays] = useState(30)
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [analyticsSeries, setAnalyticsSeries] = useState<Partial<Record<AnalyticsMetric, AnalyticsSeries>>>({})
  const [analyticsRanges, setAnalyticsRanges] = useState<Record<AnalyticsMetric, AnalyticsRange>>({
    sales: "month",
    orders: "month",
    clients: "month",
    products: "month",
  })
  const [analyticsCustomRanges, setAnalyticsCustomRanges] = useState<Record<AnalyticsMetric, { start: string; end: string }>>({
    sales: { start: "", end: "" },
    orders: { start: "", end: "" },
    clients: { start: "", end: "" },
    products: { start: "", end: "" },
  })
  const [analyticsLoading, setAnalyticsLoading] = useState<Partial<Record<AnalyticsMetric, boolean>>>({})
  const [siteTheme, setSiteTheme] = useState<SiteThemeResponse>(defaultSiteThemeResponse)
  const [chefSpecial, setChefSpecial] = useState<ChefSpecialSettings>({ productId: null })
  const [loyaltyCoupon, setLoyaltyCoupon] = useState<LoyaltyCouponSettings>(defaultLoyaltyCouponSettings)
  const [companyDetails, setCompanyDetails] = useState<CompanyDetailsSettings>(defaultCompanyDetails)
  const [socialMedia, setSocialMedia] = useState<SocialMediaSettings>(defaultSocialMediaSettings)
  const [eventsSettings, setEventsSettings] = useState<EventsSettings>(defaultEventsSettings)
  const [siteThemeLoading, setSiteThemeLoading] = useState(false)
  const [siteThemeSaving, setSiteThemeSaving] = useState(false)
  const [siteThemeSaved, setSiteThemeSaved] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryForm, setCategoryForm] = useState<CategoryPayload>({
    categoryName: "",
    categoryDescription: "",
  })
  const [ingredients, setIngredients] = useState<AdminIngredient[]>([])
  const [showIngredientForm, setShowIngredientForm] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<AdminIngredient | null>(null)
  const [ingredientForm, setIngredientForm] = useState<AdminIngredientPayload>({
    name: "",
    type: "normal",
    status: "active",
    available: true,
    caloriesPerGram: null,
  })
  const [ingredientFilters, setIngredientFilters] = useState<{
    search: string
    type: "" | IngredientType
    status: "all" | "active" | "inactive"
  }>({
    search: "",
    type: "",
    status: "all",
  })
  const [clientes, setClientes] = useState<AdminCustomer[]>([])
  const [staffAdmins, setStaffAdmins] = useState<CurrentAdmin[]>([])
  const [error, setError] = useState<string | null>(null)
  const [availabilityBusyKey, setAvailabilityBusyKey] = useState<string | null>(null)

  // Form state
  const [showProductForm, setShowProductForm] = useState(false)
  const [productFormStep, setProductFormStep] = useState(0)
  const [productFormMessage, setProductFormMessage] = useState("")
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null)
  const [formData, setFormData] = useState<AdminProductPayload>({
    name: "",
    productDescription: "",
    price: 0,
    available: true,
    categoryId: 0,
    customizable: true,
    menuTags: "",
    featured: false,
    discountPercentage: 0,
    glutenFree: false,
    containsAlcohol: false,
    totalCalories: null,
    ingredients: [],
  })
  const [calorieMode, setCalorieMode] = useState<CalorieMode>("auto")
  const [newProductIngredientName, setNewProductIngredientName] = useState("")
  const [newProductIngredientType, setNewProductIngredientType] = useState<IngredientType>("normal")
  const [newProductIngredientCalories, setNewProductIngredientCalories] = useState("")
  const [creatingProductIngredient, setCreatingProductIngredient] = useState(false)
  const [productIngredientSearch, setProductIngredientSearch] = useState("")
  const [selectedQuantity, setSelectedQuantity] = useState("")
  const [customQuantityChips, setCustomQuantityChips] = useState<string[]>([])
  const [isCustomQuantityOpen, setIsCustomQuantityOpen] = useState(false)
  const [customQuantityValue, setCustomQuantityValue] = useState("")
  const [productTagInput, setProductTagInput] = useState("")
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [deletingProductMediaId, setDeletingProductMediaId] = useState<number | null>(null)
  const [isProductImageDragging, setIsProductImageDragging] = useState(false)
  const [showClienteForm, setShowClienteForm] = useState(false)
  const [editingCliente, setEditingCliente] = useState<AdminCustomer | null>(null)
  const [clienteForm, setClienteForm] = useState<AdminCustomerPayload>({
    name: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    taxId: "",
    address: "",
    city: "",
    postalCode: "",
    status: "active",
  })
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [editingStaff, setEditingStaff] = useState<CurrentAdmin | null>(null)
  const [staffForm, setStaffForm] = useState<AdminUserPayload>({
    name: "",
    email: "",
    password: "",
    role: "manager",
    status: "active",
  })

  // Filter state
  const [filters, setFilters] = useState<ProductFilterState>({
    ...EMPTY_PRODUCT_FILTERS,
  })
  const [showDeletedProducts, setShowDeletedProducts] = useState(false)
  const [openProductActionMenuId, setOpenProductActionMenuId] = useState<number | null>(null)
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")
  const [categoryIdFilter, setCategoryIdFilter] = useState("")
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<DirectoryStatusFilter>("all")
  const [reviewSearch, setReviewSearch] = useState("")
  const [clienteSearch, setClienteSearch] = useState("")
  const [clienteStatusFilter, setClienteStatusFilter] = useState<DirectoryStatusFilter>("all")
  const [staffSearch, setStaffSearch] = useState("")
  const [staffRoleFilter, setStaffRoleFilter] = useState<StaffRoleFilter>("all")
  const [staffStatusFilter, setStaffStatusFilter] = useState<DirectoryStatusFilter>("all")
  const [reviewReplyDrafts, setReviewReplyDrafts] = useState<Record<number, string>>({})
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const productImageInputRef = useRef<HTMLInputElement | null>(null)
  const categoryFilterRef = useRef<HTMLDivElement | null>(null)
  const confirmActionRef = useRef<(() => Promise<boolean>) | null>(null)
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  const [salesGraphPeriod, setSalesGraphPeriod] = useState<SalesChartPeriod>("day")
  const navigate = useNavigate()
  const toast = useToast()
  const role = (currentAdmin?.role || localStorage.getItem("admin_role") || "manager") as AdminRole
  const isOwner = role === "owner"
  const isKitchenExperience = experience === "kitchen"
  const canManageProducts = role === "owner" || role === "manager"
  const allowedTabs = isOwner && experience === "super" ? OWNER_TABS : isKitchenExperience ? CHEF_TABS : role === "waiter" ? WAITER_TABS : MANAGER_TABS
  const visibleNavItems = NAV_ITEMS.filter((item) => allowedTabs.includes(item.tab))
  const visibleNavGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.tabs
        .map((tab) => visibleNavItems.find((item) => item.tab === tab))
        .filter((item): item is (typeof NAV_ITEMS)[number] => Boolean(item)),
    }))
    .filter((group) => group.items.length > 0)
  const currentNavLabel = NAV_ITEMS.find((item) => item.tab === activeTab)?.label ?? "Admin"
  const shellTitle = experience === "kitchen" ? "Kitchen" : isOwner && experience === "super" ? "Admin Console" : "Staff Console"
  const adminInitials = (currentAdmin?.name || "Admin")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A"

  const runConfirmedAction = (
    config: ConfirmDialogState,
    action: () => Promise<boolean | void>,
  ): Promise<boolean> => new Promise((resolve) => {
    confirmResolveRef.current = resolve
    confirmActionRef.current = async () => {
      setConfirmLoading(true)
      try {
        const result = await action()
        setConfirmDialog(null)
        resolve(result !== false)
        return result !== false
      } catch {
        setConfirmDialog(null)
        resolve(false)
        return false
      } finally {
        setConfirmLoading(false)
        confirmActionRef.current = null
        confirmResolveRef.current = null
      }
    }
    setConfirmDialog(config)
  })

  const handleConfirmCancel = () => {
    if (confirmLoading) return
    setConfirmDialog(null)
    confirmActionRef.current = null
    confirmResolveRef.current?.(false)
    confirmResolveRef.current = null
  }

  const handleConfirmSubmit = () => {
    void confirmActionRef.current?.()
  }

  const loadDashboard = useCallback(async () => {
    try {
      setDashboardData(await getDashboardAnalytics())
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load dashboard"))
    }
  }, [])

  const loadProductsForFilters = useCallback(async (nextFilters: ProductFilterState) => {
    try {
      const filterObj: ProductFilters = {}
      if (nextFilters.name.trim()) filterObj.name = nextFilters.name.trim()
      if (nextFilters.category) filterObj.category = nextFilters.category
      if (nextFilters.minPrice) filterObj.minPrice = parseFloat(nextFilters.minPrice)
      if (nextFilters.maxPrice) filterObj.maxPrice = parseFloat(nextFilters.maxPrice)
      if (nextFilters.featured) filterObj.featured = true
      if (nextFilters.glutenFree) filterObj.glutenFree = true
      if (nextFilters.containsAlcohol) filterObj.containsAlcohol = true

      const allProducts = await listProducts(
        0,
        100,
        true,
        Object.keys(filterObj).length > 0 ? filterObj : undefined,
      )

      setProducts(allProducts.filter((product) => product.status !== "inactive" && !product.deletedAt))
      setDeletedProducts(allProducts.filter((product) => product.status === "inactive" || product.deletedAt))
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load products"))
    }
  }, [])

  const handleLoadProducts = useCallback(async () => {
    await loadProductsForFilters(filters)
  }, [filters, loadProductsForFilters])

  const handleLoadAllProducts = useCallback(async () => {
    await loadProductsForFilters(EMPTY_PRODUCT_FILTERS)
  }, [loadProductsForFilters])

  const handleLoadCategories = useCallback(async () => {
    try {
      setCategories(await listCategories(true))
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load categories"))
    }
  }, [])

  const handleLoadIngredients = useCallback(async () => {
    try {
      setIngredients(await listIngredients(true, true))
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load ingredients"))
    }
  }, [])

  const handleLoadOrders = useCallback(async () => {
    try {
      const loadedOrders = experience === "kitchen"
        ? await listKitchenOrders(0, 100)
        : experience === "staff"
          ? await listStaffOrders(0, 100)
          : await listOrders(0, 100)
      setOrders(loadedOrders)
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load orders"))
    }
  }, [experience])

  const handleLoadAnalyticsMetric = useCallback(async (metric: AnalyticsMetric, nextRange?: AnalyticsRange) => {
    const activeRange = nextRange ?? analyticsRanges[metric]
    const customRange = analyticsCustomRanges[metric]
    try {
      setAnalyticsLoading((current) => ({ ...current, [metric]: true }))
      const series = await getAnalyticsSeries(metric, activeRange, customRange.start, customRange.end)
      setAnalyticsSeries((current) => ({ ...current, [metric]: series }))
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load analytics chart"))
    } finally {
      setAnalyticsLoading((current) => ({ ...current, [metric]: false }))
    }
  }, [analyticsCustomRanges, analyticsRanges])

  const handleLoadAllAnalytics = useCallback(() => {
    ANALYTICS_METRICS.forEach((item) => {
      void handleLoadAnalyticsMetric(item.metric)
    })
  }, [handleLoadAnalyticsMetric])

  const handleLoadClientes = useCallback(async () => {
    try {
      setClientes(await listCustomers())
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load customers"))
    }
  }, [])

  const handleLoadStaff = useCallback(async () => {
    try {
      setStaffAdmins(await listStaffAdmins())
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load staff admins"))
    }
  }, [])

  const handleLoadSiteTheme = useCallback(async () => {
    if (!isOwner) return
    try {
      setSiteThemeLoading(true)
      const [theme, special, couponSettings, nextCompanyDetails, nextSocialMedia, nextEventsSettings] = await Promise.all([
        getAdminSiteTheme(),
        getAdminChefSpecial(),
        getAdminLoyaltyCouponSettings(),
        getAdminCompanyDetails(),
        getAdminSocialMediaSettings(),
        getAdminEventsSettings(),
      ])
      setSiteTheme(theme)
      setChefSpecial(special)
      setLoyaltyCoupon(couponSettings)
      setCompanyDetails(nextCompanyDetails)
      setSocialMedia(nextSocialMedia)
      setEventsSettings(nextEventsSettings)
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível carregar as definições do site."))
    } finally {
      setSiteThemeLoading(false)
    }
  }, [isOwner])

  const handleLoadReviews = useCallback(async () => {
    try {
      setReviewsLoading(true)
      const reviewProducts = await listProducts(0, 100, false)
      const reviewGroups = await Promise.all(
        reviewProducts.map(async (product) => {
          const productReviews = await listProductReviews(product.productId)
          return productReviews.map((review) => ({ ...review, productName: product.name }))
        }),
      )

      setReviews(
        reviewGroups
          .flat()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      )
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load reviews"))
    } finally {
      setReviewsLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem("admin_token")
    if (!token) {
      navigate("/admin/login")
      return
    }

    void getCurrentAdmin()
      .then((admin) => {
        setCurrentAdmin(admin)
        localStorage.setItem("admin_role", admin.role)
        localStorage.setItem("admin_name", admin.name)

        if (experience === "super" && admin.role !== "owner") {
          navigate(admin.role === "chef" ? "/admin/kitchen" : "/admin/staff", { replace: true })
          return
        }

        if (admin.role === "owner" && experience === "super") {
          void loadDashboard()
          void loadProductsForFilters(EMPTY_PRODUCT_FILTERS)
          void handleLoadCategories()
          void handleLoadIngredients()
        } else {
          setActiveTab("orders")
          void handleLoadOrders()
        }
      })
        .catch(() => {
          localStorage.removeItem("admin_token")
          localStorage.removeItem("admin_role")
          localStorage.removeItem("admin_name")
          navigate("/admin/login", { replace: true })
        })
  }, [experience, handleLoadCategories, handleLoadIngredients, handleLoadOrders, loadDashboard, loadProductsForFilters, navigate])

  useEffect(() => {
    localStorage.setItem("admin_sidebar_collapsed", String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    const mediaQuery = window.matchMedia(ADMIN_NAV_MOBILE_QUERY)

    const syncAdminNavMode = () => {
      setIsMobileAdminNav(mediaQuery.matches)
      setIsAdminSidebarOpen(false)
    }

    syncAdminNavMode()
    mediaQuery.addEventListener("change", syncAdminNavMode)

    return () => mediaQuery.removeEventListener("change", syncAdminNavMode)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia(ADMIN_SIDEBAR_AUTO_COLLAPSE_QUERY)

    const syncSidebarAutoCollapse = () => {
      setIsAdminSidebarAutoCollapsed(mediaQuery.matches)
    }

    syncSidebarAutoCollapse()
    mediaQuery.addEventListener("change", syncSidebarAutoCollapse)

    return () => mediaQuery.removeEventListener("change", syncSidebarAutoCollapse)
  }, [])

  useEffect(() => {
    if (!isMobileAdminNav || !isAdminSidebarOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isMobileAdminNav, isAdminSidebarOpen])

  useEffect(() => {
    if (!isMobileAdminNav || !isAdminSidebarOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAdminSidebarOpen(false)
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isMobileAdminNav, isAdminSidebarOpen])

  useEffect(() => {
    localStorage.setItem("admin_theme", adminTheme)
  }, [adminTheme])

  // Debounced filter effect — only re-fetches active products
  useEffect(() => {
    if (!canManageProducts || activeTab !== "products") return
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      void handleLoadProducts()
    }, 400)
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current) }
  }, [activeTab, canManageProducts, handleLoadProducts])

  useEffect(() => {
    if (!categoryFilterOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!categoryFilterRef.current?.contains(event.target as Node)) {
        setCategoryFilterOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCategoryFilterOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [categoryFilterOpen])

  useEffect(() => {
    if (!currentAdmin || activeTab !== "orders") return

    const intervalId = window.setInterval(() => {
      void handleLoadOrders()
    }, 5000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void handleLoadOrders()
    }

    window.addEventListener("focus", handleLoadOrders)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", handleLoadOrders)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [activeTab, currentAdmin, handleLoadOrders])

  const handleTabChange = (tab: TabType) => {
    if (!allowedTabs.includes(tab)) {
      setActiveTab("orders")
      void handleLoadOrders()
      return
    }
    setActiveTab(tab)
    if (tab === "products") {
      if (categories.length === 0) void handleLoadCategories()
      if (ingredients.length === 0) void handleLoadIngredients()
      void handleLoadProducts()
    } else if (tab === "ingredients") {
      void handleLoadIngredients()
      void handleLoadAllProducts()
    } else if (tab === "categories") {
      if (categories.length === 0) void handleLoadCategories()
      if (products.length === 0 && deletedProducts.length === 0) void handleLoadProducts()
    } else if (tab === "orders" && orders.length === 0) {
      void handleLoadOrders()
    } else if (tab === "reviews" && reviews.length === 0) {
      void handleLoadReviews()
    } else if (tab === "clientes" && clientes.length === 0) {
      void handleLoadClientes()
    } else if (tab === "staff" && staffAdmins.length === 0) {
      void handleLoadStaff()
    } else if (tab === "analytics" && ANALYTICS_METRICS.some((item) => !analyticsSeries[item.metric])) {
      handleLoadAllAnalytics()
    } else if (tab === "settings") {
      void handleLoadSiteTheme()
      void loadProductsForFilters(EMPTY_PRODUCT_FILTERS)
    }
  }

  const handleAdminNavItemClick = (tab: TabType) => {
    handleTabChange(tab)
    if (isMobileAdminNav) setIsAdminSidebarOpen(false)
  }

  const toggleAdminSidebar = () => {
    if (isMobileAdminNav) {
      setIsAdminSidebarOpen((open) => !open)
      return
    }

    setSidebarCollapsed((value) => !value)
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  const resetQuantitySelector = () => {
    setSelectedQuantity("")
    setCustomQuantityChips([])
    setIsCustomQuantityOpen(false)
    setCustomQuantityValue("")
  }

  useEffect(() => {
    if (productFormMessage) setProductFormMessage("")
  }, [calorieMode, formData, imagePreviews, productFormMessage])

  const openNewForm = async () => {
    setEditingProduct(null)
    const nextCategories = categories.length === 0 ? await listCategories() : categories
    if (categories.length === 0) {
      setCategories(nextCategories)
    }
    if (ingredients.length === 0) {
      setIngredients(await listIngredients(true, true))
    }
    const activeCategories = nextCategories.filter((category) => category.status !== "inactive")
    setFormData({
      name: "",
      productDescription: "",
      price: 0,
      available: true,
      categoryId: activeCategories[0]?.categoryId ?? 0,
      customizable: true,
      menuTags: "",
      featured: false,
      discountPercentage: 0,
      glutenFree: false,
      containsAlcohol: false,
      totalCalories: null,
      ingredients: [],
    })
    setCalorieMode("auto")
    setNewProductIngredientName("")
    setNewProductIngredientType("normal")
    setNewProductIngredientCalories("")
    setProductIngredientSearch("")
    resetQuantitySelector()
    setProductTagInput("")
    setProductFormStep(0)
    setProductFormMessage("")
    setImageFiles([])
    setImagePreviews([])
    setIsProductImageDragging(false)
    setShowProductForm(true)
  }

  const closeForm = () => {
    setShowProductForm(false)
    setEditingProduct(null)
    setNewProductIngredientName("")
    setNewProductIngredientType("normal")
    setNewProductIngredientCalories("")
    setProductIngredientSearch("")
    resetQuantitySelector()
    setProductTagInput("")
    setProductFormStep(0)
    setProductFormMessage("")
    setImageFiles([])
    setImagePreviews([])
    setIsProductImageDragging(false)
  }

  const handleEditProduct = async (product: AdminProduct, startStep = 0) => {
    setEditingProduct(product)
    if (categories.length === 0) {
      setCategories(await listCategories())
    }
    const nextIngredients = ingredients.length === 0 ? await listIngredients(true, true) : ingredients
    if (ingredients.length === 0) {
      setIngredients(nextIngredients)
    }
    const ingredientCaloriesById = new Map(
      nextIngredients.map((ingredient) => [ingredient.ingredientId, ingredient.caloriesPerGram ?? null]),
    )
    setFormData({
      name: product.name,
      productDescription: product.productDescription,
      price: product.price,
      available: product.available,
      categoryId: product.categoryId,
      customizable: product.customizable,
      menuTags: product.menuTags ?? "",
      featured: product.featured,
      discountPercentage: product.discountPercentage ?? 0,
      glutenFree: product.glutenFree ?? false,
      containsAlcohol: product.containsAlcohol ?? false,
      totalCalories: product.totalCalories ?? null,
      ingredients: (product.ingredients ?? []).map((ingredient) => ({
        ...ingredient,
        caloriesPerGram: ingredient.caloriesPerGram ?? (
          typeof ingredient.ingredientId === "number"
            ? ingredientCaloriesById.get(ingredient.ingredientId) ?? null
            : null
        ),
      })),
    })
    setCalorieMode("manual")
    setNewProductIngredientName("")
    setNewProductIngredientType("normal")
    setNewProductIngredientCalories("")
    setProductIngredientSearch("")
    resetQuantitySelector()
    setProductTagInput("")
    setProductFormStep(startStep)
    setProductFormMessage("")
    setImageFiles([])
    setIsProductImageDragging(false)
    setImagePreviews((product.media ?? []).map((media) => getImageUrl(productMediaUrl(media, "card") ?? media.originalUrl)))
    setShowProductForm(true)
  }

  const productTags = (formData.menuTags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)

  const addProductTag = () => {
    const nextTag = productTagInput.trim()
    if (!nextTag || productTags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return
    setFormData((current) => ({
      ...current,
      menuTags: [...productTags, nextTag].join(", "),
    }))
    setProductTagInput("")
  }

  const removeProductTag = (tagToRemove: string) => {
    setFormData((current) => ({
      ...current,
      menuTags: (current.menuTags ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag && tag !== tagToRemove)
        .join(", "),
    }))
  }

  const getProductStepValidationMessage = (step: number): string => {
    if (step === 0) {
      if (!formData.name.trim()) return "O nome do produto é obrigatório."
      if (!formData.categoryId) return "Escolha uma categoria."
    }

    if (step === 1) {
      if (!Number.isFinite(formData.price) || formData.price <= 0) return "Introduza um preço superior a 0."
      if (
        !Number.isFinite(formData.discountPercentage) ||
        formData.discountPercentage < 0 ||
        formData.discountPercentage > 100
      ) {
        return "Discount must be between 0 and 100."
      }
    }

    if (step === 2) {
      if (calorieMode === "manual") {
        if (formData.totalCalories === null || formData.totalCalories === undefined) {
          return "Introduza as calorias totais ou mude para o modo automático."
        }
        if (!Number.isFinite(formData.totalCalories) || formData.totalCalories < 0) {
          return "O total de calorias deve ser igual ou superior a 0."
        }
      }

      if (calorieMode === "auto") {
        if (formData.ingredients.length === 0) return "Selecione pelo menos um ingrediente."
        if (missingIngredientQuantityCount > 0) {
          return `${missingIngredientQuantityCount} ${missingIngredientQuantityCount === 1 ? "ingrediente sem quantidade" : "ingredientes sem quantidade"}.`
        }
      }
    }

    return ""
  }

  const firstInvalidProductStep = (lastStep = PRODUCT_FORM_STEPS.length - 1) => {
    for (let step = 0; step <= lastStep; step += 1) {
      const message = getProductStepValidationMessage(step)
      if (message) return { step, message }
    }
    return null
  }

  const goToProductStep = (targetStep: number) => {
    if (targetStep <= productFormStep) {
      setProductFormMessage("")
      setProductFormStep(targetStep)
      return
    }

    const invalid = firstInvalidProductStep(targetStep - 1)
    if (invalid) {
      setProductFormMessage(invalid.message)
      setProductFormStep(invalid.step)
      return
    }

    setProductFormMessage("")
    setProductFormStep(targetStep)
  }

  const goToNextProductStep = () => {
    const message = getProductStepValidationMessage(productFormStep)
    if (message) {
      setProductFormMessage(message)
      return
    }

    setProductFormMessage("")
    setProductFormStep((step) => Math.min(step + 1, PRODUCT_FORM_STEPS.length - 1))
  }

  const goToPreviousProductStep = () => {
    setProductFormStep((step) => Math.max(step - 1, 0))
  }

  const saveProductForm = async () => {
    const invalid = firstInvalidProductStep()
    if (invalid) {
      setProductFormMessage(invalid.message)
      setProductFormStep(invalid.step)
      toast.warning("Please fix the highlighted fields.")
      return
    }

    try {
      setProductFormMessage("")
      const payload: AdminProductPayload = {
        ...formData,
        ingredients: formData.ingredients.map((ingredient) => ({
          ...ingredient,
          removable: isRemovableProductIngredientType(ingredient.type) && ingredient.removable,
        })),
        totalCalories: calorieMode === "auto"
          ? Number(calculateProductCalories(formData.ingredients).toFixed(2))
          : formData.totalCalories ?? null,
      }
      let savedId: number
      if (editingProduct) {
        await updateProduct(editingProduct.productId, payload)
        savedId = editingProduct.productId
      } else {
        const created = await createProduct(payload)
        savedId = created.productId
      }
      for (const [index, file] of imageFiles.entries()) {
        await uploadProductMedia(savedId, file, !editingProduct && index === 0)
      }
      closeForm()
      await handleLoadProducts()
      await handleLoadIngredients()
      toast.success(editingProduct ? "Product updated successfully." : "Product added successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save product")
      setError(message)
      toast.error("Unable to save product. Please try again.")
    }
  }

  const handleProductSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (productFormStep < PRODUCT_FORM_STEPS.length - 1) {
      goToNextProductStep()
      return
    }

    await saveProductForm()
  }

  const handleFinishProductEdit = async () => {
    await saveProductForm()
  }

  const handleDeleteProduct = async (productId: number): Promise<boolean> => {
    setOpenProductActionMenuId(null)
    return runConfirmedAction({
      title: "Eliminar este produto?",
      description: "Esta ação não pode ser anulada. O produto será removido do menu e da lista de produtos do painel de administração.",
      confirmText: "Eliminar produto",
      cancelText: "Cancelar",
      danger: true,
    }, async () => {
      try {
        await deleteProduct(productId)
        await handleLoadProducts()
        toast.success("Product deleted successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to delete product")
        setError(message)
        toast.error("Unable to delete product. Please try again.")
        return false
      }
    })
  }

  const handleToggleProductActionMenu = (event: MouseEvent<HTMLElement>, productId: number) => {
    event.preventDefault()
    event.stopPropagation()
    setOpenProductActionMenuId((current) => current === productId ? null : productId)
  }

  const handleProductCardClick = (event: MouseEvent<HTMLElement>) => {
    if (openProductActionMenuId === null) return
    if ((event.target as HTMLElement).closest(".ad-card-action-menu")) return
    setOpenProductActionMenuId(null)
  }

  const handleRestoreProduct = async (productId: number) => {
    try {
      await restoreProduct(productId)
      await handleLoadProducts()
      toast.success("Product restored successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to restore product")
      setError(message)
      toast.error("Unable to restore product.")
    }
  }

  const handleLoadProductAnalytics = async (product: AdminProduct, days: number) => {
    setProductAnalyticsLoading(true)
    try {
      setProductAnalytics(await getProductAnalytics(product.productId, days))
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load product analytics"))
    } finally {
      setProductAnalyticsLoading(false)
    }
  }

  const handleOpenProductAnalytics = async (product: AdminProduct) => {
    setOpenProductActionMenuId(null)
    setSelectedAnalyticsProduct(product)
    setProductAnalytics(null)
    await handleLoadProductAnalytics(product, productAnalyticsDays)
  }

  const handleProductAnalyticsRangeChange = async (days: number) => {
    setProductAnalyticsDays(days)
    if (!selectedAnalyticsProduct) return
    setProductAnalytics(null)
    await handleLoadProductAnalytics(selectedAnalyticsProduct, days)
  }

  const handleDeleteProductFromAnalytics = async (product: AdminProduct) => {
    const deleted = await handleDeleteProduct(product.productId)
    if (deleted) handleCloseProductAnalytics()
  }

  const handleCloseProductAnalytics = () => {
    setSelectedAnalyticsProduct(null)
    setProductAnalytics(null)
    setProductAnalyticsLoading(false)
  }

  const handleOpenLinkedIngredientProduct = (product: AdminProduct) => {
    setActiveTab("products")
    setFilters({ ...EMPTY_PRODUCT_FILTERS })
    setShowProductForm(false)
    if (product.status === "inactive") setShowDeletedProducts(true)
    void handleLoadAllProducts()
    void handleOpenProductAnalytics(product)
  }

  const isProductIngredientSelected = (ingredientId: number) => (
    formData.ingredients.some((ingredient) => ingredient.ingredientId === ingredientId)
  )

  const toggleProductIngredient = (ingredient: AdminIngredient) => {
    setFormData((current) => {
      const exists = current.ingredients.some((item) => item.ingredientId === ingredient.ingredientId)
      return {
        ...current,
        ingredients: exists
          ? current.ingredients.filter((item) => item.ingredientId !== ingredient.ingredientId)
          : [
              ...current.ingredients,
              {
                ingredientId: ingredient.ingredientId,
                name: ingredient.name,
                type: ingredient.type,
                includedByDefault: true,
                removable: isRemovableProductIngredientType(ingredient.type),
                substitutable: false,
                quantity: "",
                caloriesPerGram: ingredient.caloriesPerGram ?? null,
              },
            ],
      }
    })
  }

  const updateProductIngredient = (index: number, patch: Partial<AdminProductIngredient>) => {
    setFormData((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, ingredientIndex) => {
        if (ingredientIndex !== index) return ingredient
        const next = { ...ingredient, ...patch }
        return {
          ...next,
          removable: isRemovableProductIngredientType(next.type) && next.removable,
        }
      }),
    }))
  }

  const removeProductIngredient = (index: number) => {
    setFormData((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index),
    }))
  }

  const selectSavedProductIngredient = (ingredient: AdminIngredient, caloriesPerGram: number | null = null) => {
    setFormData((current) => {
      const existingIndex = current.ingredients.findIndex((item) => item.ingredientId === ingredient.ingredientId)
      if (existingIndex >= 0) {
        return {
          ...current,
          ingredients: current.ingredients.map((item, index) => (
            index === existingIndex
              ? { ...item, caloriesPerGram: caloriesPerGram ?? item.caloriesPerGram ?? ingredient.caloriesPerGram ?? null }
              : item
          )),
        }
      }

      return {
        ...current,
        ingredients: [
          ...current.ingredients,
          {
            ingredientId: ingredient.ingredientId,
            name: ingredient.name,
            type: ingredient.type,
            includedByDefault: true,
            removable: isRemovableProductIngredientType(ingredient.type),
            substitutable: false,
            quantity: "",
            caloriesPerGram: caloriesPerGram ?? ingredient.caloriesPerGram ?? null,
          },
        ],
      }
    })
  }

  const addNewProductIngredient = async () => {
    if (creatingProductIngredient) return
    const name = newProductIngredientName.trim()
    if (!name) return
    const caloriesPerGram = nullableNumberFromInput(newProductIngredientCalories)
    const existing = ingredients.find((ingredient) => ingredient.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      selectSavedProductIngredient(existing, caloriesPerGram)
      setProductFormMessage(`"${existing.name}" já existe e foi selecionado.`)
      toast.info("Existing ingredient selected.")
    } else {
      try {
        setCreatingProductIngredient(true)
        setProductFormMessage("")
        const created = await createIngredient({
          name: name,
          type: newProductIngredientType,
          status: "active",
          available: true,
          caloriesPerGram: caloriesPerGram,
        })
        setIngredients((current) => (
          current.some((ingredient) => ingredient.ingredientId === created.ingredientId)
            ? current
            : [...current, created].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
        ))
        selectSavedProductIngredient(created, caloriesPerGram)
        toast.success("Ingredient created and selected.")
      } catch (err) {
        const latestIngredients = await listIngredients(true, true).catch(() => [] as AdminIngredient[])
        const duplicate = latestIngredients.find((ingredient) => ingredient.name.toLowerCase() === name.toLowerCase())
        if (duplicate) {
          setIngredients(latestIngredients)
          selectSavedProductIngredient(duplicate, caloriesPerGram)
          setProductFormMessage(`"${duplicate.name}" já existe e foi selecionado.`)
          toast.info("Existing ingredient selected.")
        } else {
          const message = getErrorMessage(err, "Unable to create ingredient.")
          setProductFormMessage(message)
          toast.error(message)
          return
        }
      } finally {
        setCreatingProductIngredient(false)
      }
    }
    setNewProductIngredientName("")
    setNewProductIngredientType("normal")
    setNewProductIngredientCalories("")
  }

  const assignQuantityToPendingIngredients = (quantity: string) => {
    setSelectedQuantity(quantity)
    setFormData((current) => ({
      ...current,
      ingredients: current.ingredients.map((item) => (
        hasIngredientQuantity(item)
          ? item
          : { ...item, quantity: quantity }
      )),
    }))
  }

  const handleIngredientPillToggle = (ingredient: AdminIngredient) => {
    setFormData((current) => {
      const existingIndex = current.ingredients.findIndex((item) => item.ingredientId === ingredient.ingredientId)
      if (existingIndex >= 0) {
        return {
          ...current,
          ingredients: current.ingredients.filter((_, index) => index !== existingIndex),
        }
      }

      return {
        ...current,
        ingredients: [
          ...current.ingredients,
          {
            ingredientId: ingredient.ingredientId,
            name: ingredient.name,
            type: ingredient.type,
            includedByDefault: true,
            removable: isRemovableProductIngredientType(ingredient.type),
            substitutable: false,
            quantity: "",
            caloriesPerGram: ingredient.caloriesPerGram ?? null,
          },
        ],
      }
    })
  }

  const saveCustomQuantityChip = () => {
    const parsed = Number.parseFloat(customQuantityValue.replace(",", "."))
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const normalized = `${Number.isInteger(parsed) ? parsed : Number(parsed.toFixed(1))}g`
    setCustomQuantityChips((current) => (
      current.includes(normalized) || QUANTITY_PRESETS.includes(normalized)
        ? current
        : [...current, normalized]
    ))
    assignQuantityToPendingIngredients(normalized)
    setIsCustomQuantityOpen(false)
    setCustomQuantityValue("")
  }

  const cancelCustomQuantityChip = () => {
    setIsCustomQuantityOpen(false)
    setCustomQuantityValue("")
  }

  const switchCalorieMode = async (nextMode: CalorieMode) => {
    if (nextMode === calorieMode) return

    if (nextMode === "manual") {
      const hasAutomaticData = formData.ingredients.length > 0
      if (hasAutomaticData) {
        const confirmed = await runConfirmedAction({
          title: "Mudar para calorias manuais?",
          description: "As quantidades associadas aos ingredientes serão removidas.",
          confirmText: "Mudar modo",
          cancelText: "Cancelar",
          danger: true,
        }, async () => true)
        if (!confirmed) return
      }
      if (hasAutomaticData) {
        setFormData((current) => ({ ...current, ingredients: [] }))
        setProductIngredientSearch("")
      }
    } else {
      const hasManualData = formData.totalCalories !== null && formData.totalCalories !== undefined
      if (hasManualData) {
        const confirmed = await runConfirmedAction({
          title: "Mudar para calorias automáticas?",
          description: "O total de calorias manual será removido.",
          confirmText: "Mudar modo",
          cancelText: "Cancelar",
          danger: true,
        }, async () => true)
        if (!confirmed) return
      }
      if (hasManualData) {
        setFormData((current) => ({ ...current, totalCalories: null }))
      }
    }

    resetQuantitySelector()
    setCalorieMode(nextMode)
  }

  const handleProductImageFiles = (files: FileList | File[] | null) => {
    const nextFiles = Array.from(files ?? [])
    if (nextFiles.length === 0) return
    setImageFiles((current) => [...current, ...nextFiles])
    setImagePreviews((current) => [...current, ...nextFiles.map((file) => URL.createObjectURL(file))])
  }

  const removePendingProductImage = (previewIndex: number, fileIndex: number) => {
    setImageFiles((current) => current.filter((_, index) => index !== fileIndex))
    setImagePreviews((current) => current.filter((_, index) => index !== previewIndex))
  }

  const handleDeleteExistingProductMedia = async (mediaId: number, previewIndex: number) => {
    if (!editingProduct) return
    setDeletingProductMediaId(mediaId)
    try {
      await deleteProductMedia(editingProduct.productId, mediaId)
      setEditingProduct((current) => current
        ? { ...current, media: current.media.filter((media) => media.mediaId !== mediaId) }
        : current)
      setImagePreviews((current) => current.filter((_, index) => index !== previewIndex))
      await handleLoadProducts()
      toast.success("Imagem removida com sucesso.")
    } catch (err) {
      const message = getErrorMessage(err, "Não foi possível remover a imagem.")
      toast.error(message)
    } finally {
      setDeletingProductMediaId(null)
    }
  }

  const openNewCategoryForm = () => {
    setEditingCategory(null)
    setCategoryForm({ categoryName: "", categoryDescription: "" })
    setShowCategoryForm(true)
  }

  const openEditCategoryForm = (category: Category) => {
    setEditingCategory(category)
    setCategoryForm({
      categoryName: category.categoryName,
      categoryDescription: category.categoryDescription ?? "",
    })
    setShowCategoryForm(true)
  }

  const closeCategoryForm = () => {
    setShowCategoryForm(false)
    setEditingCategory(null)
    setCategoryForm({ categoryName: "", categoryDescription: "" })
  }

  const handleCategorySubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.categoryId, {
          categoryName: categoryForm.categoryName,
          categoryDescription: categoryForm.categoryDescription,
        })
      } else {
        await createCategory(categoryForm)
      }
      closeCategoryForm()
      await handleLoadCategories()
      await loadDashboard()
      toast.success(editingCategory ? "Category updated successfully." : "Category created successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save category")
      setError(message)
      toast.error("Unable to save category.")
    }
  }

  const handleDeactivateCategory = async (categoryId: number) => {
    await runConfirmedAction({
      title: "Desativar esta categoria?",
      description: "Os produtos devem ser movidos primeiro. Esta categoria deixará de estar disponível para navegação no menu.",
      confirmText: "Desativar categoria",
      cancelText: "Cancelar",
      danger: true,
    }, async () => {
      try {
        await deleteCategory(categoryId)
        await handleLoadCategories()
        await loadDashboard()
        toast.success("Category deactivated successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to deactivate category")
        setError(message)
        toast.error("Unable to deactivate category.")
        return false
      }
    })
  }

  const handleRestoreCategory = async (categoryId: number) => {
    try {
      await updateCategory(categoryId, { status: "active" })
      await handleLoadCategories()
      await loadDashboard()
      toast.success("Category activated successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to restore category")
      setError(message)
      toast.error("Unable to activate category.")
    }
  }

  const openNewIngredientForm = () => {
    setEditingIngredient(null)
    setIngredientForm({ name: "", type: "normal", status: "active", available: true, caloriesPerGram: null })
    setShowIngredientForm(true)
  }

  const openEditIngredientForm = (ingredient: AdminIngredient) => {
    setEditingIngredient(ingredient)
    setIngredientForm({
      name: ingredient.name,
      type: ingredient.type,
      status: ingredient.status,
      available: ingredient.available,
      caloriesPerGram: ingredient.caloriesPerGram ?? null,
    })
    setShowIngredientForm(true)
  }

  const closeIngredientForm = () => {
    setShowIngredientForm(false)
    setEditingIngredient(null)
    setIngredientForm({ name: "", type: "normal", status: "active", available: true, caloriesPerGram: null })
  }

  const handleIngredientSubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      if (editingIngredient) {
        await updateIngredient(editingIngredient.ingredientId, ingredientForm)
      } else {
        await createIngredient(ingredientForm)
      }
      closeIngredientForm()
      await handleLoadIngredients()
      toast.success(editingIngredient ? "Ingredient updated successfully." : "Ingredient created successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save ingredient")
      setError(message)
      toast.error("Unable to save ingredient.")
    }
  }

  const handleDeactivateIngredient = async (ingredientId: number) => {
    await runConfirmedAction({
      title: "Desativar este ingrediente?",
      description: "As ligações existentes aos produtos serão mantidas, mas este ingrediente deixará de estar ativo.",
      confirmText: "Desativar ingrediente",
      cancelText: "Cancelar",
      danger: true,
    }, async () => {
      try {
        await deleteIngredient(ingredientId)
        await handleLoadIngredients()
        toast.success("Ingredient deactivated successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to deactivate ingredient")
        setError(message)
        toast.error("Unable to deactivate ingredient.")
        return false
      }
    })
  }

  const handleRestoreIngredient = async (ingredientId: number) => {
    try {
      await updateIngredient(ingredientId, { status: "active" })
      await handleLoadIngredients()
      toast.success("Ingredient activated successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to restore ingredient")
      setError(message)
      toast.error("Unable to activate ingredient.")
    }
  }

  const handleSetIngredientAvailability = async (ingredient: AdminIngredient, available: boolean) => {
    const key = `ingredient-${ingredient.ingredientId}`
    const optimistic = { ...ingredient, available }
    const apply = (next: AdminIngredient) => setIngredients((current) => current.map((item) => (
      item.ingredientId === ingredient.ingredientId ? next : item
    )))
    setAvailabilityBusyKey(key)
    try {
      await persistOptimisticUpdate(
        ingredient,
        optimistic,
        apply,
        () => setIngredientAvailability(ingredient.ingredientId, available),
      )
      await handleLoadProducts()
      toast.success(available ? "Ingrediente disponível." : "Ingrediente indisponível.")
    } catch (err) {
      const message = getErrorMessage(err, "Não foi possível alterar a disponibilidade do ingrediente")
      setError(message)
      toast.error(message)
    } finally {
      setAvailabilityBusyKey(null)
    }
  }

  const handleSetProductAvailability = async (product: AdminProduct, available: boolean) => {
    const key = `product-${product.productId}`
    const optimistic = { ...product, available, effectiveAvailable: available && product.unavailableBaseIngredients.length === 0 }
    const apply = (next: AdminProduct) => {
      setProducts((current) => current.map((item) => item.productId === product.productId ? next : item))
      setDeletedProducts((current) => current.map((item) => item.productId === product.productId ? next : item))
    }
    setAvailabilityBusyKey(key)
    try {
      await persistOptimisticUpdate(
        product,
        optimistic,
        apply,
        () => setProductAvailability(product.productId, available),
      )
      toast.success(available ? "Produto disponível." : "Produto indisponível.")
    } catch (err) {
      const message = getErrorMessage(err, "Não foi possível alterar a disponibilidade do produto")
      setError(message)
      toast.error(message)
    } finally {
      setAvailabilityBusyKey(null)
    }
  }

  const refreshOrder = (updatedOrder: AdminOrder) => {
    setOrders((current) => current.map(order => order.orderId === updatedOrder.orderId ? updatedOrder : order))
  }

  const handleOrderStatusChange = async (orderId: number, state: string) => {
    try {
      refreshOrder(await updateOrderStatus(orderId, state))
      toast.success("Order status updated successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to update order status")
      setError(message)
      toast.error("Unable to update order status.")
    }
  }

  const handlePayCounterOrder = async (orderId: number) => {
    try {
      refreshOrder(await payCounterOrder(orderId))
      toast.success("Order marked as paid.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to mark order as paid")
      setError(message)
      toast.error("Unable to mark order as paid.")
    }
  }

  const openNewClienteForm = () => {
    setEditingCliente(null)
    setClienteForm({ name: "", lastName: "", email: "", password: "", phone: "", taxId: "", address: "", city: "", postalCode: "", status: "active" })
    setShowClienteForm(true)
  }

  const openEditClienteForm = (cliente: AdminCustomer) => {
    setEditingCliente(cliente)
    setClienteForm({
      name: cliente.name ?? "",
      lastName: cliente.lastName ?? "",
      email: cliente.email,
      password: "",
      phone: cliente.phone ?? "",
      taxId: cliente.taxId ?? "",
      address: cliente.address ?? "",
      city: cliente.city ?? "",
      postalCode: cliente.postalCode ?? "",
      status: cliente.status ?? "active",
    })
    setShowClienteForm(true)
  }

  const handleClienteSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const payload = { ...clienteForm }
      if (!payload.password) delete payload.password
      if (editingCliente) await updateCustomer(editingCliente.customerId, payload)
      else await createCustomer(payload)
      setShowClienteForm(false)
      await handleLoadClientes()
      await handleLoadOrders()
      toast.success(editingCliente ? "Customer updated successfully." : "Customer created successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save customer")
      setError(message)
      toast.error("Unable to save customer.")
    }
  }

  const handleDeleteCliente = async (clienteId: number) => {
    await runConfirmedAction({
      title: "Desativar este cliente?",
      description: "A conta do cliente será marcada como inativa.",
      confirmText: "Desativar cliente",
      cancelText: "Cancelar",
      danger: true,
    }, async () => {
      try {
        await deleteCustomer(clienteId)
        await handleLoadClientes()
        toast.success("Customer deactivated successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to deactivate customer")
        setError(message)
        toast.error("Unable to deactivate customer.")
        return false
      }
    })
  }

  const handleReactivateCliente = async (cliente: AdminCustomer) => {
    await runConfirmedAction({
      title: "Reativar este cliente?",
      description: `${[cliente.name, cliente.lastName].filter(Boolean).join(" ") || cliente.email} (#${cliente.customerId}) voltará a ter acesso com a mesma conta.`,
      confirmText: "Reativar cliente",
      cancelText: "Cancelar",
    }, async () => {
      try {
        await updateCustomer(cliente.customerId, { status: "active" })
        await handleLoadClientes()
        toast.success("Customer reactivated successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to reactivate customer")
        setError(message)
        toast.error("Unable to reactivate customer.")
        return false
      }
    })
  }

  const openNewStaffForm = () => {
    setEditingStaff(null)
    setStaffForm({ name: "", email: "", password: "", role: "manager", status: "active" })
    setShowStaffForm(true)
  }

  const openEditStaffForm = (admin: CurrentAdmin) => {
    setEditingStaff(admin)
    setStaffForm({ name: admin.name, email: admin.email, password: "", role: admin.role, status: admin.status })
    setShowStaffForm(true)
  }

  const handleStaffSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const payload = { ...staffForm }
      if (editingStaff) {
        if (!payload.password) delete payload.password
        await updateStaffAdmin(editingStaff.adminId, payload)
      } else {
        if (!payload.password) throw new Error("A palavra-passe é obrigatória para um novo administrador")
        await createStaffAdmin(payload as AdminUserPayload & { password: string })
      }
      setShowStaffForm(false)
      await handleLoadStaff()
      toast.success(editingStaff ? "Staff admin updated successfully." : "Staff admin created successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save staff admin")
      setError(message)
      toast.error("Unable to save staff admin.")
    }
  }

  const handleSaveSiteTheme = async () => {
    try {
      setSiteThemeSaving(true)
      const normalizedLoyaltyCoupon = normalizeLoyaltyCouponSettings(loyaltyCoupon)
      const [savedTheme, savedChefSpecial, savedLoyaltyCoupon, savedCompanyDetails, savedSocialMedia, savedEventsSettings] = await Promise.all([
        updateAdminSiteTheme(siteTheme),
        updateAdminChefSpecial(chefSpecial),
        updateAdminLoyaltyCouponSettings(normalizedLoyaltyCoupon),
        updateAdminCompanyDetails(companyDetails),
        updateAdminSocialMediaSettings(socialMedia),
        updateAdminEventsSettings(eventsSettings),
      ])
      setSiteTheme(savedTheme)
      setChefSpecial(savedChefSpecial)
      setLoyaltyCoupon(savedLoyaltyCoupon)
      setCompanyDetails(savedCompanyDetails)
      setSocialMedia(savedSocialMedia)
      setEventsSettings(savedEventsSettings)
      localStorage.setItem("bonefree_site_theme", JSON.stringify(savedTheme))
      window.dispatchEvent(new Event("siteThemeUpdated"))
      setSiteThemeSaved(true)
      window.setTimeout(() => setSiteThemeSaved(false), 2200)
      toast.success("Definições do site guardadas com sucesso.")
    } catch (err) {
      const message = getErrorMessage(err, "Não foi possível guardar as definições do site.")
      setError(message)
      toast.error("Não foi possível guardar as definições do site.")
    } finally {
      setSiteThemeSaving(false)
    }
  }

  const handleDeleteStaff = async (adminId: number) => {
    await runConfirmedAction({
      title: "Desativar este administrador?",
      description: "Este utilizador administrador perderá o acesso ativo até ser reativado.",
      confirmText: "Desativar admin",
      cancelText: "Cancelar",
      danger: true,
    }, async () => {
      try {
        await deleteStaffAdmin(adminId)
        await handleLoadStaff()
        toast.success("Staff admin deactivated successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to deactivate staff admin")
        setError(message)
        toast.error("Unable to deactivate staff admin.")
        return false
      }
    })
  }

  const handleReactivateStaff = async (admin: CurrentAdmin) => {
    await runConfirmedAction({
      title: "Reativar este administrador?",
      description: `${admin.name} (#${admin.adminId}) voltará a ter acesso com a mesma conta.`,
      confirmText: "Reativar admin",
      cancelText: "Cancelar",
    }, async () => {
      try {
        await updateStaffAdmin(admin.adminId, {
          name: admin.name,
          email: admin.email,
          role: admin.role,
          status: "active",
        })
        await handleLoadStaff()
        toast.success("Staff admin reactivated successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to reactivate staff admin")
        setError(message)
        toast.error("Unable to reactivate staff admin.")
        return false
      }
    })
  }

  const handleSaveReviewReply = async (review: AdminReview) => {
    const text = (reviewReplyDrafts[review.reviewId] ?? review.reply?.text ?? "").trim()
    if (!text) {
      setError("O texto da resposta não pode estar vazio.")
      toast.warning("O texto da resposta não pode estar vazio.")
      return
    }

    try {
      const savedReply = review.reply
        ? await updateReviewReply(review.reviewId, review.reply.replyId, text)
        : await createReviewReply(review.reviewId, text)

      setReviews((current) => current.map((item) => (
        item.reviewId === review.reviewId ? { ...item, reply: savedReply } : item
      )))
      setReviewReplyDrafts((current) => ({ ...current, [review.reviewId]: savedReply.text }))
      toast.success(review.reply ? "Review reply updated successfully." : "Review reply posted successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save review reply")
      setError(message)
      toast.error("Unable to save review reply.")
    }
  }

  const handleDeleteReviewReply = async (review: AdminReview) => {
    if (!review.reply) return

    await runConfirmedAction({
      title: "Eliminar esta resposta à avaliação?",
      description: "A resposta pública do administrador será removida desta avaliação.",
      confirmText: "Eliminar resposta",
      cancelText: "Cancelar",
      danger: true,
    }, async () => {
      try {
        await deleteReviewReply(review.reviewId, review.reply!.replyId)
        setReviews((current) => current.map((item) => (
          item.reviewId === review.reviewId ? { ...item, reply: null } : item
        )))
        setReviewReplyDrafts((current) => ({ ...current, [review.reviewId]: "" }))
        toast.success("Review reply deleted successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to delete review reply")
        setError(message)
        toast.error("Unable to delete review reply.")
        return false
      }
    })
  }

  const handleToggleReviewReaction = async (review: AdminReview, type: ReactionType) => {
    const adminId = currentAdmin?.adminId
    if (!adminId) {
      setError("Admin session not loaded")
      toast.warning("Admin session not loaded.")
      return
    }

    const existingReactions = review.reactions ?? []
    const activeReaction = existingReactions.find((reaction) => reaction.adminId === adminId)

    try {
      if (activeReaction?.type === type) {
        await deleteReviewReaction(review.reviewId)
        setReviews((current) => current.map((item) => (
          item.reviewId === review.reviewId
            ? { ...item, reactions: (item.reactions ?? []).filter((reaction) => reaction.adminId !== adminId) }
            : item
        )))
        toast.success("Review reaction removed.")
        return
      }

      const savedReaction = await setReviewReaction(review.reviewId, type)
      setReviews((current) => current.map((item) => (
        item.reviewId === review.reviewId
          ? {
              ...item,
              reactions: [
                ...(item.reactions ?? []).filter((reaction) => reaction.adminId !== adminId),
                savedReaction,
              ],
            }
          : item
      )))
      toast.success("Review reaction updated.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to update review reaction")
      setError(message)
      toast.error("Unable to update review reaction.")
    }
  }

  const handleLogout = async () => {
    await runConfirmedAction({
      title: "Terminar sessão?",
      description: "Vai sair da consola de administração e terá de iniciar sessão novamente para continuar.",
      confirmText: "Terminar sessão",
      cancelText: "Cancelar",
      }, async () => {
        setIsAdminSidebarOpen(false)
        localStorage.removeItem("admin_token")
        localStorage.removeItem("admin_role")
        localStorage.removeItem("admin_name")
        navigate("/admin/login", { replace: true })
        return true
      })
  }

  const filteredReviews = reviews.filter((review) => {
    const query = reviewSearch.trim().toLowerCase()
    if (!query) return true

    return [
      review.customerName,
      review.productName,
      review.title,
      review.comment,
      review.status,
    ].filter(Boolean).join(" ").toLowerCase().includes(query)
  })
  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLowerCase()

    return categories.filter((category) => {
      if (categoryIdFilter && String(category.categoryId) !== categoryIdFilter) return false
      if (!statusMatchesFilter(category.status ?? "active", categoryStatusFilter)) return false
      if (!query) return true

      const statusLabel = category.status !== "inactive" ? "active" : "inactive"
      return [
        category.categoryId,
        category.categoryDisplayId ?? formatCategoryId(category.categoryId),
        category.categoryName,
        category.categoryDescription,
        statusLabel,
      ].filter(Boolean).join(" ").toLowerCase().includes(query)
    })
  }, [categories, categoryIdFilter, categorySearch, categoryStatusFilter])
  const filteredClientes = useMemo(() => {
    const query = clienteSearch.trim().toLowerCase()

    return clientes.filter((cliente) => {
      if (!statusMatchesFilter(cliente.status, clienteStatusFilter)) return false
      if (!query) return true

      const statusLabel = cliente.status === "active" ? "active" : "inactive"
      return [
        String(cliente.customerId),
        `#${cliente.customerId}`,
        cliente.name,
        cliente.lastName,
        cliente.email,
        cliente.phone,
        cliente.taxId,
        cliente.address,
        cliente.city,
        cliente.postalCode,
        statusLabel,
      ].filter(Boolean).join(" ").toLowerCase().includes(query)
    })
  }, [clienteSearch, clienteStatusFilter, clientes])
  const filteredStaffAdmins = useMemo(() => {
    const query = staffSearch.trim().toLowerCase()

    return staffAdmins.filter((admin) => {
      if (staffRoleFilter !== "all" && admin.role !== staffRoleFilter) return false
      if (!statusMatchesFilter(admin.status, staffStatusFilter)) return false
      if (!query) return true

      const statusLabel = admin.status === "active" ? "active" : "inactive"
      return [
        String(admin.adminId),
        `#${admin.adminId}`,
        admin.name,
        admin.email,
        admin.role,
        statusLabel,
      ].filter(Boolean).join(" ").toLowerCase().includes(query)
    })
  }, [staffAdmins, staffRoleFilter, staffSearch, staffStatusFilter])
  const hasCategoryFilters = Boolean(categorySearch.trim()) || Boolean(categoryIdFilter) || categoryStatusFilter !== "all"
  const hasClienteFilters = Boolean(clienteSearch.trim()) || clienteStatusFilter !== "all"
  const hasStaffFilters = Boolean(staffSearch.trim()) || staffRoleFilter !== "all" || staffStatusFilter !== "all"
  const reviewsWithReply = reviews.filter((review) => review.reply?.text?.trim()).length
  const reviewsAwaitingReply = Math.max(reviews.length - reviewsWithReply, 0)
  const averageReviewRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0
  const allAdminProducts = useMemo(() => [...products, ...deletedProducts], [products, deletedProducts])
  const getBaseUnavailableReason = useCallback((product: AdminProduct) => {
    if (!product.available) return "Indisponível por decisão operacional."
    const names = product.unavailableBaseIngredients ?? []
    if (names.length === 0) return null
    if (names.length === 1) return `Indisponível: o ingrediente base ${names[0]} não está disponível.`

    const shownNames = names.slice(0, 2).join(", ")
    const remainingCount = names.length - 2
    return `Indisponível: ${remainingCount > 0 ? `${shownNames} e mais ${remainingCount}` : shownNames}.`
  }, [])
  const filteredIngredients = ingredients.filter((ingredient) => {
    const query = ingredientFilters.search.trim().toLowerCase()
    const matchesSearch = !query || [
      ingredient.name,
      ingredient.type,
      String(ingredient.ingredientId),
    ].join(" ").toLowerCase().includes(query)
    const matchesType = !ingredientFilters.type || ingredient.type === ingredientFilters.type
    const matchesStatus =
      ingredientFilters.status === "all" ||
      (ingredientFilters.status === "active" && ingredient.status !== "inactive") ||
      (ingredientFilters.status === "inactive" && ingredient.status === "inactive")

    return matchesSearch && matchesType && matchesStatus
  })
  const clearIngredientFilters = () => {
    setIngredientFilters({ search: "", type: "", status: "all" })
  }
  const selectedIngredientIds = new Set(
    formData.ingredients
      .map((ingredient) => ingredient.ingredientId)
      .filter((id): id is number => typeof id === "number"),
  )
  const activeCategories = categories.filter((category) => category.status !== "inactive")
  const selectedProductFilterCategory =
    activeCategories.find((category) => category.categoryId === filters.category)?.categoryName ??
    "All categories"
  const activeProductIngredients = ingredients.filter((ingredient) => ingredient.status !== "inactive")
  const productIngredientChipGroups = STEP4_INGREDIENT_TYPES
    .map((type) => {
      const query = productIngredientSearch.trim().toLowerCase()
      const items = activeProductIngredients.filter((ingredient) => {
        if (ingredient.type !== type) return false
        if (!query) return true
        return ingredient.name.toLowerCase().includes(query)
      })
      return { type, items }
    })
    .filter((group) => group.items.length > 0)
  const assignedProductIngredientPairs = formData.ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .filter(({ ingredient }) => hasIngredientQuantity(ingredient))
  const missingIngredientQuantityCount = calorieMode === "auto"
    ? formData.ingredients.filter((ingredient) => !hasIngredientQuantity(ingredient)).length
    : 0
  const quantityOptions = useMemo(() => {
    const selectedQuantities = formData.ingredients
      .map((ingredient) => ingredient.quantity?.trim())
      .filter((quantity): quantity is string => !!quantity)
    return [...new Set([...QUANTITY_PRESETS, ...customQuantityChips, ...selectedQuantities])]
  }, [customQuantityChips, formData.ingredients])
  const existingProductMediaCount = editingProduct?.media?.length ?? 0
  const productMediaPreviewItems = imagePreviews.map((src, index) => {
    const fileIndex = Math.max(0, index - existingProductMediaCount)
    const isPendingUpload = index >= existingProductMediaCount
    return {
      src,
      name: isPendingUpload
        ? imageFiles[fileIndex]?.name ?? "Nova imagem do produto"
        : editingProduct?.media?.[index]?.originalFilename ?? "Imagem do produto",
      status: isPendingUpload ? "Pronta para carregar" : "Multimédia existente",
      mediaId: isPendingUpload ? null : editingProduct?.media?.[index]?.mediaId ?? null,
      fileIndex,
      isPendingUpload,
    }
  })
  const hasProductMedia = productMediaPreviewItems.length > 0
  const productStepContinueBlocked = productFormStep === 2 && missingIngredientQuantityCount > 0
  const selectedIngredientCaloriesTotal = calorieMode === "auto"
    ? assignedProductIngredientPairs.reduce((total, { ingredient }) => total + calculateIngredientCalories(ingredient), 0)
    : 0
  const calculatedProductCalories = useMemo(
    () => calculateProductCalories(formData.ingredients),
    [formData.ingredients],
  )
  const isSidebarCollapsed = sidebarCollapsed || isAdminSidebarAutoCollapsed
  const adminShellClassName = [
    "ad-shell",
    `ad-theme-${adminTheme}`,
    isSidebarCollapsed && !isMobileAdminNav ? "ad-shell-collapsed" : "",
    isMobileAdminNav ? "ad-shell-mobile-nav" : "",
    isAdminSidebarOpen ? "ad-sidebar-open" : "",
  ].filter(Boolean).join(" ")

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={adminShellClassName}>
      <header className="ad-topbar">
        <div className="ad-topbar-left">
          <button
            aria-controls="admin-sidebar"
            aria-expanded={isMobileAdminNav ? isAdminSidebarOpen : !isSidebarCollapsed}
            aria-label="Abrir ou fechar menu de administração"
            className="ad-admin-menu-btn"
            onClick={toggleAdminSidebar}
            type="button"
          >
            <Menu size={22} />
          </button>

          <div className="ad-topbar-brand" aria-label="Administração Bonefree">
            <div className="ad-brand-icon ad-topbar-brand-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="ad-topbar-brand-copy">
              <span className="ad-brand-kicker">Bonefree</span>
              <span className="ad-brand-name">{shellTitle}</span>
            </div>
          </div>
        </div>

        <div className="ad-topbar-title">
          <p className="ad-page-kicker">{shellTitle}</p>
          <h1 className="ad-page-title">{currentNavLabel}</h1>
          <p className="ad-page-sub">{new Date().toLocaleDateString("pt-PT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>

        <div className="ad-topbar-actions">
          <button className="ad-theme-switch" onClick={() => setAdminTheme((theme) => theme === "dark" ? "light" : "dark")} title={`Mudar para tema ${adminTheme === "dark" ? "claro" : "escuro"}`} aria-label={`Mudar para tema ${adminTheme === "dark" ? "claro" : "escuro"}`}>
            <span className="ad-theme-switch-track">
              <span className="ad-theme-switch-thumb">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={adminTheme === "dark" ? "M12 3v2M12 19v2M5.64 5.64l1.42 1.42M16.94 16.94l1.42 1.42M3 12h2M19 12h2M5.64 18.36l1.42-1.42M16.94 7.06l1.42-1.42M12 8a4 4 0 100 8 4 4 0 000-8z" : "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"} />
                </svg>
              </span>
            </span>
          </button>
          <div className="ad-user-pill" title={currentAdmin?.email}>
            <span className="ad-user-avatar">{adminInitials}</span>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        aria-hidden={isMobileAdminNav && !isAdminSidebarOpen}
        aria-label="Navegação da administração"
        className="ad-sidebar"
        id="admin-sidebar"
        inert={isMobileAdminNav && !isAdminSidebarOpen ? true : undefined}
      >
        <div className="ad-brand">
          <div className="ad-brand-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="ad-brand-copy">
            <span className="ad-brand-kicker">Bonefree</span>
            <span className="ad-brand-name">{shellTitle}</span>
          </div>
          {isMobileAdminNav && (
            <button
              aria-label="Fechar menu de administração"
              className="ad-sidebar-close"
              onClick={() => setIsAdminSidebarOpen(false)}
              type="button"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <nav className="ad-nav" aria-label="Navegação da administração">
          {visibleNavGroups.map((group) => (
            <section key={group.label} className="ad-nav-group" aria-label={group.label}>
              <span className="ad-nav-group-label">{group.label}</span>
              <div className="ad-nav-group-items">
                {group.items.map(({ tab, label, icon }) => (
                  <button
                    key={tab}
                    className={`ad-nav-item ${activeTab === tab ? "active" : ""}`}
                    onClick={() => handleAdminNavItemClick(tab)}
                    title={!isMobileAdminNav && isSidebarCollapsed ? label : undefined}
                  >
                    <svg className="ad-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d={icon} />
                    </svg>
                    <span className="ad-nav-label">{label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="ad-sidebar-footer">
          <button className="ad-collapse-btn" onClick={() => setSidebarCollapsed((value) => !value)} title={isSidebarCollapsed ? "Expandir barra lateral" : "Recolher barra lateral"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d={isSidebarCollapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
            </svg>
            <span>{isSidebarCollapsed ? "Expandir" : "Recolher"}</span>
          </button>

          <button className="ad-logout" onClick={() => void handleLogout()} title="Terminar sessão">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Terminar sessão</span>
          </button>
        </div>
      </aside>

      {isMobileAdminNav && (
        <button
          aria-hidden={!isAdminSidebarOpen}
          aria-label="Fechar menu de administração"
          className="ad-sidebar-backdrop"
          onClick={() => setIsAdminSidebarOpen(false)}
          tabIndex={isAdminSidebarOpen ? 0 : -1}
          type="button"
        />
      )}

      {/* Main */}
      <main className="ad-main">
        {error && (
          <div className="ad-alert ad-alert-error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {activeTab === "dashboard" && dashboardData && (
          <div className="ad-content">
            <section className="ad-dashboard-overview">
              <div>
                <p className="ad-dashboard-kicker">Consola de administração</p>
                <h2>Visão geral</h2>
                <span>Resumo em tempo real do estado do menu, atividade de vendas, disponibilidade e procura dos clientes.</span>
              </div>
              <button className="ad-btn ad-btn-ghost" onClick={loadDashboard}>
                Atualizar visão geral
              </button>
            </section>

            <div className="ad-metrics-grid">
              {[
                { label: "Produtos", value: dashboardData.totalProducts, color: "blue" },
                { label: "Categorias", value: dashboardData.totalCategories, color: "purple" },
                { label: "Clientes", value: dashboardData.totalCustomers, color: "teal" },
                { label: "Pedidos", value: dashboardData.totalCarts, color: "amber" },
              ].map(m => (
                <div key={m.label} className={`ad-metric-card ad-metric-${m.color}`}>
                  <p className="ad-metric-label">{m.label}</p>
                  <p className="ad-metric-value">{m.value}</p>
                </div>
              ))}
            </div>

            <SalesOverviewChart
              title="Resumo de vendas"
              caption={SALES_GRAPH_OPTIONS.find((option) => option.period === salesGraphPeriod)?.caption ?? "Tendência de vendas"}
              data={getSalesGraphData(dashboardData.salesCharts, salesGraphPeriod)}
              period={salesGraphPeriod}
              controls={
                <div className="ad-sales-period-toggle" aria-label="Período do gráfico de vendas">
                  {SALES_GRAPH_OPTIONS.map((option) => (
                    <button
                      key={option.period}
                      className={salesGraphPeriod === option.period ? "active" : ""}
                      onClick={() => setSalesGraphPeriod(option.period)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              }
            />

            <div className="ad-two-col">
              <div className="ad-card">
                <h2 className="ad-card-title">Produtos indisponíveis</h2>
                {dashboardData.unavailableProducts.length > 0 ? (
                  <table className="ad-table">
                    <thead>
                      <tr><th>Nome</th><th>Motivo</th><th>Ação</th></tr>
                    </thead>
                    <tbody>
                      {dashboardData.unavailableProducts.map((p) => (
                        <tr key={p.productId}>
                          <td data-label="Nome">{p.name}</td>
                          <td data-label="Motivo"><span className="ad-pill ad-pill-red">{p.unavailableReason}</span></td>
                          <td data-label="Ação">
                            <button
                              className="ad-btn ad-btn-primary ad-btn-sm"
                              onClick={async () => {
                                try {
                                  setActiveTab("products")
                                  const availableProducts = products.length === 0
                                    ? await listProducts(0, 100, true)
                                    : products
                                  if (products.length === 0) {
                                    setProducts(availableProducts.filter((product) => product.status !== "inactive" && !product.deletedAt))
                                    setDeletedProducts(availableProducts.filter((product) => product.status === "inactive" || product.deletedAt))
                                  }
                                  if (categories.length === 0) await handleLoadCategories()
                                  const fullProduct = availableProducts.find((product) => product.productId === p.productId)
                                  if (fullProduct) {
                                    await handleEditProduct(fullProduct, 1)
                                  }
                                } catch (err) { console.error(err) }
                              }}
                            >
                              Atualizar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="ad-empty">Todos os produtos ativos estão disponíveis</p>}
              </div>

              <div className="ad-card">
                <h2 className="ad-card-title">Produtos mais vendidos</h2>
                {dashboardData.popularProducts.length > 0 ? (
                  <table className="ad-table">
                    <thead><tr><th>#</th><th>Produto</th><th>Vendidos</th></tr></thead>
                    <tbody>
                      {dashboardData.popularProducts.map((p, i) => (
                        <tr key={p.productId}>
                          <td data-label="Posição"><span className="ad-rank">#{i + 1}</span></td>
                          <td data-label="Produto">{p.name}</td>
                          <td data-label="Vendidos"><strong>{p.sold}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="ad-empty">Ainda não há dados</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── PRODUCTS ── */}
        {activeTab === "categories" && (
          <div className="ad-content">
            <div className="ad-section-bar">
              <div>
                <h2 className="ad-section-title">Categories</h2>
                <p className="ad-section-sub">Gira as categorias do menu para os produtos e para a navegação dos clientes.</p>
              </div>
              <button className="ad-btn ad-btn-primary" onClick={openNewCategoryForm}>+ Add category</button>
            </div>

            {showCategoryForm && (
              <div className="ad-card ad-category-form-card">
                <h3 className="ad-card-title">{editingCategory ? "Editar categoria" : "Adicionar categoria"}</h3>
                <form className="ad-form" onSubmit={handleCategorySubmit}>
                  <div className="ad-form-row">
                    {editingCategory && (
                      <div className="ad-form-group">
                        <label>Category ID</label>
                        <input
                          value={editingCategory.categoryDisplayId ?? formatCategoryId(editingCategory.categoryId)}
                          disabled
                        />
                      </div>
                    )}
                    <div className="ad-form-group">
                      <label>Name</label>
                      <input
                        value={categoryForm.categoryName}
                        onChange={(event) => setCategoryForm({ ...categoryForm, categoryName: event.target.value })}
                        placeholder="Hambúrgueres"
                        required
                      />
                    </div>
                  </div>
                  <div className="ad-form-group">
                    <label>Description</label>
                    <textarea
                      rows={3}
                      value={categoryForm.categoryDescription ?? ""}
                      onChange={(event) => setCategoryForm({ ...categoryForm, categoryDescription: event.target.value })}
                      placeholder="Descrição interna curta..."
                    />
                  </div>
                  <div className="ad-form-actions">
                    <button type="submit" className="ad-btn ad-btn-primary">{editingCategory ? "Guardar categoria" : "Criar categoria"}</button>
                    <button type="button" className="ad-btn ad-btn-ghost" onClick={closeCategoryForm}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            <div className="ad-card ad-directory-toolbar">
              <label className="ad-review-search ad-directory-search">
                <span>Search categories</span>
                <Search size={17} />
                <input
                  type="search"
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.target.value)}
                  placeholder="ID, nome, descrição..."
                />
              </label>
              <div className="ad-directory-filters">
                <div className="ad-form-group">
                  <label>Category</label>
                  <CustomSelect
                    className="ad-select"
                    value={categoryIdFilter}
                    onChange={(nextValue) => setCategoryIdFilter(String(nextValue))}
                    options={[
                      { value: "", label: "All categories" },
                      ...categories.map((category) => ({
                        value: category.categoryId,
                        label: category.categoryName,
                      })),
                    ]}
                  />
                </div>
                <div className="ad-form-group">
                  <label>Status</label>
                  <CustomSelect
                    className="ad-select"
                    value={categoryStatusFilter}
                    onChange={(nextValue) => setCategoryStatusFilter(nextValue as DirectoryStatusFilter)}
                    options={DIRECTORY_STATUS_OPTIONS}
                  />
                </div>
              </div>
              <div className="ad-review-toolbar-meta">
                <span>{filteredCategories.length} apresentadas</span>
                {hasCategoryFilters && (
                  <button
                    type="button"
                    className="ad-btn ad-btn-sm ad-btn-ghost"
                    onClick={() => {
                      setCategorySearch("")
                      setCategoryIdFilter("")
                      setCategoryStatusFilter("all")
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="ad-category-grid">
              {filteredCategories.map((category) => {
                const activeCount = products.filter((product) => product.categoryId === category.categoryId && product.status === "active").length
                const isActive = category.status !== "inactive"

                return (
                  <article key={category.categoryId} className={`ad-category-card ${!isActive ? "inactive" : ""}`}>
                    <div className="ad-category-card-head">
                      <div>
                        <span className="ad-category-code">{category.categoryDisplayId ?? formatCategoryId(category.categoryId)}</span>
                        <h3>{category.categoryName}</h3>
                      </div>
                      <span className={`ad-pill ${isActive ? "ad-pill-green" : "ad-pill-gray"}`}>{isActive ? "active" : "inactive"}</span>
                    </div>
                    <p>{category.categoryDescription || "Sem descrição definida."}</p>
                    <div className="ad-category-meta">
                      <span>Produtos ativos</span>
                      <strong>{activeCount}</strong>
                    </div>
                    <div className="ad-category-actions">
                      <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => openEditCategoryForm(category)}>Editar</button>
                      {isActive ? (
                        <button className="ad-btn ad-btn-sm ad-btn-danger" onClick={() => handleDeactivateCategory(category.categoryId)}>Deactivate</button>
                      ) : (
                        <button className="ad-btn ad-btn-sm ad-btn-primary" onClick={() => handleRestoreCategory(category.categoryId)}>Restaurar</button>
                      )}
                    </div>
                  </article>
                )
              })}
              {categories.length === 0 && <p className="ad-empty">No categories found.</p>}
              {categories.length > 0 && filteredCategories.length === 0 && <p className="ad-empty">No categories match these filters.</p>}
            </div>
          </div>
        )}

        {activeTab === "ingredients" && (
          <div className="ad-content">
            <div className="ad-section-bar">
              <div>
                <p className="ad-section-kicker">
                  Admin Console · {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
                <h2 className="ad-section-title">Ingredientes</h2>
                <p className="ad-section-sub">Gerir os ingredientes removíveis que os clientes veem ao personalizar produtos.</p>
              </div>
              <button className="ad-btn ad-btn-primary" onClick={openNewIngredientForm}>Adicionar ingrediente</button>
            </div>

            {showIngredientForm && (
              <>
                <div className="ad-modal-backdrop" onClick={closeIngredientForm} />
                <div className="ad-modal ad-ingredient-modal" role="dialog" aria-modal="true" aria-labelledby="ingredient-modal-title">
                  <div className="ad-modal-header">
                    <h3 className="ad-modal-title" id="ingredient-modal-title">
                      {editingIngredient ? "Editar ingrediente" : "Adicionar ingrediente"}
                    </h3>
                    <button type="button" className="ad-modal-close" onClick={closeIngredientForm} aria-label="Fechar editor de ingrediente">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="ad-modal-body">
                    <form className="ad-form" onSubmit={handleIngredientSubmit}>
                      <div className="ad-form-row">
                        <div className="ad-form-group">
                          <label>Nome</label>
                          <input
                            value={ingredientForm.name}
                            onChange={(event) => setIngredientForm({ ...ingredientForm, name: event.target.value })}
                            placeholder="Queijo cheddar"
                            required
                          />
                        </div>
                        <div className="ad-form-group">
                          <label>Tipo</label>
                          <CustomSelect
                            className="ad-select"
                            value={ingredientForm.type}
                            onChange={(nextValue) => setIngredientForm({ ...ingredientForm, type: nextValue as IngredientType })}
                            options={INGREDIENT_TYPES.map((type) => ({
                              value: type,
                              label: ingredientTypeLabel(type),
                            }))}
                          />
                        </div>
                        <div className="ad-form-group">
                          <label>Calories per gram</label>
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={ingredientForm.caloriesPerGram ?? ""}
                            onChange={(event) => setIngredientForm({
                              ...ingredientForm,
                              caloriesPerGram: nullableNumberFromInput(event.target.value),
                            })}
                            placeholder="Opcional"
                          />
                        </div>
                        <div className="ad-form-group">
                          <label>Disponibilidade operacional</label>
                          <CustomSelect
                            className="ad-select"
                            value={ingredientForm.available ? "available" : "unavailable"}
                            onChange={(nextValue) => setIngredientForm({ ...ingredientForm, available: nextValue === "available" })}
                            options={[
                              { value: "available", label: "Disponível" },
                              { value: "unavailable", label: "Indisponível" },
                            ]}
                          />
                          <small>Independente do estado ativo ou arquivado.</small>
                        </div>
                      </div>
                      <div className="ad-form-actions">
                        <button type="submit" className="ad-btn ad-btn-primary">
                          {editingIngredient ? "Guardar ingrediente" : "Criar ingrediente"}
                        </button>
                        <button type="button" className="ad-btn ad-btn-ghost" onClick={closeIngredientForm}>Cancelar</button>
                      </div>
                    </form>
                  </div>
                </div>
              </>
            )}

            <div className="ad-ingredient-toolbar">
              <div className="ad-ingredient-search">
                <label htmlFor="ingredient-search">Pesquisar ingredientes</label>
                <input
                  id="ingredient-search"
                  type="search"
                  value={ingredientFilters.search}
                  onChange={(event) => setIngredientFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Pesquisar guacamole, cheddar, pico..."
                />
              </div>
              <div className="ad-ingredient-filter">
                <label htmlFor="ingredient-type">Tipo</label>
                <CustomSelect
                  id="ingredient-type"
                  className="ad-select"
                  value={ingredientFilters.type}
                  onChange={(nextValue) => setIngredientFilters((current) => ({ ...current, type: nextValue as "" | IngredientType }))}
                  options={[
                    { value: "", label: "Todos os tipos" },
                    ...INGREDIENT_TYPES.filter((type) => type !== "drink").map((type) => ({
                      value: type,
                      label: ingredientTypeLabel(type),
                    })),
                  ]}
                />
              </div>
              <div className="ad-ingredient-filter">
                <label htmlFor="ingredient-status">Estado</label>
                <CustomSelect
                  id="ingredient-status"
                  className="ad-select"
                  value={ingredientFilters.status}
                  onChange={(nextValue) => setIngredientFilters((current) => ({ ...current, status: nextValue as "all" | "active" | "inactive" }))}
                  options={[
                    { value: "all", label: "Todos os estados" },
                    { value: "active", label: "Ativos" },
                    { value: "inactive", label: "Inativos" },
                  ]}
                />
              </div>
              <div className="ad-ingredient-toolbar-meta">
                <span>{filteredIngredients.length} de {ingredients.length}</span>
                <button type="button" className="ad-btn ad-btn-ghost" onClick={clearIngredientFilters}>Limpar filtros</button>
              </div>
            </div>

            <div className="ad-ingredient-grid">
              {filteredIngredients.map((ingredient) => {
                const isActive = ingredient.status !== "inactive"
                const linkedProducts = allAdminProducts.filter((product) => (
                  product.ingredients?.some((item) => item.ingredientId === ingredient.ingredientId)
                ))

                return (
                  <article key={ingredient.ingredientId} className={`ad-ingredient-card ${!isActive ? "inactive" : ""}`}>
                    <div className="ad-ingredient-card-head">
                      <div>
                        <span className="ad-category-code">#{ingredient.ingredientId}</span>
                        <h3>{ingredient.name}</h3>
                      </div>
                      <div>
                        <span className={`ad-pill ${isActive ? "ad-pill-green" : "ad-pill-gray"}`}>{isActive ? "ativo" : "inativo"}</span>
                        <span className={`ad-pill ${ingredient.available ? "ad-pill-green" : "ad-pill-red"}`}>{ingredient.available ? "disponível" : "indisponível"}</span>
                      </div>
                    </div>
                    <div className="ad-ingredient-meta">
                      <span>{ingredientTypeLabel(ingredient.type)}</span>
                      <span>{ingredient.caloriesPerGram == null ? "kcal/g por definir" : `${formatCalories(ingredient.caloriesPerGram)} kcal/g`}</span>
                      <div className="ad-ingredient-linked-products">
                        <button
                          type="button"
                          className="ad-ingredient-linked-trigger"
                          aria-haspopup="true"
                          aria-label={`${linkedProducts.length} produtos associados a ${ingredient.name}`}
                        >
                          <strong>{linkedProducts.length}</strong>
                          <span>{linkedProducts.length === 1 ? "produto" : "produtos"}</span>
                        </button>
                        <div className="ad-ingredient-products-popover" role="tooltip">
                          {linkedProducts.length > 0 ? (
                            linkedProducts.map((product) => (
                              <button
                                key={product.productId}
                                type="button"
                                className={`ad-linked-product-row ${product.status === "inactive" ? "disabled" : ""}`}
                                onClick={() => handleOpenLinkedIngredientProduct(product)}
                              >
                                <code>{product.productDisplayId ?? formatProductId(product.productId)}</code>
                                <span>{product.name}</span>
                              </button>
                            ))
                          ) : (
                            <span className="ad-linked-product-empty">Sem produtos associados</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!isActive && (
                      <div className="ad-ingredient-warning">
                        Ingrediente inativo - os produtos associados podem ser afetados
                      </div>
                    )}
                    <div className="ad-category-actions">
                      <button
                        className={`ad-btn ad-btn-sm ${ingredient.available ? "ad-btn-ghost" : "ad-btn-primary"}`}
                        disabled={availabilityBusyKey === `ingredient-${ingredient.ingredientId}`}
                        onClick={() => void handleSetIngredientAvailability(ingredient, !ingredient.available)}
                        type="button"
                      >
                        {availabilityBusyKey === `ingredient-${ingredient.ingredientId}`
                          ? "A guardar..."
                          : ingredient.available ? "Marcar indisponível" : "Marcar disponível"}
                      </button>
                      <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => openEditIngredientForm(ingredient)}>Editar</button>
                      {isActive ? (
                        <button className="ad-btn ad-btn-sm ad-btn-danger" onClick={() => handleDeactivateIngredient(ingredient.ingredientId)}>Desativar</button>
                      ) : (
                        <button className="ad-btn ad-btn-sm ad-btn-primary" onClick={() => handleRestoreIngredient(ingredient.ingredientId)}>Restaurar</button>
                      )}
                    </div>
                  </article>
                )
              })}
              {ingredients.length === 0 && <p className="ad-empty">Nenhum ingrediente encontrado.</p>}
              {ingredients.length > 0 && filteredIngredients.length === 0 && <p className="ad-empty">Nenhum ingrediente corresponde a estes filtros.</p>}
            </div>
          </div>
        )}

        {activeTab === "products" && (
          <div className="ad-content">
            <div className="ad-section-bar">
              <h2 className="ad-section-title">Todos os produtos</h2>
              <button className="ad-btn ad-btn-primary" onClick={openNewForm}>Adicionar produto</button>
            </div>

            {/* Filters */}
            <div className="ad-product-toolbar">
              <div className="ad-product-filter-row">
                <div className="ad-form-group">
                  <label>Pesquisar por name</label>
                  <input
                    type="text"
                    placeholder="Nome do produto..."
                    value={filters.name}
                    onChange={e => setFilters({ ...filters, name: e.target.value })}
                  />
                </div>
                <div className="ad-form-group">
                  <label>Categoria</label>
                  <div className={`ad-filter-select ${categoryFilterOpen ? "open" : ""}`} ref={categoryFilterRef}>
                    <button
                      type="button"
                      className="ad-filter-select-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={categoryFilterOpen}
                      onClick={() => setCategoryFilterOpen((current) => !current)}
                    >
                      <span>{selectedProductFilterCategory}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {categoryFilterOpen && (
                      <div className="ad-filter-select-menu" role="listbox" aria-label="Filtrar produtos por categoria">
                        <button
                          type="button"
                          role="option"
                          aria-selected={filters.category === ""}
                          className={filters.category === "" ? "selected" : ""}
                          onClick={() => {
                            setFilters({ ...filters, category: "" })
                            setCategoryFilterOpen(false)
                          }}
                        >
                          <span>Todas as categorias</span>
                          {filters.category === "" && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                              <path d="m5 13 4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        {activeCategories.map((cat) => {
                          const selected = filters.category === cat.categoryId

                          return (
                            <button
                              key={cat.categoryId}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={selected ? "selected" : ""}
                              onClick={() => {
                                setFilters({ ...filters, category: cat.categoryId })
                                setCategoryFilterOpen(false)
                              }}
                            >
                              <span>{cat.categoryName}</span>
                              {selected && (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                  <path d="m5 13 4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="ad-form-group">
                  <label style={{ fontSize: "0.85rem" }}>Preço mínimo (€)</label>
                  <input
                    type="number" placeholder="0.00" step="0.01" min="0"
                    value={filters.minPrice}
                    onChange={e => setFilters({ ...filters, minPrice: e.target.value })}
                    style={{ fontSize: "0.9rem" }}
                  />
                </div>
                <div className="ad-form-group">
                  <label style={{ fontSize: "0.85rem" }}>Preço máximo (€)</label>
                  <input
                    type="number" placeholder="999.99" step="0.01" min="0"
                    value={filters.maxPrice}
                    onChange={e => setFilters({ ...filters, maxPrice: e.target.value })}
                    style={{ fontSize: "0.9rem" }}
                  />
                </div>
                <label className="ad-product-filter-check">
                  <input
                    type="checkbox"
                    checked={filters.featured}
                    onChange={(event) => setFilters({ ...filters, featured: event.target.checked })}
                  />
                  <span>Em destaque</span>
                </label>
                <label className="ad-product-filter-check">
                  <input
                    type="checkbox"
                    checked={filters.glutenFree}
                    onChange={(event) => setFilters({ ...filters, glutenFree: event.target.checked })}
                  />
                  <span>Sem glúten</span>
                </label>
                <label className="ad-product-filter-check">
                  <input
                    type="checkbox"
                    checked={filters.containsAlcohol}
                    onChange={(event) => setFilters({ ...filters, containsAlcohol: event.target.checked })}
                  />
                  <span>Álcool</span>
                </label>
              </div>
              <div className="ad-product-filter-actions">
                <button
                  className="ad-btn ad-btn-ghost"
                  onClick={() => {
                    setFilters({ ...EMPTY_PRODUCT_FILTERS })
                    setCategoryFilterOpen(false)
                  }}
                  style={{ fontSize: "0.9rem" }}
                >
                  Limpar filtros
                </button>
              </div>
            </div>

            {/* Product Form Modal */}
            {showProductForm && (
              <>
                <div className="ad-modal-backdrop" />
                <div className="ad-modal ad-product-modal">
                  <div className="ad-product-modal-header">
                    <div>
                      <p className="ad-product-modal-kicker">Produto do menu</p>
                      <h3>{editingProduct ? "Editar produto" : "Criar produto"}</h3>
                      <span>Preencha os detalhes do produto, a personalização para clientes e as imagens num fluxo simples.</span>
                    </div>
                    <button type="button" className="ad-modal-close ad-product-close" onClick={closeForm} aria-label="Fechar editor de produto">
                      <X size={20} />
                    </button>
                    <nav className="ad-product-stepper-progress" aria-label="Progresso do formulário do produto">
                      {PRODUCT_FORM_STEPS.map((step, index) => (
                        <button
                          key={step}
                          type="button"
                          className={[
                            "ad-product-stepper-item",
                            index < productFormStep ? "is-complete" : "",
                            index === productFormStep ? "is-current" : "",
                          ].filter(Boolean).join(" ")}
                          onClick={() => goToProductStep(index)}
                          aria-current={index === productFormStep ? "step" : undefined}
                        >
                          <span>{index + 1}</span>
                          <strong>{step}</strong>
                        </button>
                      ))}
                    </nav>
                  </div>
                  <div className="ad-modal-body">
                    <form
                      noValidate
                      onSubmit={handleProductSubmit}
                      className={`ad-product-editor ad-product-stepper-form ad-product-step-${productFormStep}`}
                    >
                      <aside className="ad-product-progress-rail" aria-label="Secções do editor de produto">
                        <div>
                          <span>Fluxo</span>
                          <strong>{editingProduct ? "Atualizar produto" : "Novo produto"}</strong>
                        </div>
                        <a href="#product-basic">01 Básico</a>
                        <a href="#product-pricing">02 Preço</a>
                        <a href="#product-ingredients">03 Ingredientes</a>
                        <a href="#product-config">04 Opções</a>
                        <a href="#product-media">05 Multimédia</a>
                        <div className="ad-product-progress-summary">
                          <span>{formData.ingredients.length} ingredientes</span>
                          <span>{formatCalories(calorieMode === "auto" ? calculatedProductCalories : formData.totalCalories)} kcal</span>
                        </div>
                      </aside>

                      <section className="ad-product-section" id="product-basic">
                        <div className="ad-product-section-head">
                          <div>
                            <h4>Informação básica</h4>
                            <p>Nome, category e descrição visível para os clientes.</p>
                          </div>
                          <span className="ad-product-section-step">01</span>
                        </div>
                        <div className="ad-product-form-grid">
                          <label className="ad-field">
                            <span>Nome do produto</span>
                            <input
                              type="text"
                              value={formData.name}
                              onChange={e => setFormData({ ...formData, name: e.target.value })}
                              placeholder="Hambúrguer de cheddar fumado"
                              required
                            />
                          </label>
                          <label className="ad-field">
                            <span>Categoria</span>
                            <CustomSelect
                              value={formData.categoryId}
                              onChange={(nextValue) => setFormData({ ...formData, categoryId: Number(nextValue) || 0 })}
                              placeholder={categories.length === 0 ? "A carregar categorias..." : "Selecione uma categoria"}
                              options={[
                                { value: "", label: categories.length === 0 ? "A carregar categorias..." : "Selecione uma categoria" },
                                ...categories.filter((cat) => cat.status !== "inactive").map((cat) => ({
                                  value: cat.categoryId,
                                  label: cat.categoryName,
                                })),
                              ]}
                            />
                          </label>
                          {editingProduct && (
                            <label className="ad-field ad-field-compact">
                              <span>ID do produto</span>
                              <input
                                type="text"
                                value={editingProduct.productDisplayId ?? formatProductId(editingProduct.productId)}
                                disabled
                              />
                            </label>
                          )}
                          <label className="ad-field ad-field-full">
                            <span>Descrição</span>
                            <textarea
                              rows={4}
                              value={formData.productDescription}
                              onChange={e => setFormData({ ...formData, productDescription: e.target.value })}
                              placeholder="Uma descrição curta e cuidada que os clientes verão na página do produto."
                            />
                          </label>
                        </div>
                      </section>

                      <section className="ad-product-section" id="product-pricing">
                        <div className="ad-product-section-head">
                          <div>
                            <h4>Preço e disponibilidade</h4>
                            <p>Defina o preço, a disponibilidade operacional e a promoção ativa.</p>
                          </div>
                          <span className="ad-product-section-step">02</span>
                        </div>
                        <div className="ad-product-form-grid ad-product-form-grid-3">
                          <label className="ad-field">
                            <span>Preço em euros <em aria-hidden="true">*</em></span>
                            <div className="ad-money-input">
                              <strong>EUR</strong>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={formData.price === 0 ? "" : formData.price}
                                onChange={e => setFormData({ ...formData, price: Number(e.target.value || 0) })}
                                required
                              />
                            </div>
                          </label>
                          <label className="ad-field">
                            <span>Percentagem de desconto</span>
                            <div className="ad-money-input">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                value={formData.discountPercentage === 0 ? "" : formData.discountPercentage}
                                onChange={e => setFormData({ ...formData, discountPercentage: Number(e.target.value || 0) })}
                              />
                              <strong>%</strong>
                            </div>
                          </label>
                          <label className="ad-field">
                            <span>Disponibilidade operacional</span>
                            <CustomSelect
                              className="ad-select"
                              value={formData.available ? "available" : "unavailable"}
                              onChange={(nextValue) => setFormData({ ...formData, available: nextValue === "available" })}
                              options={[
                                { value: "available", label: "Disponível" },
                                { value: "unavailable", label: "Indisponível" },
                              ]}
                            />
                          </label>
                        </div>
                      </section>

                      <section className="ad-product-section" id="product-config">
                        <div className="ad-product-section-head">
                          <div>
                            <h4>Configuração</h4>
                            <p>Controle destaques, personalização e etiquetas do menu.</p>
                          </div>
                          <span className="ad-product-section-step">04</span>
                        </div>
                        <div className="ad-config-grid">
                          <button
                            type="button"
                            className={`ad-switch-card ${formData.featured ? "active" : ""}`}
                            onClick={() => setFormData({ ...formData, featured: !formData.featured })}
                          >
                            <span className="ad-switch-control"><i /></span>
                            <strong>Produto em destaque</strong>
                            <small>Mostra este item nas áreas promocionais do menu.</small>
                          </button>
                          <button
                            type="button"
                            className={`ad-switch-card ${formData.customizable ? "active" : ""}`}
                            onClick={() => setFormData({ ...formData, customizable: !formData.customizable })}
                          >
                            <span className="ad-switch-control"><i /></span>
                            <strong>Personalizável</strong>
                            <small>Mostra controlos de ingredientes na página de detalhe do produto.</small>
                          </button>
                          <button
                            type="button"
                            className={`ad-switch-card ${formData.glutenFree ? "active" : ""}`}
                            onClick={() => setFormData({ ...formData, glutenFree: !formData.glutenFree })}
                          >
                            <span className="ad-switch-control"><i /></span>
                            <strong>Sem glúten</strong>
                            <small>Permite aos clientes filtrar este item como sem glúten.</small>
                          </button>
                          <button
                            type="button"
                            className={`ad-switch-card ${formData.containsAlcohol ? "active" : ""}`}
                            onClick={() => setFormData({ ...formData, containsAlcohol: !formData.containsAlcohol })}
                          >
                            <span className="ad-switch-control"><i /></span>
                            <strong>Contém álcool</strong>
                            <small>Separa bebidas alcoólicas das bebidas sem álcool.</small>
                          </button>
                          <label className="ad-field ad-field-full">
                            <span>Etiquetas do menu</span>
                            <div className="ad-tag-input">
                              {productTags.map((tag) => (
                                <button key={tag} type="button" onClick={() => removeProductTag(tag)}>
                                  {tag}
                                  <X size={13} />
                                </button>
                              ))}
                              <input
                                type="text"
                                value={productTagInput}
                                onChange={(event) => setProductTagInput(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault()
                                    addProductTag()
                                  }
                                }}
                                placeholder="Escreva uma etiqueta e prima Enter"
                              />
                            </div>
                          </label>
                        </div>
                      </section>

                      <section className="ad-product-section ad-product-ingredients-section" id="product-ingredients">
                        <div className="ad-product-section-head">
                          <div>
                            <h4>Gestão de ingredientes</h4>
                            <p>Selecione primeiro os ingredientes e depois atribua quantidades para calcular calorias automaticamente.</p>
                          </div>
                          <div className="ad-product-section-badges">
                            <span className="ad-product-section-step">03</span>
                            <span className="ad-counter-pill">{formData.ingredients.length} selecionados</span>
                            <span className="ad-counter-pill">
                              {formatCalories(calorieMode === "auto" ? calculatedProductCalories : formData.totalCalories)} kcal
                            </span>
                          </div>
                        </div>

                        <div className="ad-step4-mode-toggle" aria-label="Modo de calorias">
                          <button
                            type="button"
                            className={calorieMode === "auto" ? "active" : ""}
                            onClick={() => void switchCalorieMode("auto")}
                          >
                            Automático
                          </button>
                          <button
                            type="button"
                            className={calorieMode === "manual" ? "active" : ""}
                            onClick={() => void switchCalorieMode("manual")}
                          >
                            Manual
                          </button>
                        </div>

                        {calorieMode === "manual" ? (
                          <label className="ad-step4-manual-input">
                            <span>Total de calorias</span>
                            <div className="ad-step4-kcal-input">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={formData.totalCalories ?? ""}
                                onChange={(event) => setFormData({
                                  ...formData,
                                  totalCalories: nullableNumberFromInput(event.target.value),
                                })}
                                placeholder="0"
                              />
                              <strong>kcal</strong>
                            </div>
                          </label>
                        ) : (
                          <div className="ad-step4-grid">
                            <section className="ad-step4-box ad-step4-picker-box" aria-label="Seletor de ingredientes">
                              <div className="ad-step4-box-head">
                                <strong>Seletor de ingredientes</strong>
                                <span>{activeProductIngredients.length} disponíveis</span>
                              </div>
                              <input
                                className="ad-step4-search"
                                type="search"
                                value={productIngredientSearch}
                                onChange={(event) => setProductIngredientSearch(event.target.value)}
                                placeholder="Pesquisar ingredientes..."
                              />
                              <div className="ad-new-ingredient-row ad-step4-new-ingredient-row">
                                <input
                                  type="text"
                                  value={newProductIngredientName}
                                  disabled={creatingProductIngredient}
                                  onChange={(event) => setNewProductIngredientName(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault()
                                      void addNewProductIngredient()
                                    }
                                  }}
                                  placeholder="Adicionar novo ingrediente..."
                                />
                                <CustomSelect
                                  className="ad-select"
                                  value={newProductIngredientType}
                                  disabled={creatingProductIngredient}
                                  onChange={(nextValue) => setNewProductIngredientType(nextValue as IngredientType)}
                                  options={STEP4_INGREDIENT_TYPES.map((type) => ({
                                    value: type,
                                    label: ingredientTypeLabel(type),
                                  }))}
                                />
                                <input
                                  className="ad-step4-kcal-gram-input"
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  inputMode="decimal"
                                  value={newProductIngredientCalories}
                                  disabled={creatingProductIngredient}
                                  onChange={(event) => setNewProductIngredientCalories(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault()
                                      void addNewProductIngredient()
                                    }
                                  }}
                                  aria-label="Calorias por grama"
                                  placeholder="kcal/g"
                                />
                                <button
                                  type="button"
                                  className="ad-btn ad-btn-ghost"
                                  onClick={() => void addNewProductIngredient()}
                                  disabled={creatingProductIngredient || !newProductIngredientName.trim()}
                                >
                                  {creatingProductIngredient ? "A guardar..." : "Adicionar"}
                                </button>
                              </div>
                              <div className="ad-step4-pill-groups">
                                {productIngredientChipGroups.map((group) => (
                                  <div key={group.type} className="ad-step4-pill-group">
                                    <span>{group.type.replace("_", " ").toLowerCase()}</span>
                                    <div>
                                      {group.items.map((ingredient) => {
                                        const selected = selectedIngredientIds.has(ingredient.ingredientId)
                                        const selectedIngredient = formData.ingredients.find((item) => item.ingredientId === ingredient.ingredientId)
                                        const missingQuantity = !!selectedIngredient && !hasIngredientQuantity(selectedIngredient)

                                        return (
                                          <button
                                            key={ingredient.ingredientId}
                                            type="button"
                                            className={[
                                              "ad-step4-chip",
                                              selected ? "active" : "",
                                              missingQuantity ? "missing" : "",
                                            ].filter(Boolean).join(" ")}
                                            onClick={() => handleIngredientPillToggle(ingredient)}
                                            aria-pressed={selected}
                                          >
                                            {ingredient.name}
                                            {missingQuantity && <i aria-hidden="true" />}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ))}
                                {productIngredientChipGroups.length === 0 && (
                                  <p className="ad-empty ad-empty-compact">Nenhum ingrediente encontrado.</p>
                                )}
                              </div>
                            </section>

                            <section className="ad-step4-box ad-step4-quantity-box" aria-label="Seletor de quantidade">
                              <div className="ad-step4-box-head">
                                <strong>Seletor de quantidade</strong>
                                <span>Aplica-se aos ingredientes selecionados sem quantidade</span>
                              </div>
                              <div className="ad-step4-quantity-row">
                                {quantityOptions.map((quantity) => (
                                  <button
                                    key={quantity}
                                    type="button"
                                    className={`ad-step4-chip ${selectedQuantity === quantity ? "active" : ""}`}
                                    onClick={() => assignQuantityToPendingIngredients(quantity)}
                                  >
                                    {quantity}
                                  </button>
                                ))}
                                {!isCustomQuantityOpen ? (
                                  <button
                                    type="button"
                                    className="ad-step4-add-quantity"
                                    onClick={() => setIsCustomQuantityOpen(true)}
                                    aria-label="Adicionar quantidade predefinida"
                                  >
                                    +
                                  </button>
                                ) : (
                                  <div className="ad-step4-custom-quantity">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.1"
                                      value={customQuantityValue}
                                      onChange={(event) => setCustomQuantityValue(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault()
                                          saveCustomQuantityChip()
                                        }
                                        if (event.key === "Escape") {
                                          event.preventDefault()
                                          cancelCustomQuantityChip()
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <span>g</span>
                                    <button type="button" onClick={saveCustomQuantityChip}>Adicionar</button>
                                    <button type="button" onClick={cancelCustomQuantityChip} aria-label="Cancelar quantidade personalizada">
                                      <X size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="ad-step4-assignment-zone">
                                {formData.ingredients.map((ingredient, index) => {
                                  const caloriesPerGram = ingredientCaloriesPerGram(ingredient)
                                  const ingredientCalories = calculateIngredientCalories(ingredient)
                                  const hasQuantity = hasIngredientQuantity(ingredient)

                                  return (
                                    <span
                                      key={`${ingredient.ingredientId ?? ingredient.name}-${index}`}
                                      className={`ad-step4-assigned-chip ${hasQuantity ? "" : "missing"}`}
                                    >
                                      {ingredient.name}
                                      <strong>{hasQuantity ? ingredient.quantity : "Falta quantidade"}</strong>
                                      {hasQuantity && caloriesPerGram !== null && <em>{formatCalories(ingredientCalories)} kcal</em>}
                                      <button type="button" onClick={() => removeProductIngredient(index)} aria-label={`Remover ${ingredient.name}`}>
                                        <X size={12} />
                                      </button>
                                    </span>
                                  )
                                })}
                                {formData.ingredients.length === 0 && (
                                  <p>Selecione primeiro os ingredientes e depois escolha uma quantidade.</p>
                                )}
                              </div>
                            </section>

                            <section className="ad-step4-box ad-step4-breakdown-box" aria-label="Discriminação de calorias">
                              <div className="ad-step4-box-head">
                                <strong>Discriminação de calorias</strong>
                                <span>Total atualizado dos ingredientes</span>
                              </div>
                              <div className="ad-step4-breakdown-list">
                                {assignedProductIngredientPairs.map(({ ingredient, index }) => {
                                  const grams = parseQuantityToGrams(ingredient.quantity)
                                  const caloriesPerGram = ingredientCaloriesPerGram(ingredient)
                                  const ingredientCalories = calculateIngredientCalories(ingredient)
                                  const hasCalculation = grams !== null && caloriesPerGram !== null

                                  return (
                                    <div key={`${ingredient.ingredientId ?? ingredient.name}-${index}`} className="ad-step4-breakdown-row">
                                      <strong>{ingredient.name}</strong>
                                      <span>
                                        {hasCalculation ? `${formatCalories(grams)}g x ${formatCalories(caloriesPerGram)} kcal/g` : "kcal/g não definido"}
                                      </span>
                                      <em>{hasCalculation ? `${formatCalories(ingredientCalories)} kcal` : "-"}</em>
                                    </div>
                                  )
                                })}
                                {assignedProductIngredientPairs.length === 0 && (
                                  <p className="ad-empty ad-empty-compact">Ainda não há quantidades atribuídas aos ingredientes.</p>
                                )}
                                <div className="ad-step4-breakdown-row total">
                                  <strong>Total</strong>
                                  <span>Calorias automáticas guardadas do produto</span>
                                  <em>{formatCalories(selectedIngredientCaloriesTotal)} kcal</em>
                                </div>
                              </div>
                            </section>
                          </div>
                        )}
                      </section>

                      <section className="ad-product-section" id="product-media">
                        <div className="ad-product-section-head">
                          <div>
                            <h4>Multimédia</h4>
                            <p>Carregue uma imagem nítida do produto para o menu e para a página de detalhes.</p>
                          </div>
                          <span className="ad-product-section-step">05</span>
                        </div>
                        <div
                          className={`ad-media-uploader ${hasProductMedia ? "has-preview" : ""} ${isProductImageDragging ? "is-dragging" : ""}`}
                          onDragEnter={(event) => {
                            event.preventDefault()
                            setIsProductImageDragging(true)
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDragLeave={(event) => {
                            event.preventDefault()
                            setIsProductImageDragging(false)
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            setIsProductImageDragging(false)
                            handleProductImageFiles(event.dataTransfer.files)
                          }}
                        >
                          <input
                            ref={productImageInputRef}
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                            onChange={event => {
                              handleProductImageFiles(event.target.files)
                              event.currentTarget.value = ""
                            }}
                          />
                          {hasProductMedia ? (
                            <div className="ad-media-preview-list">
                              {productMediaPreviewItems.map((item, index) => (
                                <div className="ad-media-preview" key={`${item.src}-${index}`}>
                                  <img src={item.src} alt={`Product preview ${index + 1}`} onError={handleAdminImageError} />
                                  <div>
                                    <strong>{item.name}</strong>
                                    <span>{item.status}</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="ad-btn ad-btn-sm ad-btn-danger ad-media-remove"
                                    disabled={!item.isPendingUpload && deletingProductMediaId === item.mediaId}
                                    onClick={() => {
                                      if (item.isPendingUpload) {
                                        removePendingProductImage(index, item.fileIndex)
                                        return
                                      }
                                      if (item.mediaId != null) {
                                        void handleDeleteExistingProductMedia(item.mediaId, index)
                                      }
                                    }}
                                  >
                                    {!item.isPendingUpload && deletingProductMediaId === item.mediaId ? "A remover..." : "Remover"}
                                  </button>
                                </div>
                              ))}
                              <div className="ad-media-preview-actions">
                                <button type="button" className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => productImageInputRef.current?.click()}>
                                  {imageFiles.length > 0 ? "Adicionar mais imagens" : "Adicionar imagens"}
                                </button>
                                {imageFiles.length > 0 && (
                                  <button type="button" className="ad-btn ad-btn-sm ad-btn-danger" onClick={() => {
                                    setImageFiles([])
                                    setImagePreviews((editingProduct?.media ?? []).map((media) => getImageUrl(productMediaUrl(media, "card") ?? media.originalUrl)))
                                  }}>
                                    Clear selected
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <button type="button" className="ad-upload-empty" onClick={() => productImageInputRef.current?.click()}>
                              <span>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                  <path d="M17 8l-5-5-5 5M12 3v12" />
                                </svg>
                              </span>
                              <strong>Largue as imagens aqui ou procure no dispositivo</strong>
                              <small>PNG, JPG, WebP, AVIF, or GIF.</small>
                            </button>
                          )}
                        </div>
                      </section>

                      <div className="ad-product-modal-footer">
                        <button
                          type="button"
                          className="ad-btn ad-btn-ghost"
                          onClick={goToPreviousProductStep}
                          disabled={productFormStep === 0}
                        >
                          Back
                        </button>
                        <div className="ad-product-forward-actions">
                          {(productFormMessage || productStepContinueBlocked) && (
                            <span className="ad-product-step-warning">
                              {productFormMessage || `${missingIngredientQuantityCount} ${missingIngredientQuantityCount === 1 ? "ingrediente sem quantidade" : "ingredientes sem quantidade"}`}
                            </span>
                          )}
                          {productFormStep < PRODUCT_FORM_STEPS.length - 1 ? (
                            <div className="ad-product-action-buttons">
                              {editingProduct && (
                                <button
                                  type="button"
                                  className="ad-btn ad-btn-primary"
                                  onClick={() => void handleFinishProductEdit()}
                                >
                                  Finish
                                </button>
                              )}
                              <button
                                type="button"
                                className={`ad-btn ${editingProduct ? "ad-btn-ghost" : "ad-btn-primary"}`}
                                onClick={goToNextProductStep}
                              >
                                Continue
                              </button>
                            </div>
                          ) : (
                            <button type="submit" className="ad-btn ad-btn-primary">
                              {editingProduct ? "Guardar alterações" : "Criar produto"}
                            </button>
                          )}
                        </div>
                      </div>
                    </form>

                    <form onSubmit={handleProductSubmit} className="ad-form ad-product-legacy-form">
                      <div className="ad-form-row">
                        {editingProduct && (
                          <div className="ad-form-group">
                            <label>Product ID</label>
                            <input
                              type="text"
                              value={editingProduct.productDisplayId ?? formatProductId(editingProduct.productId)}
                              disabled
                            />
                          </div>
                        )}
                        <div className="ad-form-group">
                          <label>Name</label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <div className="ad-form-group">
                        <label>Description</label>
                        <textarea
                          rows={3}
                          value={formData.productDescription}
                          onChange={e => setFormData({ ...formData, productDescription: e.target.value })}
                        />
                      </div>

                      <div className="ad-form-row">
                        <div className="ad-form-group">
                          <label>Price (€)</label>
                          <input
                            type="number" step="0.01" min="0"
                            value={formData.price}
                            onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                            required
                          />
                        </div>
                        <div className="ad-form-group">
                          <label>Disponibilidade operacional</label>
                          <CustomSelect
                            className="ad-select"
                            value={formData.available ? "available" : "unavailable"}
                            onChange={(nextValue) => setFormData({ ...formData, available: nextValue === "available" })}
                            options={[
                              { value: "available", label: "Disponível" },
                              { value: "unavailable", label: "Indisponível" },
                            ]}
                          />
                        </div>
                        <div className="ad-form-group">
                          <label>Category</label>
                          <CustomSelect
                            className="ad-select"
                            value={formData.categoryId}
                            onChange={(nextValue) => setFormData({ ...formData, categoryId: Number(nextValue) || 0 })}
                            placeholder={categories.length === 0 ? "A carregar categorias..." : "Selecione uma categoria"}
                            options={[
                              { value: "", label: categories.length === 0 ? "A carregar categorias..." : "Selecione uma categoria" },
                              ...categories.filter((cat) => cat.status !== "inactive").map((cat) => ({
                                value: cat.categoryId,
                                label: cat.categoryName,
                              })),
                            ]}
                          />
                        </div>
                      </div>

                      <div className="ad-form-row">
                        <div className="ad-form-group">
                          <label>Menu tags</label>
                          <input
                            type="text"
                            value={formData.menuTags}
                            onChange={e => setFormData({ ...formData, menuTags: e.target.value })}
                            placeholder="Mais popular, Novo, Picante"
                          />
                        </div>
                        <div className="ad-form-group">
                          <label>Discount (%)</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            max="100"
                            value={formData.discountPercentage}
                            onChange={e => setFormData({ ...formData, discountPercentage: Number(e.target.value || 0) })}
                          />
                        </div>
                      </div>

                      <div className="ad-form-row ad-form-toggles">
                        <label className="ad-checkbox-row">
                          <input
                            type="checkbox"
                            checked={formData.featured}
                            onChange={e => setFormData({ ...formData, featured: e.target.checked })}
                          />
                          <span>Produto em destaque</span>
                        </label>
                        <label className="ad-checkbox-row">
                          <input
                            type="checkbox"
                            checked={formData.customizable}
                            onChange={e => setFormData({ ...formData, customizable: e.target.checked })}
                          />
                          <span>Customizable</span>
                        </label>
                        <label className="ad-checkbox-row">
                          <input
                            type="checkbox"
                            checked={formData.glutenFree}
                            onChange={e => setFormData({ ...formData, glutenFree: e.target.checked })}
                          />
                          <span>Sem glúten</span>
                        </label>
                        <label className="ad-checkbox-row">
                          <input
                            type="checkbox"
                            checked={formData.containsAlcohol}
                            onChange={e => setFormData({ ...formData, containsAlcohol: e.target.checked })}
                          />
                          <span>Contém álcool</span>
                        </label>
                      </div>

                      <div className="ad-product-ingredients">
                        <div className="ad-product-ingredients-head">
                          <div>
                            <h4>Ingredientes</h4>
                            <p>Escolha os ingredientes removíveis que os clientes podem ajustar na página de detalhe do produto.</p>
                          </div>
                          <span className="ad-pill ad-pill-gray">{formData.ingredients.length} selecionados</span>
                        </div>

                        <div className="ad-ingredient-picker">
                          {ingredients.filter((ingredient) => ingredient.status !== "inactive").map((ingredient) => (
                            <button
                              key={ingredient.ingredientId}
                              type="button"
                              className={`ad-ingredient-choice ${isProductIngredientSelected(ingredient.ingredientId) ? "selected" : ""}`}
                              onClick={() => toggleProductIngredient(ingredient)}
                            >
                              <span>{ingredient.name}</span>
                              <small>{ingredientTypeLabel(ingredient.type)}</small>
                            </button>
                          ))}
                          {ingredients.filter((ingredient) => ingredient.status !== "inactive").length === 0 && (
                            <p className="ad-empty ad-empty-compact">Ainda não há ingredientes guardados.</p>
                          )}
                        </div>

                        <div className="ad-new-ingredient-row">
                          <input
                            type="text"
                            value={newProductIngredientName}
                            disabled={creatingProductIngredient}
                            onChange={(event) => setNewProductIngredientName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                void addNewProductIngredient()
                              }
                            }}
                            placeholder="Adicionar novo ingrediente..."
                          />
                          <CustomSelect
                            className="ad-select"
                            value={newProductIngredientType}
                            disabled={creatingProductIngredient}
                            onChange={(nextValue) => setNewProductIngredientType(nextValue as IngredientType)}
                            options={INGREDIENT_TYPES.map((type) => ({
                              value: type,
                              label: ingredientTypeLabel(type),
                            }))}
                          />
                          <button
                            type="button"
                            className="ad-btn ad-btn-ghost"
                            onClick={() => void addNewProductIngredient()}
                            disabled={creatingProductIngredient || !newProductIngredientName.trim()}
                          >
                            {creatingProductIngredient ? "Saving..." : "Add"}
                          </button>
                        </div>

                        {formData.ingredients.length > 0 && (
                          <div className="ad-selected-ingredients">
                            {formData.ingredients.map((ingredient, index) => {
                              const canRemoveIngredient = isRemovableProductIngredientType(ingredient.type)

                              return (
                              <div key={`${ingredient.ingredientId ?? ingredient.name}-${index}`} className="ad-selected-ingredient">
                                <div>
                                  <strong>{ingredient.name}</strong>
                                  <span>{ingredientTypeLabel(ingredient.type)}</span>
                                </div>
                                <input
                                  type="text"
                                  value={ingredient.quantity ?? ""}
                                  onChange={(event) => updateProductIngredient(index, { quantity: event.target.value })}
                                  placeholder="Qtd."
                                />
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={ingredient.includedByDefault}
                                    onChange={(event) => updateProductIngredient(index, { includedByDefault: event.target.checked })}
                                  />
                                  default
                                </label>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={canRemoveIngredient && ingredient.removable}
                                    disabled={!canRemoveIngredient}
                                    onChange={(event) => updateProductIngredient(index, { removable: event.target.checked })}
                                  />
                                  removable
                                </label>
                                <button type="button" className="ad-icon-btn" onClick={() => removeProductIngredient(index)} aria-label="Remover ingrediente">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      <div className="ad-form-group">
                          <label>Imagem do produto</label>
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                          onChange={e => {
                            handleProductImageFiles(e.target.files)
                            e.currentTarget.value = ""
                          }}
                        />
                        {imagePreviews[0] && (
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
                            <img
                              src={imagePreviews[0]} alt="Preview"
                              style={{ height: 90, borderRadius: 8, objectFit: "cover", border: "1px solid var(--ad-border, #cbd5e1)" }}
                            />
                            <button
                              type="button"
                              className="ad-btn ad-btn-sm ad-btn-danger"
                              onClick={() => {
                                setImageFiles([])
                                setImagePreviews((editingProduct?.media ?? []).map((media) => getImageUrl(productMediaUrl(media, "card") ?? media.originalUrl)))
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                        {!imagePreviews[0] && editingProduct?.media?.[0] && (
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
                            <img
                              src={getImageUrl(productMediaUrl(editingProduct.media[0], "card") ?? editingProduct.media[0].originalUrl)} alt="Atual"
                              onError={handleAdminImageError}
                              style={{ height: 90, borderRadius: 8, objectFit: "cover", border: "1px solid var(--ad-border, #cbd5e1)" }}
                            />
                            <div style={{ fontSize: 12, opacity: 0.6 }}>
                              <p>Imagem atual</p>
                              <p>{editingProduct.media[0].originalFilename ?? editingProduct.media[0].originalUrl}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="ad-form-actions">
                        <button type="submit" className="ad-btn ad-btn-primary">
                          {editingProduct ? "Guardar alterações" : "Criar produto"}
                        </button>
                        <button type="button" className="ad-btn ad-btn-ghost" onClick={closeForm}>Cancelar</button>
                      </div>
                    </form>
                  </div>
                </div>
              </>
            )}

            <ProductAnalyticsDrawer
              product={selectedAnalyticsProduct}
              analytics={productAnalytics}
              loading={productAnalyticsLoading}
              rangeDays={productAnalyticsDays}
              onClose={handleCloseProductAnalytics}
              onEdit={(product) => {
                handleCloseProductAnalytics()
                void handleEditProduct(product)
              }}
              onDelete={(product) => void handleDeleteProductFromAnalytics(product)}
              onRangeChange={(days) => void handleProductAnalyticsRangeChange(days)}
            />

            {/* Active products */}
            <div className="ad-card ad-product-table-card">
              <h3 style={{ marginBottom: "1rem", fontSize: "0.95rem", fontWeight: 600 }}>Produtos ativos</h3>
              {products.length > 0 ? (
                <div className="ad-product-card-list">
                  {products.map((p) => {
                    const unavailableReason = getBaseUnavailableReason(p)
                    const isUnavailable = !p.effectiveAvailable
                    const image = primaryProductMediaUrl(p.media, "card")
                    const promoText = p.discountPercentage > 0
                      ? `${p.discountPercentage}% desconto`
                      : p.featured
                        ? "Destaque"
                        : "Sem promo"

                    return (
                      <article
                        key={p.productId}
                        className={`ad-admin-product-card ${isUnavailable ? "unavailable" : ""}`}
                        onClick={handleProductCardClick}
                      >
                        <div className="ad-admin-product-card-hero" onClick={() => void handleOpenProductAnalytics(p)}>
                          {image && <img src={getImageUrl(image)} alt="" onError={handleAdminImageError} />}
                          <div className="ad-admin-product-card-top">
                            <span>{p.productDisplayId ?? formatProductId(p.productId)}</span>
                            <details
                              className="ad-row-action-menu ad-card-action-menu"
                              open={openProductActionMenuId === p.productId}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <summary aria-label={`Ações para ${p.name}`} onClick={(event) => handleToggleProductActionMenu(event, p.productId)}>
                                <MoreHorizontal size={18} aria-hidden="true" />
                              </summary>
                              <div className="ad-row-action-menu-popover">
                                <button type="button" onClick={() => void handleOpenProductAnalytics(p)}>Análises</button>
                                <button type="button" className="danger" onClick={() => handleDeleteProduct(p.productId)}>Eliminar</button>
                              </div>
                            </details>
                          </div>
                          <h3>{p.name}</h3>
                        </div>

                        <div className="ad-admin-product-card-body">
                          <div className="ad-admin-product-card-stats">
                            <div><strong>{formatEuro(p.price)}</strong><span>preço</span></div>
                            <div><strong>{p.totalCalories == null ? "-" : formatCalories(p.totalCalories)}</strong><span>kcal</span></div>
                            <div><strong>{p.sold || 0}</strong><span>vendidos</span></div>
                          </div>

                          <div className="ad-admin-product-card-lines">
                            <div><span>Disponibilidade</span><strong>{isUnavailable ? "Indisponível" : "Disponível"}</strong></div>
                            <div><span>Promo</span><strong>{promoText}</strong></div>
                            {(p.glutenFree || p.containsAlcohol || p.menuTags || unavailableReason) && (
                              <div className="ad-admin-product-card-tags">
                                {unavailableReason && <span className="ad-pill ad-pill-gray" title={unavailableReason}>Base indisponível</span>}
                                {p.glutenFree && <span className="ad-pill ad-pill-green">Sem glúten</span>}
                                {p.containsAlcohol && <span className="ad-pill ad-pill-amber">Álcool</span>}
                                {p.menuTags && <small>{p.menuTags}</small>}
                              </div>
                            )}
                          </div>

                          <button
                            className="ad-admin-product-card-edit"
                            disabled={availabilityBusyKey === `product-${p.productId}`}
                            onClick={() => void handleSetProductAvailability(p, !p.available)}
                            type="button"
                          >
                            {availabilityBusyKey === `product-${p.productId}`
                              ? "A guardar..."
                              : p.available ? "Marcar indisponível" : "Marcar disponível"}
                          </button>
                          <button className="ad-admin-product-card-edit" onClick={() => handleEditProduct(p)}>
                            Editar produto
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : <p className="ad-empty">Nenhum produto ativo</p>}
            </div>

            {/* Soft-deleted products */}
            {deletedProducts.length > 0 && (
              <div className="ad-card ad-product-table-card ad-product-deleted-table-card" style={{ marginTop: "1.5rem" }}>
                <button
                  onClick={() => setShowDeletedProducts(!showDeletedProducts)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: "0.5rem 0",
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    fontWeight: 600, fontSize: "0.95rem", color: "inherit",
                  }}
                >
                  <span style={{ transform: `rotate(${showDeletedProducts ? 90 : 0}deg)`, display: "inline-block", transition: "transform 0.2s" }}>▶</span>
                  Produtos eliminados suavemente ({deletedProducts.length})
                </button>

                {showDeletedProducts && (
                  <table className="ad-table" style={{ marginTop: "1rem", opacity: 0.7 }}>
                    <thead>
                      <tr>
                        <th>Imagem</th><th>ID</th><th>Nome</th><th>Preço</th><th>Calorias</th><th>Disponibilidade</th><th>Vendido</th><th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedProducts.map(p => {
                        const unavailableReason = getBaseUnavailableReason(p)
                        const isUnavailable = !p.effectiveAvailable
                        return (
                        <tr key={p.productId} className={isUnavailable ? "ad-product-unavailable" : ""}>
                          <td data-label="Imagem">
                            {primaryProductMediaUrl(p.media, "card") ? (
                              <img
                                src={getImageUrl(primaryProductMediaUrl(p.media, "card")!)} alt={p.name}
                                onError={handleAdminImageError}
                                style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }}
                              />
                            ) : (
                              <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--ad-surface-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                                🍽️
                              </div>
                            )}
                          </td>
                          <td data-label="ID"><code className="ad-code">{p.productDisplayId ?? formatProductId(p.productId)}</code></td>
                          <td data-label="Nome">
                            <div className="ad-product-name-cell">
                              <span>{p.name}</span>
                              {unavailableReason && (
                                <span className="ad-product-unavailable-reason" title={unavailableReason}>
                                  {unavailableReason}
                                </span>
                              )}
                            </div>
                          </td>
                          <td data-label="Preço">{formatEuro(p.price)}</td>
                          <td data-label="Calories">{p.totalCalories == null ? "-" : `${formatCalories(p.totalCalories)} kcal`}</td>
                          <td data-label="Disponibilidade"><span className="ad-pill ad-pill-gray">{p.effectiveAvailable ? "Disponível" : "Indisponível"}</span></td>
                          <td data-label="Vendidos">{p.sold || 0}</td>
                          <td data-label="Actions">
                            <div className="ad-actions ad-product-row-actions" onClick={(event) => event.stopPropagation()}>
                              <div className="ad-actions-inline">
                                <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => handleRestoreProduct(p.productId)}>Restaurar</button>
                              </div>
                              <details className="ad-row-action-menu">
                                <summary aria-label={`Ações para ${p.name}`}>
                                  <MoreHorizontal size={18} aria-hidden="true" />
                                </summary>
                                <div className="ad-row-action-menu-popover">
                                  <button type="button" onClick={() => handleRestoreProduct(p.productId)}>Restaurar</button>
                                </div>
                              </details>
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS ── */}
        {activeTab === "settings" && isOwner && (
          <SiteSettingsPanel
            value={siteTheme}
            chefSpecial={chefSpecial}
            loyaltyCoupon={loyaltyCoupon}
            companyDetails={companyDetails}
            socialMedia={socialMedia}
            eventsSettings={eventsSettings}
            loading={siteThemeLoading}
            products={products}
            saving={siteThemeSaving}
            saved={siteThemeSaved}
            onChange={setSiteTheme}
            onChefSpecialChange={setChefSpecial}
            onLoyaltyCouponChange={setLoyaltyCoupon}
            onCompanyDetailsChange={setCompanyDetails}
            onSocialMediaChange={setSocialMedia}
            onEventsSettingsChange={setEventsSettings}
            onSave={handleSaveSiteTheme}
          />
        )}

        {activeTab === "orders" && (
          <div className="ad-content">
            {experience === "kitchen" ? (
              <KitchenOrdersBoard orders={orders} onRefresh={handleLoadOrders} onUpdateStatus={handleOrderStatusChange} />
            ) : experience === "staff" ? (
              <StaffOrdersBoard orders={orders} onRefresh={handleLoadOrders} onMarkPaid={handlePayCounterOrder} onUpdateStatus={handleOrderStatusChange} />
            ) : (
              <SuperAdminOrdersView orders={orders} onRefresh={handleLoadOrders} onUpdateStatus={handleOrderStatusChange} />
            )}
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="ad-content">
            <div className="ad-section-bar">
              <div>
                <h2 className="ad-section-title">Respostas e reações a avaliações</h2>
                <p className="ad-section-sub">Responda publicamente a avaliações de itens comprados e adicione uma reação simples de administrador.</p>
              </div>
              <button className="ad-btn ad-btn-ghost" onClick={handleLoadReviews}>
                <RefreshCw size={16} />
                Atualizar
              </button>
            </div>

            <div className="ad-review-stats" aria-label="Resumo das avaliações">
              <div>
                <span>Total de avaliações</span>
                <strong>{reviews.length}</strong>
              </div>
              <div>
                <span>Public replies</span>
                <strong>{reviewsWithReply}</strong>
              </div>
              <div>
                <span>Needs reply</span>
                <strong>{reviewsAwaitingReply}</strong>
              </div>
              <div>
                <span>Average rating</span>
                <strong>{averageReviewRating ? averageReviewRating.toFixed(1) : "-"}</strong>
              </div>
            </div>

            <div className="ad-card ad-review-toolbar">
              <label className="ad-review-search">
                <span>Pesquisar avaliações</span>
                <Search size={17} />
                <input
                  value={reviewSearch}
                  onChange={(event) => setReviewSearch(event.target.value)}
                  placeholder="Cliente, produto, comentário..."
                />
              </label>
              <div className="ad-review-toolbar-meta">
                <span>{filteredReviews.length} apresentados</span>

              </div>
            </div>

            {reviewsLoading ? (
              <p className="ad-empty">A carregar avaliações...</p>
            ) : filteredReviews.length === 0 ? (
              <p className="ad-empty">Nenhuma avaliação encontrada.</p>
            ) : (
              <div className="ad-review-grid">
                {filteredReviews.map((review) => {
                  const replyValue = reviewReplyDrafts[review.reviewId] ?? review.reply?.text ?? ""
                  const replyChanged = replyValue.trim() !== (review.reply?.text ?? "").trim()

                  return (
                    <article key={review.reviewId} className={`ad-card ad-review-card ${review.reply ? "has-reply" : ""}`}>
                      <header className="ad-review-header">
                        <div>
                          <div className="ad-review-meta">
                            <strong>{review.customerName || "Cliente"}</strong>
                            <span>{review.productName || review.productDisplayId || formatProductId(review.productId)}</span>
                            <span>{new Date(review.createdAt).toLocaleDateString("pt-PT")}</span>
                          </div>
                          <div className="ad-review-rating" aria-label={`${review.rating} de 5 na avaliação`}>
                            {Array.from({ length: 5 }, (_, index) => (
                              <Star key={index} size={15} fill={index < review.rating ? "currentColor" : "none"} />
                            ))}
                            <span>{review.rating}/5</span>
                          </div>
                        </div>

                      </header>

                      <div className="ad-review-body">
                        {review.title && <h3 className="ad-review-title">{review.title}</h3>}
                        <p className="ad-review-comment">{review.comment || "Sem comentário escrito."}</p>
                      </div>

                      <section className="ad-review-reply">
                        <div className="ad-review-reply-head">
                          <div>
                            <MessageCircle size={16} />
                            <label htmlFor={`review-reply-${review.reviewId}`}>Public admin reply</label>
                          </div>
                          <span className={`ad-review-reply-state ${review.reply ? "is-live" : ""}`}>
                            {review.reply ? "Publicado" : "Sem resposta"}
                          </span>
                        </div>
                        <textarea
                          id={`review-reply-${review.reviewId}`}
                          value={replyValue}
                          onChange={(event) => setReviewReplyDrafts((current) => ({ ...current, [review.reviewId]: event.target.value }))}
                          placeholder="Escreva uma resposta pública da administração..."
                          rows={3}
                        />
                        <div className="ad-review-actions">
                          <button
                            type="button"
                            className="ad-btn ad-btn-primary"
                            onClick={() => handleSaveReviewReply(review)}
                            disabled={!replyValue.trim() || (!!review.reply && !replyChanged)}
                          >
                            <Send size={15} />
                            {review.reply ? "Update reply" : "Post reply"}
                          </button>
                          {review.reply && (
                            <button type="button" className="ad-btn ad-btn-danger" onClick={() => handleDeleteReviewReply(review)}>
                              <Trash2 size={15} />
                              Eliminar resposta
                            </button>
                          )}
                        </div>
                      </section>

                      <section className="ad-review-reaction-panel">
                        <div className="ad-review-reaction-head">
                          <span>Admin reaction</span>
                          <small>Visível na avaliação do cliente</small>
                        </div>
                        <div className="ad-review-reactions" aria-label={`Reações para a avaliação ${review.reviewId}`}>
                        {REVIEW_REACTION_OPTIONS.map(({ type: type, label, Icon }) => {
                          const active = review.reactions?.some((reaction) => reaction.adminId === currentAdmin?.adminId && reaction.type === type) ?? false

                          return (
                            <button
                              key={type}
                              type="button"
                              className={`ad-review-reaction ad-review-reaction-${type} ${active ? "active" : ""}`}
                              onClick={() => handleToggleReviewReaction(review, type)}
                              aria-pressed={active}
                              aria-label={`${label} review`}
                              title={label}
                            >
                              <Icon size={17} fill={type === "heart" ? "currentColor" : "none"} />
                            </button>
                          )
                        })}
                        </div>
                      </section>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CLIENTES ── */}
        {activeTab === "clientes" && (
          <div className="ad-content">
            <div className="ad-section-bar">
              <h2 className="ad-section-title">Clientes</h2>
              <button className="ad-btn ad-btn-primary" onClick={openNewClienteForm}>+ Adicionar cliente</button>
            </div>

            {showClienteForm && (
              <div className="ad-card">
                <h3 className="ad-card-title">{editingCliente ? "Editar cliente" : "Adicionar cliente"}</h3>
                <form onSubmit={handleClienteSubmit} className="ad-form">
                  <div className="ad-form-row">
                    <div className="ad-form-group"><label>Nome</label><input value={clienteForm.name} onChange={e => setClienteForm({ ...clienteForm, name: e.target.value })} required /></div>
                    <div className="ad-form-group"><label>Apelido</label><input value={clienteForm.lastName || ""} onChange={e => setClienteForm({ ...clienteForm, lastName: e.target.value })} /></div>
                    <div className="ad-form-group"><label>Email</label><input type="email" value={clienteForm.email} onChange={e => setClienteForm({ ...clienteForm, email: e.target.value })} required /></div>
                  </div>
                  <div className="ad-form-row">
                    <div className="ad-form-group"><label>Palavra-passe</label><input type="password" value={clienteForm.password || ""} onChange={e => setClienteForm({ ...clienteForm, password: e.target.value })} required={!editingCliente} /></div>
                    <div className="ad-form-group"><label>Telefone</label><input value={clienteForm.phone || ""} onChange={e => setClienteForm({ ...clienteForm, phone: e.target.value })} /></div>
                    <div className="ad-form-group"><label>Estado</label><CustomSelect className="ad-select" value={clienteForm.status ?? "active"} onChange={(nextValue) => setClienteForm({ ...clienteForm, status: String(nextValue) as UserStatus })} options={[{ value: "active", label: "Ativo" }, { value: "suspended", label: "Suspenso" }]} /></div>
                  </div>
                  <div className="ad-form-actions">
                    <button type="submit" className="ad-btn ad-btn-primary">Guardar cliente</button>
                    <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setShowClienteForm(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            <div className="ad-card ad-directory-toolbar">
              <label className="ad-review-search ad-directory-search">
                <span>Pesquisar clientes</span>
                <Search size={17} />
                <input
                  type="search"
                  value={clienteSearch}
                  onChange={(event) => setClienteSearch(event.target.value)}
                  placeholder="Nome, ID do cliente, email, telefone, NIF..."
                />
              </label>
              <div className="ad-directory-filters">
                <div className="ad-form-group">
                  <label>Estado</label>
                  <CustomSelect
                    className="ad-select"
                    value={clienteStatusFilter}
                    onChange={(nextValue) => setClienteStatusFilter(nextValue as DirectoryStatusFilter)}
                    options={DIRECTORY_STATUS_OPTIONS}
                  />
                </div>
              </div>
              <div className="ad-review-toolbar-meta">
                <span>{filteredClientes.length} apresentados</span>
                {hasClienteFilters && (
                  <button
                    type="button"
                    className="ad-btn ad-btn-sm ad-btn-ghost"
                    onClick={() => {
                      setClienteSearch("")
                      setClienteStatusFilter("all")
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="ad-card ad-client-list-panel">
              {filteredClientes.length === 0 ? (
                <p className="ad-empty">Nenhum cliente corresponde a estes filtros.</p>
              ) : (
                <div className="ad-client-card-grid">
                  {filteredClientes.map(cliente => {
                    const isInactive = cliente.status !== "active"
                    const displayName = [cliente.name, cliente.lastName].filter(Boolean).join(" ") || "Cliente sem nome"
                    const initials = displayName
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase())
                      .join("") || "CL"
                    const location = [cliente.city, cliente.postalCode].filter(Boolean).join(" · ")

                    return (
                      <article key={cliente.customerId} className={`ad-client-card ${isInactive ? "inactive" : ""}`}>
                        <div className="ad-client-card-head">
                          <div className="ad-client-avatar" aria-hidden="true">{initials}</div>
                          <div className="ad-client-identity">
                            <span>CLI-{String(cliente.customerId).padStart(3, "0")}</span>
                            <h3>{displayName}</h3>
                            <a href={`mailto:${cliente.email}`}>{cliente.email}</a>
                          </div>
                          <details className="ad-row-action-menu ad-client-action-menu">
                            <summary aria-label={`Ações para ${displayName}`}>
                              <MoreHorizontal size={18} aria-hidden="true" />
                            </summary>
                            <div className="ad-row-action-menu-popover">
                              {isInactive ? (
                                <button type="button" onClick={() => handleReactivateCliente(cliente)}>Reativar</button>
                              ) : (
                                <button type="button" className="danger" onClick={() => handleDeleteCliente(cliente.customerId)}>Desativar</button>
                              )}
                            </div>
                          </details>
                        </div>

                        <div className="ad-client-card-status">
                          <span className={`ad-pill ${cliente.status === "active" ? "ad-pill-green" : "ad-pill-gray"}`}>{cliente.status === "active" ? "ativo" : "inativo"}</span>
                        </div>

                        <div className="ad-client-card-details">
                          <div><span>Telefone</span><strong>{cliente.phone || "-"}</strong></div>
                          <div><span>NIF</span><strong>{cliente.taxId || "-"}</strong></div>
                          <div><span>Cidade</span><strong>{location || "-"}</strong></div>
                          <div><span>Morada</span><strong>{cliente.address || "-"}</strong></div>
                        </div>

                        <div className="ad-client-card-actions">
                          <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => openEditClienteForm(cliente)}>Editar cliente</button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "staff" && (
          <div className="ad-content">
            <div className="ad-section-bar">
              <h2 className="ad-section-title">Utilizadores admin</h2>
              <button className="ad-btn ad-btn-primary" onClick={openNewStaffForm}>+ Adicionar admin</button>
            </div>

            {showStaffForm && (
              <div className="ad-card">
                <h3 className="ad-card-title">{editingStaff ? "Editar admin" : "Adicionar admin"}</h3>
                <form onSubmit={handleStaffSubmit} className="ad-form">
                  <div className="ad-form-row">
                    <div className="ad-form-group"><label>Nome</label><input value={staffForm.name} onChange={e => setStaffForm({ ...staffForm, name: e.target.value })} required /></div>
                    <div className="ad-form-group"><label>Email</label><input type="email" value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} required /></div>
                    <div className="ad-form-group"><label>Palavra-passe</label><input type="password" value={staffForm.password || ""} onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} required={!editingStaff} /></div>
                  </div>
                  <div className="ad-form-row">
                    <div className="ad-form-group"><label>Cargo</label><CustomSelect className="ad-select" value={staffForm.role} onChange={(nextValue) => setStaffForm({ ...staffForm, role: nextValue as AdminRole })} options={[{ value: "owner", label: "Owner" }, { value: "manager", label: "Manager" }, { value: "waiter", label: "Waiter" }, { value: "chef", label: "Chef" }]} /></div>
                    <div className="ad-form-group"><label>Estado</label><CustomSelect className="ad-select" value={staffForm.status} onChange={(nextValue) => setStaffForm({ ...staffForm, status: String(nextValue) as UserStatus })} options={[{ value: "active", label: "Ativo" }, { value: "suspended", label: "Suspenso" }]} /></div>
                  </div>
                  <div className="ad-form-actions">
                    <button type="submit" className="ad-btn ad-btn-primary">Guardar admin</button>
                    <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setShowStaffForm(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            <div className="ad-card ad-directory-toolbar">
              <label className="ad-review-search ad-directory-search">
                <span>Pesquisar equipa</span>
                <Search size={17} />
                <input
                  type="search"
                  value={staffSearch}
                  onChange={(event) => setStaffSearch(event.target.value)}
                  placeholder="Nome, ID da equipa, email, cargo..."
                />
              </label>
              <div className="ad-directory-filters">
                <div className="ad-form-group">
                  <label>Cargo</label>
                  <CustomSelect
                    className="ad-select"
                    value={staffRoleFilter}
                    onChange={(nextValue) => setStaffRoleFilter(nextValue as StaffRoleFilter)}
                    options={STAFF_ROLE_OPTIONS}
                  />
                </div>
                <div className="ad-form-group">
                  <label>Estado</label>
                  <CustomSelect
                    className="ad-select"
                    value={staffStatusFilter}
                    onChange={(nextValue) => setStaffStatusFilter(nextValue as DirectoryStatusFilter)}
                    options={DIRECTORY_STATUS_OPTIONS}
                  />
                </div>
              </div>
              <div className="ad-review-toolbar-meta">
                <span>{filteredStaffAdmins.length} apresentados</span>
                {hasStaffFilters && (
                  <button
                    type="button"
                    className="ad-btn ad-btn-sm ad-btn-ghost"
                    onClick={() => {
                      setStaffSearch("")
                      setStaffRoleFilter("all")
                      setStaffStatusFilter("all")
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="ad-card">
              {filteredStaffAdmins.length === 0 ? (
                <p className="ad-empty">Nenhum utilizador da equipa corresponde a estes filtros.</p>
              ) : (
                <table className="ad-table">
                  <thead><tr><th>ID</th><th>Nome</th><th>Email</th><th>Cargo</th><th>Estado</th><th>Ações</th></tr></thead>
                  <tbody>
                    {filteredStaffAdmins.map(admin => {
                      const isInactive = admin.status !== "active"
                      return (
                        <tr key={admin.adminId}>
                          <td data-label="ID">{admin.adminId}</td>
                          <td data-label="Nome">{admin.name}</td>
                          <td data-label="Email">{admin.email}</td>
                          <td data-label="Cargo"><span className="ad-pill ad-pill-blue">{admin.role}</span></td>
                          <td data-label="Estado"><span className={`ad-pill ${admin.status === "active" ? "ad-pill-green" : "ad-pill-gray"}`}>{admin.status === "active" ? "ativo" : "inativo"}</span></td>
                          <td data-label="Ações">
                            <div className="ad-actions">
                              <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => openEditStaffForm(admin)}>Editar</button>
                              {isInactive ? (
                                <button className="ad-btn ad-btn-sm ad-btn-primary" onClick={() => handleReactivateStaff(admin)}>Reativar</button>
                              ) : (
                                <button className="ad-btn ad-btn-sm ad-btn-danger" onClick={() => handleDeleteStaff(admin.adminId)}>Desativar</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="ad-content">
            <div className="ad-section-bar">
              <div>
                <h2 className="ad-section-title">Análises</h2>
                <p className="ad-section-sub">Vendas, pedidos, clientes e movimento de produtos com filtros independentes.</p>
              </div>
              <button className="ad-btn ad-btn-ghost" onClick={handleLoadAllAnalytics}>Atualizar tudo</button>
            </div>

            <div className="ad-analytics-grid">
              {ANALYTICS_METRICS.map((config) => (
                <AnalyticsChartCard
                  key={config.metric}
                  config={config}
                  series={analyticsSeries[config.metric]}
                  range={analyticsRanges[config.metric]}
                  customStart={analyticsCustomRanges[config.metric].start}
                  customEnd={analyticsCustomRanges[config.metric].end}
                  loading={analyticsLoading[config.metric] ?? false}
                  onRangeChange={(nextRange) => {
                    setAnalyticsRanges((current) => ({ ...current, [config.metric]: nextRange }))
                    if (nextRange !== "custom") {
                      void handleLoadAnalyticsMetric(config.metric, nextRange)
                    }
                  }}
                  onCustomStartChange={(value) => setAnalyticsCustomRanges((current) => ({
                    ...current,
                    [config.metric]: { ...current[config.metric], start: value },
                  }))}
                  onCustomEndChange={(value) => setAnalyticsCustomRanges((current) => ({
                    ...current,
                    [config.metric]: { ...current[config.metric], end: value },
                  }))}
                  onRefresh={() => void handleLoadAnalyticsMetric(config.metric)}
                />
              ))}
            </div>

          </div>
        )}
        <footer className="ad-compact-footer">
          <span>BONEFREE Admin</span>
          <span>&copy; {new Date().getFullYear()} Painel de operações da equipa</span>
        </footer>
      </main>
      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title ?? ""}
        description={confirmDialog?.description ?? ""}
        confirmText={confirmDialog?.confirmText}
        cancelText={confirmDialog?.cancelText}
        danger={confirmDialog?.danger}
        loading={confirmLoading}
        onConfirm={handleConfirmSubmit}
        onCancel={handleConfirmCancel}
      />
    </div>
  )
}
