import EventsEditor from "../components/admin/EventsEditor"
import { eventImageFallback, eventsHaveIssues } from "../utils/eventEditor"
import PricingOptionsEditor from "../components/admin/PricingOptionsEditor"
import { formatProductPrices, pricingOptionsInvalid } from "../utils/pricing"
import { saveProductDraft } from "../services/productEditor"
import CatalogLanguageTabs from "../components/admin/CatalogLanguageTabs"
import { catalogText, editCatalogTranslation } from "../utils/catalogTranslations"
import type { CatalogLocale, CatalogText } from "../utils/catalogTranslations"
import { Menu, MoreHorizontal, Search, SlidersHorizontal, X } from "lucide-react"
import type { FormEvent, MouseEvent, SyntheticEvent } from "react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"
import AdminAccessDenied from "../components/AdminAccessDenied"
import AdminI18nBoundary from "../components/AdminI18nBoundary"
import LanguageSwitcher from "../components/LanguageSwitcher"
import AdaptivePanel from "../components/admin/AdaptivePanel"
import { Pagination } from "../components/ui"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import CustomSelect from "../components/ui/CustomSelect"
import { useToast } from "../components/ui/toastContext"
import i18n, { resolvedLocale } from "../i18n"
import {
  createCategory,
  createIngredient,
  createStaffAdmin,
  deleteCategory,
  deleteIngredient,
  deleteProduct,
  deleteProductMedia,
  deleteStaffAdmin,
  getCurrentAdmin,
  getProduct,
  listAllCategories,
  listAllIngredients,
  listAllProducts,
  listCategories,
  listIngredientProducts,
  listIngredients,
  listProducts,
  listStaffAdmins,
  restoreProduct,
  setIngredientAvailability,
  setProductAvailability,
  updateCategory,
  updateIngredient,
  updateStaffAdmin,
} from "../services/adminService"
import {
  getAdminChefSpecial,
  getAdminCompanyDetails,
  getAdminEventsSettings,
  getAdminSiteTheme,
  getAdminSocialMediaSettings,
  updateAdminChefSpecial,
  updateAdminCompanyDetails,
  updateAdminEventsSettings,
  updateAdminSiteTheme,
  updateAdminSocialMediaSettings
} from "../services/siteSettingsService"
import { defaultSiteThemeResponse, siteThemePresets, themePresetById } from "../siteThemes"
import type {
  AdminIngredient,
  AdminIngredientPayload,
  AdminProduct,
  AdminProductIngredient,
  AdminProductPayload,
  AdminRole,
  AdminUserPayload,
  Category,
  CategoryPayload,
  CurrentAdmin,
  IngredientType,
  ProductFilters,
  UserStatus
} from "../types/admin"
import type { Page } from "../types/pagination"
import type {
  ChefSpecialSettings,
  CompanyDetailsSettings,
  EventsSettings,
  SiteThemeResponse,
  SocialLinkSettings,
  SocialMediaSettings,
  ThemeColors
} from "../types/siteSettings"
import type { AdaptivePanelMode } from "../utils/adaptivePanelMode"
import { normalizeAdaptivePanelMode } from "../utils/adaptivePanelMode"
import type { AdminDashboardTab } from "../utils/adminAccess"
import { adminTabForRole, adminTabsForRole, canAccessAdmin, canEditCatalog, canViewCatalog } from "../utils/adminAccess"
import { ADMIN_ROLES, formatAdminRole } from "../utils/adminEnumLabels"
import { buildCatalogProductPayload } from "../utils/catalogProduct"
import { defaultEventsSettings } from "../utils/eventSettings"
import { defaultCompanyDetails, defaultSocialMediaSettings } from "../utils/footerSettings"
import { formatCategoryId, formatProductId } from "../utils/ids"
import { applyApiImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { translateUserMessage } from "../utils/messages"
import { persistOptimisticUpdate } from "../utils/optimisticUpdate"
import { primaryProductMediaUrl, productMediaUrl } from "../utils/productMedia"
import "./AdminDashboard.css"

function getImageUrl(imagePath: string): string {
  return resolveProductImageUrl(imagePath)
}

function handleAdminImageError(event: SyntheticEvent<HTMLImageElement>) {
  applyApiImageFallback(event.currentTarget)
}

const MealFinderAdmin = lazy(() => import('../components/admin/MealFinderAdmin'))
const ReservationAdmin = lazy(() => import('../components/admin/ReservationAdmin'))

type TabType = AdminDashboardTab
type AdminTheme = "light" | "dark"
type SiteSettingsTab = "promote" | "theme" | "company" | "social" | "events"

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
const ADMIN_EDITOR_VIEW_MODE_STORAGE_KEY = "admin_editor_view_mode"

function getErrorMessage(error: unknown, fallback: string): string {
  return translateUserMessage(error instanceof Error ? error.message : fallback)
}

const NAV_ITEMS: { tab: TabType; label: string; icon: string }[] = [
  { tab: "meal-finder", label: "Meal Finder", icon: "M4 6h16M4 12h16M4 18h7" },
  { tab: "reservations", label: "Reservas", icon: "M4 5h16v16H4zM8 2v6M16 2v6M4 11h16" },
  { tab: "products", label: "Produtos", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { tab: "ingredients", label: "Ingredientes", icon: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" },
  { tab: "categories", label: "Categorias", icon: "M4 6h16M4 12h16M4 18h7" },
  { tab: "staff", label: "Equipa", icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8M16 11l2 2 4-4" },
  { tab: "settings", label: "Definições", icon: "M12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.65 1.65 0 0015 19.4a1.65 1.65 0 00-1 .6 1.65 1.65 0 00-.33 1.06V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-.6-1 1.65 1.65 0 00-1.06-.33H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-.6 1.65 1.65 0 00.33-1.06V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.38.37.72.68 1a1.65 1.65 0 001.06.33H21a2 2 0 010 4h-.09A1.65 1.65 0 0019.4 15z" },
]

const SETTINGS_TABS: { id: SiteSettingsTab; label: string; description: string }[] = [
  { id: "promote", label: "Promover produtos", description: "Produto em destaque na página inicial" },
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
  { key: "priceHighlight", label: "Destaque do preço", helper: "Preços dos pratos" },
]

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

const NAV_GROUPS: { label: string; tabs: TabType[] }[] = [

  { label: "Menu", tabs: ["products", "ingredients", "categories", "reservations", "meal-finder"] },

  { label: "Admin", tabs: ["staff", "settings"] },
]

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
  return value.toLocaleString(resolvedLocale(), { maximumFractionDigits: 1 })
}

function hasIngredientQuantity(ingredient: AdminProductIngredient): boolean {
  return parseQuantityToGrams(ingredient.quantity) !== null
}

type DirectoryStatusFilter = "all" | "active" | "inactive"
type StaffRoleFilter = "all" | AdminRole
type PaginatedAdminTab = "products" | "ingredients" | "categories" | "staff"
type PageMeta = { page: number; perPage: number; total: number; totalPages: number }
const EMPTY_PAGE_META: PageMeta = { page: 1, perPage: 20, total: 0, totalPages: 0 }
const PAGINATED_ADMIN_TABS: PaginatedAdminTab[] = ["products", "ingredients", "categories", "staff"]
const ADMIN_COLLECTION_QUERY_KEYS = [
  "page", "per_page", "show_archived", "archived_page", "archived_per_page",
  "product_search", "product_category", "product_min_price", "product_max_price",
  "product_featured", "product_gluten_free", "product_contains_alcohol",
  "ingredient_search", "ingredient_type", "ingredient_status",
  "category_search", "category_id", "category_status", "review_search",
  "customer_search", "customer_status", "staff_search", "staff_role", "staff_status",
  "order_search", "order_status", "order_payment_method", "order_payment_status",
  "order_date_from", "order_date_to", "order_customization",
] as const

const DIRECTORY_STATUS_OPTIONS = [
  { value: "all", label: "Todos os estados" },
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
]

// ── Component ────────────────────────────────────────────────────────────────

function SiteSettingsPanel({
  value,
  chefSpecial,
  companyDetails,
  socialMedia,
  eventsSettings,
  loading,
  products,
  saving,
  saved,
  onChange,
  onChefSpecialChange,
  onCompanyDetailsChange,
  onSocialMediaChange,
  onEventsSettingsChange,
  onSaveEvents,
  onSave,
}: {
  value: SiteThemeResponse
  chefSpecial: ChefSpecialSettings
  companyDetails: CompanyDetailsSettings
  socialMedia: SocialMediaSettings
  eventsSettings: EventsSettings
  loading: boolean
  products: AdminProduct[]
  saving: boolean
  saved: boolean
  onChange: (value: SiteThemeResponse) => void
  onChefSpecialChange: (value: ChefSpecialSettings) => void
  onCompanyDetailsChange: (value: CompanyDetailsSettings) => void
  onSocialMediaChange: (value: SocialMediaSettings) => void
  onEventsSettingsChange: (value: EventsSettings) => void
  onSaveEvents: () => void
  onSave: () => void
}) {
  const { t: eventText } = useTranslation("adminEvents")
  const [activeSettingsTab, setActiveSettingsTab] = useState<SiteSettingsTab>("promote")
  const colors = value.config.colors
  const selectedPreset = themePresetById(value.themeId)
  const selectedChefSpecial = products.find((product) => product.productId === chefSpecial.productId)
  const selectedChefSpecialImage = primaryProductMediaUrl(selectedChefSpecial?.media, "card")
  const socialLinks = defaultSocialMediaSettings.links.map((defaultLink) => (
    socialMedia.links.find((link) => link.platform === defaultLink.platform) ?? defaultLink
  ))

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
    <AdminI18nBoundary>
      <div className="ad-content">
        <div className="ad-section-bar">
          <div>
            <h2 className="ad-section-title">Definições do website</h2>
            <p className="ad-section-sub">Gerir destaques do menu, tema, detalhes da empresa, eventos e links sociais.</p>
          </div>
          <div className="ad-settings-actions">
            {saved && <span className="ad-settings-saved">Guardado</span>}
            {activeSettingsTab === "theme" && (
              <button className="ad-btn ad-btn-ghost" disabled={saving || loading} onClick={() => onChange(defaultSiteThemeResponse)}>Repor tema</button>
            )}
            <button className="ad-btn ad-btn-primary" disabled={saving || loading} type={activeSettingsTab === "events" ? "submit" : "button"} form={activeSettingsTab === "events" ? "admin-events-form" : undefined} onClick={activeSettingsTab === "events" ? undefined : onSave}>
              {activeSettingsTab === "events" ? eventText(saving ? "saving" : "publish") : saving ? "A guardar..." : "Publicar definições"}
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
                    <small>{formatProductPrices(selectedChefSpecial)} | {selectedChefSpecial.effectiveAvailable ? "disponível" : "indisponível"}</small>
                  </div>
                </div>
              ) : (
                <p className="ad-settings-note">A escolha automática usa o primeiro item ativo disponível no menu.</p>
              )}
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

                  </div>
                  <button style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`, borderRadius: value.config.ui.buttonStyle === "pill" ? 999 : value.config.ui.buttonStyle === "sharp" ? 2 : value.config.ui.borderRadius }}>
                    Ver menu
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
          <EventsEditor value={eventsSettings} onChange={onEventsSettingsChange} onSave={onSaveEvents} saving={saving} loading={loading} />
        )}

      </div>
    </AdminI18nBoundary>
  )
}

export default function AdminDashboard() {
  const { t } = useTranslation("admin")
  const [searchParams, setSearchParams] = useSearchParams()
  const storedRole = (localStorage.getItem("admin_role") || "manager") as AdminRole

  const requestedInitialTab = searchParams.get("tab") as TabType | null
  const [activeTab, setActiveTab] = useState<TabType>(() => (
    adminTabForRole(storedRole, requestedInitialTab)
  ))
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

  const [products, setProducts] = useState<AdminProduct[]>([])
  const [deletedProducts, setDeletedProducts] = useState<AdminProduct[]>([])
  const [settingsProducts, setSettingsProducts] = useState<AdminProduct[]>([])
  const [pageMeta, setPageMeta] = useState<Record<PaginatedAdminTab, PageMeta>>(() => {
    const urlPage = Math.max(1, Number(searchParams.get("page")) || 1)
    const requestedPerPage = Number(searchParams.get("per_page"))
    const urlPerPage = [10, 20, 50, 100].includes(requestedPerPage) ? requestedPerPage : 20
    const initial = { ...EMPTY_PAGE_META, page: urlPage, perPage: urlPerPage }
    return {
      products: { ...initial }, ingredients: { ...initial }, categories: { ...initial },
      staff: { ...initial },
    }
  })
  const [archivedProductPage, setArchivedProductPage] = useState<PageMeta>(() => {
    const requestedPage = Math.max(1, Number(searchParams.get("archived_page")) || 1)
    const requestedPerPage = Number(searchParams.get("archived_per_page"))
    return {
      ...EMPTY_PAGE_META,
      page: requestedPage,
      perPage: [10, 20, 50, 100].includes(requestedPerPage) ? requestedPerPage : 20,
    }
  })

  const [siteTheme, setSiteTheme] = useState<SiteThemeResponse>(defaultSiteThemeResponse)
  const [chefSpecial, setChefSpecial] = useState<ChefSpecialSettings>({ productId: null })

  const [companyDetails, setCompanyDetails] = useState<CompanyDetailsSettings>(defaultCompanyDetails)
  const [socialMedia, setSocialMedia] = useState<SocialMediaSettings>(defaultSocialMediaSettings)
  const [eventsSettings, setEventsSettings] = useState<EventsSettings>(defaultEventsSettings)
  const [siteThemeLoading, setSiteThemeLoading] = useState(false)
  const [siteThemeSaving, setSiteThemeSaving] = useState(false)
  const [siteThemeSaved, setSiteThemeSaved] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [catalogCategories, setCatalogCategories] = useState<Category[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [categoryFormClosing, setCategoryFormClosing] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryForm, setCategoryForm] = useState<CategoryPayload>({
    categoryName: "",
    categoryDescription: "",
  })
  const [ingredients, setIngredients] = useState<AdminIngredient[]>([])
  const [catalogIngredients, setCatalogIngredients] = useState<AdminIngredient[]>([])
  const [relatedIngredientId, setRelatedIngredientId] = useState<number | null>(null)
  const [relatedIngredientLoadingId, setRelatedIngredientLoadingId] = useState<number | null>(null)
  const [ingredientProducts, setIngredientProducts] = useState<Record<number, Page<AdminProduct>>>({})
  const [showIngredientForm, setShowIngredientForm] = useState(false)
  const [ingredientFormClosing, setIngredientFormClosing] = useState(false)
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
  }>(() => {
    const requestedType = searchParams.get("ingredient_type") as IngredientType | null
    const requestedStatus = searchParams.get("ingredient_status")
    return {
      search: searchParams.get("ingredient_search") ?? "",
      type: requestedType && INGREDIENT_TYPES.includes(requestedType) ? requestedType : "",
      status: requestedStatus === "active" || requestedStatus === "inactive" ? requestedStatus : "all",
    }
  })

  const [staffAdmins, setStaffAdmins] = useState<CurrentAdmin[]>([])
  const [error, setError] = useState<string | null>(null)
  const [availabilityBusyKey, setAvailabilityBusyKey] = useState<string | null>(null)

  // Form state
  const catalogSaveBusy = useRef(false)
  const [catalogSaving, setCatalogSaving] = useState(false)
  const [productSaving, setProductSaving] = useState(false)
  const [productEditorLoading, setProductEditorLoading] = useState(false)
  const productSaveBusy = useRef(false)
  const productEditorRequest = useRef(0)
  const productPreviewUrls = useRef(new Set<string>())
  const [showProductForm, setShowProductForm] = useState(false)
  const [productFiltersOpen, setProductFiltersOpen] = useState(false)

  useEffect(() => {
    if (!showProductForm) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previousOverflow }
  }, [showProductForm])
  const [productFormStep, setProductFormStep] = useState(0)
  const [productFormMessage, setProductFormMessage] = useState("")
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null)
  const [productTextLocale, setProductTextLocale] = useState<CatalogLocale>("pt-PT")
  const [categoryTextLocale, setCategoryTextLocale] = useState<CatalogLocale>("pt-PT")
  const [ingredientTextLocale, setIngredientTextLocale] = useState<CatalogLocale>("pt-PT")
  const [formData, setFormData] = useState<AdminProductPayload>({
    name: "",
    productDescription: "",
    price: 0,
    available: true,
    categoryId: 0,
    customizable: false,
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
  const [productTagInputs, setProductTagInputs] = useState<Partial<Record<CatalogLocale, string>>>({})
  const productTagInput = productTagInputs[productTextLocale] ?? ""
  const setProductTagInput = (value: string) => setProductTagInputs(current => ({ ...current, [productTextLocale]: value }))
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [deletingProductMediaId, setDeletingProductMediaId] = useState<number | null>(null)
  const [isProductImageDragging, setIsProductImageDragging] = useState(false)

  const [adminEditorViewMode, setAdminEditorViewMode] = useState<AdaptivePanelMode>(() => (
    normalizeAdaptivePanelMode(localStorage.getItem(ADMIN_EDITOR_VIEW_MODE_STORAGE_KEY))
  ))

  const [showStaffForm, setShowStaffForm] = useState(false)
  const [staffFormClosing, setStaffFormClosing] = useState(false)
  const [editingStaff, setEditingStaff] = useState<CurrentAdmin | null>(null)
  const [staffForm, setStaffForm] = useState<AdminUserPayload>({
    name: "",
    email: "",
    password: "",
    role: "manager",
    status: "active",
  })

  // Filter state
  const [filters, setFilters] = useState<ProductFilterState>(() => ({
    name: searchParams.get("product_search") ?? "",
    category: Number(searchParams.get("product_category")) || "",
    minPrice: searchParams.get("product_min_price") ?? "",
    maxPrice: searchParams.get("product_max_price") ?? "",
    featured: searchParams.get("product_featured") === "true",
    glutenFree: searchParams.get("product_gluten_free") === "true",
    containsAlcohol: searchParams.get("product_contains_alcohol") === "true",
  }))
  const [showDeletedProducts, setShowDeletedProducts] = useState(() => searchParams.get("show_archived") === "true")
  const [openProductActionMenuId, setOpenProductActionMenuId] = useState<number | null>(null)
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState(() => searchParams.get("category_search") ?? "")
  const [categoryIdFilter, setCategoryIdFilter] = useState(() => searchParams.get("category_id") ?? "")
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<DirectoryStatusFilter>(() => {
    const value = searchParams.get("category_status")
    return value === "active" || value === "inactive" ? value : "all"
  })

  const [staffSearch, setStaffSearch] = useState(() => searchParams.get("staff_search") ?? "")
  const [staffRoleFilter, setStaffRoleFilter] = useState<StaffRoleFilter>(() => {
    const value = searchParams.get("staff_role") as StaffRoleFilter | null
    return value && ADMIN_ROLES.includes(value as AdminRole) ? value : "all"
  })
  const [staffStatusFilter, setStaffStatusFilter] = useState<DirectoryStatusFilter>(() => {
    const value = searchParams.get("staff_status")
    return value === "active" || value === "inactive" ? value : "all"
  })

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const editableStaffRoleOptions = ADMIN_ROLES.map((staffRole) => ({
    value: staffRole,
    label: formatAdminRole(staffRole),
  }))
  const staffRoleOptions: Array<{ value: StaffRoleFilter; label: string }> = [
    { value: "all", label: t("roles.all") },
    ...editableStaffRoleOptions,
  ]
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydratingAdminUrlRef = useRef(false)
  const skipAdminUrlWriteRef = useRef(false)
  const lastWrittenSearchRef = useRef(searchParams.toString())
  const productImageInputRef = useRef<HTMLInputElement | null>(null)
  const previousDirectoryFiltersRef = useRef({
    products: JSON.stringify(filters),
    ingredients: JSON.stringify(ingredientFilters), categories: `${categorySearch}|${categoryIdFilter}|${categoryStatusFilter}`,
    staff: `${staffSearch}|${staffRoleFilter}|${staffStatusFilter}`,
  })
  const updatePageMeta = useCallback((tab: PaginatedAdminTab, changes: Partial<PageMeta>) => {
    setPageMeta((current) => {
      const merged = { ...current[tab], ...changes }
      const normalized = {
        ...merged,
        page: merged.totalPages > 0 ? Math.min(Math.max(1, merged.page), merged.totalPages) : 1,
      }
      return { ...current, [tab]: normalized }
    })
  }, [])

  useEffect(() => {
    const next = {
      products: JSON.stringify(filters),
      ingredients: JSON.stringify(ingredientFilters), categories: `${categorySearch}|${categoryIdFilter}|${categoryStatusFilter}`,
      staff: `${staffSearch}|${staffRoleFilter}|${staffStatusFilter}`,
    }
    if (hydratingAdminUrlRef.current) {
      hydratingAdminUrlRef.current = false
      previousDirectoryFiltersRef.current = next
      return
    }
    ; (Object.keys(next) as Array<keyof typeof next>).forEach((tab) => {
      if (next[tab] !== previousDirectoryFiltersRef.current[tab]) updatePageMeta(tab, { page: 1 })
    })
    previousDirectoryFiltersRef.current = next
  }, [categoryIdFilter, categorySearch, categoryStatusFilter, filters, ingredientFilters, staffRoleFilter, staffSearch, staffStatusFilter, updatePageMeta])
  const categoryFilterRef = useRef<HTMLDivElement | null>(null)
  const productLoadRequestRef = useRef(0)
  const categoryLoadRequestRef = useRef(0)
  const ingredientLoadRequestRef = useRef(0)

  const staffLoadRequestRef = useRef(0)
  const ingredientProductRequestRef = useRef<Record<number, number>>({})

  const confirmActionRef = useRef<(() => Promise<boolean>) | null>(null)
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  const navigate = useNavigate()
  const toast = useToast()
  const role = (currentAdmin?.role || localStorage.getItem("admin_role") || "manager") as AdminRole
  const isOwner = role === "owner"
  const canViewAdminCatalog = canViewCatalog(role)
  const canEditAdminCatalog = canEditCatalog(role)
  const allowedTabs = adminTabsForRole(role)

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
  const shellTitle = isOwner ? "Admin Console" : "Staff Console"
  const adminInitials = (currentAdmin?.name || "Admin")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A"

  useEffect(() => {
    const currentSearch = searchParams.toString()
    if (currentSearch === lastWrittenSearchRef.current) return
    lastWrittenSearchRef.current = currentSearch
    hydratingAdminUrlRef.current = true
    skipAdminUrlWriteRef.current = true

    const requestedTab = searchParams.get("tab") as TabType | null
    const nextTab = adminTabForRole(role, requestedTab)
    const requestedPerPage = Number(searchParams.get("per_page"))
    const nextPerPage = [10, 20, 50, 100].includes(requestedPerPage) ? requestedPerPage : 20
    const nextPage = Math.max(1, Number(searchParams.get("page")) || 1)
    setActiveTab(nextTab)
    if (PAGINATED_ADMIN_TABS.includes(nextTab as PaginatedAdminTab)) {
      setPageMeta((current) => ({
        ...current,
        [nextTab]: { ...current[nextTab as PaginatedAdminTab], page: nextPage, perPage: nextPerPage },
      }))
    }

    if (nextTab === "products") {
      setFilters({
        name: searchParams.get("product_search") ?? "",
        category: Number(searchParams.get("product_category")) || "",
        minPrice: searchParams.get("product_min_price") ?? "",
        maxPrice: searchParams.get("product_max_price") ?? "",
        featured: searchParams.get("product_featured") === "true",
        glutenFree: searchParams.get("product_gluten_free") === "true",
        containsAlcohol: searchParams.get("product_contains_alcohol") === "true",
      })
      setShowDeletedProducts(searchParams.get("show_archived") === "true")
      const archivedPerPage = Number(searchParams.get("archived_per_page"))
      setArchivedProductPage((current) => ({
        ...current,
        page: Math.max(1, Number(searchParams.get("archived_page")) || 1),
        perPage: [10, 20, 50, 100].includes(archivedPerPage) ? archivedPerPage : 20,
      }))
    } else if (nextTab === "ingredients") {
      const type = searchParams.get("ingredient_type") as IngredientType | null
      const status = searchParams.get("ingredient_status")
      setIngredientFilters({
        search: searchParams.get("ingredient_search") ?? "",
        type: type && INGREDIENT_TYPES.includes(type) ? type : "",
        status: status === "active" || status === "inactive" ? status : "all",
      })
    } else if (nextTab === "categories") {
      const status = searchParams.get("category_status")
      setCategorySearch(searchParams.get("category_search") ?? "")
      setCategoryIdFilter(searchParams.get("category_id") ?? "")
      setCategoryStatusFilter(status === "active" || status === "inactive" ? status : "all")
    } else if (nextTab === "staff") {
      const requestedRole = searchParams.get("staff_role") as StaffRoleFilter | null
      const status = searchParams.get("staff_status")
      setStaffSearch(searchParams.get("staff_search") ?? "")
      setStaffRoleFilter(requestedRole && ADMIN_ROLES.includes(requestedRole as AdminRole) ? requestedRole : "all")
      setStaffStatusFilter(status === "active" || status === "inactive" ? status : "all")
    }
  }, [allowedTabs, role, searchParams])

  useEffect(() => {
    if (skipAdminUrlWriteRef.current) {
      skipAdminUrlWriteRef.current = false
      return
    }
    const isPaginatedTab = PAGINATED_ADMIN_TABS.includes(activeTab as PaginatedAdminTab)

    const next = new URLSearchParams(searchParams)
    ADMIN_COLLECTION_QUERY_KEYS.forEach((key) => next.delete(key))

    const setOptional = (key: string, value: string | number | boolean | null | undefined, preserveEmpty = false) => {
      if (value === null || value === undefined || (!preserveEmpty && value === "") || value === false) return
      next.set(key, String(value))
    }

    if (isPaginatedTab) {
      const meta = pageMeta[activeTab as PaginatedAdminTab]
      next.set("page", String(meta.page))
      next.set("per_page", String(meta.perPage))

      if (activeTab === "products") {
        setOptional("product_search", filters.name.trim())
        setOptional("product_category", filters.category)
        setOptional("product_min_price", filters.minPrice)
        setOptional("product_max_price", filters.maxPrice)
        setOptional("product_featured", filters.featured)
        setOptional("product_gluten_free", filters.glutenFree)
        setOptional("product_contains_alcohol", filters.containsAlcohol)
        setOptional("show_archived", showDeletedProducts)
        if (showDeletedProducts) {
          next.set("archived_page", String(archivedProductPage.page))
          next.set("archived_per_page", String(archivedProductPage.perPage))
        }
      } else if (activeTab === "ingredients") {
        setOptional("ingredient_search", ingredientFilters.search.trim())
        setOptional("ingredient_type", ingredientFilters.type)
        setOptional("ingredient_status", ingredientFilters.status === "all" ? "" : ingredientFilters.status)
      } else if (activeTab === "categories") {
        setOptional("category_search", categorySearch.trim())
        setOptional("category_id", categoryIdFilter)
        setOptional("category_status", categoryStatusFilter === "all" ? "" : categoryStatusFilter)
      } else if (activeTab === "staff") {
        setOptional("staff_search", staffSearch.trim())
        setOptional("staff_role", staffRoleFilter === "all" ? "" : staffRoleFilter)
        setOptional("staff_status", staffStatusFilter === "all" ? "" : staffStatusFilter)
      }
    }

    if (next.toString() !== searchParams.toString()) {
      lastWrittenSearchRef.current = next.toString()
      setSearchParams(next, { replace: true })
    }
  }, [
    activeTab, archivedProductPage.page, archivedProductPage.perPage, categoryIdFilter, categorySearch,
    categoryStatusFilter, filters, ingredientFilters,
    pageMeta, searchParams, setSearchParams,
    showDeletedProducts, staffRoleFilter, staffSearch, staffStatusFilter,
  ])

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

  const loadProductsForFilters = useCallback(async (nextFilters: ProductFilterState) => {
    const requestId = ++productLoadRequestRef.current
    try {
      const filterObj: ProductFilters = {}
      if (nextFilters.name.trim()) filterObj.name = nextFilters.name.trim()
      if (nextFilters.category) filterObj.category = nextFilters.category
      if (nextFilters.minPrice) filterObj.minPrice = parseFloat(nextFilters.minPrice)
      if (nextFilters.maxPrice) filterObj.maxPrice = parseFloat(nextFilters.maxPrice)
      if (nextFilters.featured) filterObj.featured = true
      if (nextFilters.glutenFree) filterObj.glutenFree = true
      if (nextFilters.containsAlcohol) filterObj.containsAlcohol = true

      const activePage = await listProducts({
        page: pageMeta.products.page,
        perPage: pageMeta.products.perPage,
        catalogState: "active",
        filters: Object.keys(filterObj).length > 0 ? filterObj : undefined,
      })
      if (requestId !== productLoadRequestRef.current) return
      setProducts(activePage.items)
      updatePageMeta("products", { page: activePage.page, perPage: activePage.perPage, total: activePage.total, totalPages: activePage.totalPages })
      if (showDeletedProducts) {
        const archivedPage = await listProducts({
          page: archivedProductPage.page,
          perPage: archivedProductPage.perPage,
          catalogState: "archived",
          filters: Object.keys(filterObj).length > 0 ? filterObj : undefined,
        })
        if (requestId !== productLoadRequestRef.current) return
        setDeletedProducts(archivedPage.items)
        setArchivedProductPage({
          page: archivedPage.totalPages > 0 ? Math.min(archivedPage.page, archivedPage.totalPages) : 1,
          perPage: archivedPage.perPage,
          total: archivedPage.total,
          totalPages: archivedPage.totalPages,
        })
      } else {
        setDeletedProducts([])
      }
    } catch (err) {
      if (requestId === productLoadRequestRef.current) setError(getErrorMessage(err, "Failed to load products"))
    }
  }, [archivedProductPage.page, archivedProductPage.perPage, pageMeta.products.page, pageMeta.products.perPage, showDeletedProducts, updatePageMeta])

  const handleLoadProducts = useCallback(async () => {
    await loadProductsForFilters(filters)
  }, [filters, loadProductsForFilters])

  const handleLoadCategories = useCallback(async () => {
    const requestId = ++categoryLoadRequestRef.current
    try {
      const result = await listCategories({
        page: pageMeta.categories.page,
        perPage: pageMeta.categories.perPage,
        search: categorySearch,
        categoryId: Number(categoryIdFilter) || undefined,
        status: categoryStatusFilter === "all" ? undefined : categoryStatusFilter,
      })
      if (requestId !== categoryLoadRequestRef.current) return
      setCategories(result.items)
      updatePageMeta("categories", { page: result.page, perPage: result.perPage, total: result.total, totalPages: result.totalPages })
    } catch (err) {
      if (requestId === categoryLoadRequestRef.current) setError(getErrorMessage(err, "Failed to load categories"))
    }
  }, [categoryIdFilter, categorySearch, categoryStatusFilter, pageMeta.categories.page, pageMeta.categories.perPage, updatePageMeta])

  const handleLoadIngredients = useCallback(async () => {
    const requestId = ++ingredientLoadRequestRef.current
    try {
      const result = await listIngredients({
        page: pageMeta.ingredients.page,
        perPage: pageMeta.ingredients.perPage,
        search: ingredientFilters.search,
        type: ingredientFilters.type || undefined,
        status: ingredientFilters.status === "all" ? "all" : ingredientFilters.status,
      })
      if (requestId !== ingredientLoadRequestRef.current) return
      setIngredients(result.items)
      updatePageMeta("ingredients", { page: result.page, perPage: result.perPage, total: result.total, totalPages: result.totalPages })
    } catch (err) {
      if (requestId === ingredientLoadRequestRef.current) setError(getErrorMessage(err, "Failed to load ingredients"))
    }
  }, [ingredientFilters.search, ingredientFilters.status, ingredientFilters.type, pageMeta.ingredients.page, pageMeta.ingredients.perPage, updatePageMeta])

  const handleLoadStaff = useCallback(async () => {
    const requestId = ++staffLoadRequestRef.current
    try {
      const result = await listStaffAdmins({
        page: pageMeta.staff.page,
        perPage: pageMeta.staff.perPage,
        search: staffSearch,
        role: staffRoleFilter === "all" ? undefined : staffRoleFilter,
        status: staffStatusFilter === "all" ? undefined : staffStatusFilter,
      })
      if (requestId !== staffLoadRequestRef.current) return
      setStaffAdmins(result.items)
      updatePageMeta("staff", { page: result.page, perPage: result.perPage, total: result.total, totalPages: result.totalPages })
    } catch (err) {
      if (requestId === staffLoadRequestRef.current) setError(getErrorMessage(err, "Failed to load staff admins"))
    }
  }, [pageMeta.staff.page, pageMeta.staff.perPage, staffRoleFilter, staffSearch, staffStatusFilter, updatePageMeta])

  const handleLoadSiteTheme = useCallback(async () => {
    if (!isOwner) return
    try {
      setSiteThemeLoading(true)
      const [theme, special, nextCompanyDetails, nextSocialMedia, nextEventsSettings] = await Promise.all([
        getAdminSiteTheme(),
        getAdminChefSpecial(),
        getAdminCompanyDetails(),
        getAdminSocialMediaSettings(),
        getAdminEventsSettings(),
      ])
      setSiteTheme(theme)
      setChefSpecial(special)
      setCompanyDetails(nextCompanyDetails)
      setSocialMedia(nextSocialMedia)
      setEventsSettings(nextEventsSettings)
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível carregar as definições do site."))
    } finally {
      setSiteThemeLoading(false)
    }
  }, [isOwner])

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

      })
      .catch(() => {
        localStorage.removeItem("admin_token")
        localStorage.removeItem("admin_role")
        localStorage.removeItem("admin_name")
        navigate("/admin/login", { replace: true })
      })
  }, [navigate])

  useEffect(() => {
    if (!currentAdmin) return

    const requestedTab = searchParams.get("tab") as TabType | null

    const nextTab = adminTabForRole(role, requestedTab)
    const nextParams = new URLSearchParams(searchParams)

    nextParams.set("tab", nextTab)
    {
      nextParams.delete("view")
    }

    setActiveTab((currentTab) => currentTab === nextTab ? currentTab : nextTab)
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [allowedTabs, currentAdmin, role, searchParams, setSearchParams])

  useEffect(() => {
    localStorage.setItem("admin_sidebar_collapsed", String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    if (relatedIngredientId === null) return

    const handleRelatedProductsKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRelatedIngredientId(null)
    }

    document.addEventListener("keydown", handleRelatedProductsKeyDown)
    return () => document.removeEventListener("keydown", handleRelatedProductsKeyDown)
  }, [relatedIngredientId])

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
    localStorage.setItem(ADMIN_EDITOR_VIEW_MODE_STORAGE_KEY, adminEditorViewMode)
  }, [adminEditorViewMode])

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
    if (!currentAdmin || !canViewAdminCatalog || activeTab !== "products") return
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      void handleLoadProducts()
    }, 400)
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current) }
  }, [activeTab, currentAdmin, canViewAdminCatalog, handleLoadProducts])

  useEffect(() => {
    if (!currentAdmin || !canViewAdminCatalog || activeTab !== "products") return
    if (catalogCategories.length === 0) {
      void listAllCategories({ status: "active" }).then(setCatalogCategories)
    }
  }, [activeTab, canViewAdminCatalog, catalogCategories.length, currentAdmin])

  useEffect(() => {
    if (!currentAdmin || !isOwner || activeTab !== "settings" || settingsProducts.length > 0) return
    void listAllProducts({ catalogState: "active" }).then(setSettingsProducts)
  }, [activeTab, currentAdmin, isOwner, settingsProducts.length])

  useEffect(() => {
    if (!currentAdmin || !canAccessAdmin(role) || !allowedTabs.includes(activeTab)) return
    const loader = activeTab === "ingredients" ? handleLoadIngredients
      : activeTab === "categories" ? handleLoadCategories
        : activeTab === "staff" ? handleLoadStaff
          : null
    if (!loader) return
    const timer = window.setTimeout(() => void loader(), 350)
    return () => window.clearTimeout(timer)
  }, [activeTab, allowedTabs, currentAdmin, handleLoadCategories, handleLoadIngredients, handleLoadStaff, role])

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
    if (openProductActionMenuId === null) return

    const handleProductMenuPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(`[data-product-action-menu="${openProductActionMenuId}"]`)) {
        setOpenProductActionMenuId(null)
      }
    }
    const handleProductMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenProductActionMenuId(null)
    }

    document.addEventListener("pointerdown", handleProductMenuPointerDown)
    document.addEventListener("keydown", handleProductMenuKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handleProductMenuPointerDown)
      document.removeEventListener("keydown", handleProductMenuKeyDown)
    }
  }, [openProductActionMenuId])

  useEffect(() => { if (currentAdmin && isOwner && activeTab === "settings") void handleLoadSiteTheme() }, [activeTab, currentAdmin, isOwner, handleLoadSiteTheme])

  useEffect(() => {
    const invalidateCatalog = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "catalog") setSettingsProducts([])
    }
    window.addEventListener("publicDataInvalidated", invalidateCatalog)
    return () => window.removeEventListener("publicDataInvalidated", invalidateCatalog)
  }, [])

  const handleTabChange = (tab: TabType) => {
    const nextTab = allowedTabs.includes(tab) ? tab : "products"
    const nextParams = new URLSearchParams(searchParams)
    setOpenProductActionMenuId(null)
    if (nextTab !== "ingredients") setRelatedIngredientId(null)
    nextParams.set("tab", nextTab)
    {
      nextParams.delete("view")
    }
    setSearchParams(nextParams)

    // Active-tab effects own fetching; click handlers only update navigation.

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
    for (const url of productPreviewUrls.current) {
      if (!imagePreviews.includes(url)) {
        URL.revokeObjectURL(url)
        productPreviewUrls.current.delete(url)
      }
    }
  }, [imagePreviews])

  useEffect(() => {
    const urls = productPreviewUrls.current
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear() }
  }, [])

  const openNewForm = async () => {
    if (productSaveBusy.current) return
    const request = ++productEditorRequest.current
    setProductEditorLoading(true)
    try {
      setEditingProduct(null)
      setProductTextLocale("pt-PT")
      const [nextCategories, nextIngredients] = await Promise.all([
        listAllCategories({ status: "active" }),
        listAllIngredients({ status: "all", customizationOnly: false }),
      ])
      if (request !== productEditorRequest.current) return
      setCatalogCategories(nextCategories)
      setCatalogIngredients(nextIngredients)
      const activeCategories = nextCategories.filter((category) => category.status !== "inactive")
      setFormData({
        translations: {},
        name: "",
        productDescription: "",
        price: 0,
        portions: [],
        extras: [],
        available: true,
        categoryId: activeCategories[0]?.categoryId ?? 0,
        customizable: false,
        menuTags: "",
        featured: false,
        discountPercentage: 0,
        glutenFree: false,
        containsAlcohol: false,
        totalCalories: null,
        ingredients: [],
      })
      setCalorieMode("manual")
      setNewProductIngredientName("")
      setNewProductIngredientType("normal")
      setNewProductIngredientCalories("")
      setProductIngredientSearch("")
      resetQuantitySelector()
      setProductTagInputs({})
      setProductFormStep(0)
      setProductFormMessage("")
      setImageFiles([])
      setImagePreviews([])
      setIsProductImageDragging(false)
      setShowProductForm(true)
    } catch (err) {
      toast.error(getErrorMessage(err, "Unable to open product editor."))
    } finally {
      if (request === productEditorRequest.current) setProductEditorLoading(false)
    }
  }

  const closeForm = () => {
    if (productSaveBusy.current) return
    productEditorRequest.current += 1
    setProductEditorLoading(false)
    setShowProductForm(false)
    setEditingProduct(null)
    setNewProductIngredientName("")
    setNewProductIngredientType("normal")
    setNewProductIngredientCalories("")
    setProductIngredientSearch("")
    resetQuantitySelector()
    setProductTagInputs({})
    setProductFormStep(0)
    setProductFormMessage("")
    setImageFiles([])
    setImagePreviews([])
    setIsProductImageDragging(false)
  }

  const handleEditProduct = async (selectedProduct: AdminProduct, startStep = 0) => {
    if (productSaveBusy.current) return
    const request = ++productEditorRequest.current
    setProductEditorLoading(true)
    try {
      setProductTextLocale("pt-PT")
      const [product, nextCategories, nextIngredients] = await Promise.all([
        getProduct(selectedProduct.productId),
        listAllCategories({ status: "active" }),
        listAllIngredients({ status: "all", customizationOnly: false }),
      ])
      if (request !== productEditorRequest.current) return
      setEditingProduct(product)
      setCatalogCategories(nextCategories)
      setCatalogIngredients(nextIngredients)
      const ingredientCaloriesById = new Map(
        nextIngredients.map((ingredient) => [ingredient.ingredientId, ingredient.caloriesPerGram ?? null]),
      )
      setFormData({
        translations: product.translations ?? {},
        name: product.name,
        productDescription: product.productDescription ?? "",
        price: product.price,
        portions: product.portions ?? [],
        extras: product.extras ?? [],
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
      setProductTagInputs({})
      setProductFormStep(startStep)
      setProductFormMessage("")
      setImageFiles([])
      setIsProductImageDragging(false)
      setImagePreviews([])
      setShowProductForm(true)
    } catch (err) {
      toast.error(getErrorMessage(err, "Unable to open product editor."))
    } finally {
      if (request === productEditorRequest.current) setProductEditorLoading(false)
    }
  }

  const productText = catalogText({ name: formData.name, description: formData.productDescription, menuTags: formData.menuTags }, formData.translations, productTextLocale)
  const categoryText = catalogText({ name: categoryForm.categoryName, description: categoryForm.categoryDescription }, categoryForm.translations, categoryTextLocale)
  const ingredientText = catalogText({ name: ingredientForm.name }, ingredientForm.translations, ingredientTextLocale)
  const updateProductText = (field: keyof CatalogText, value: string) => {
    setFormData(current => productTextLocale === "pt-PT"
      ? { ...current, [field === "description" ? "productDescription" : field]: value }
      : { ...current, translations: editCatalogTranslation(current.translations, productTextLocale, field, value) })
  }
  const updateCategoryText = (field: "name" | "description", value: string) => {
    setCategoryForm(current => categoryTextLocale === "pt-PT"
      ? { ...current, [field === "name" ? "categoryName" : "categoryDescription"]: value }
      : { ...current, translations: editCatalogTranslation(current.translations, categoryTextLocale, field, value) })
  }
  const updateIngredientText = (value: string) => {
    setIngredientForm(current => ingredientTextLocale === "pt-PT"
      ? { ...current, name: value }
      : { ...current, translations: editCatalogTranslation(current.translations, ingredientTextLocale, "name", value) })
  }

  const productTags = (productText.menuTags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)

  const addProductTag = () => {
    const nextTag = productTagInput.trim()
    if (!nextTag || productTags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return
    const nextTags = [...productTags, nextTag].join(", ")
    if (nextTags.length <= 255) updateProductText("menuTags", nextTags)
    setProductTagInput("")
  }

  const removeProductTag = (tagToRemove: string) => {
    updateProductText("menuTags", productTags.filter(tag => tag !== tagToRemove).join(", "))
  }

  const getProductStepValidationMessage = (step: number): string => {
    if (step === 0) {
      if (!formData.name.trim()) return "O nome do produto é obrigatório."
      if (!formData.categoryId) return "Escolha uma categoria."
    }

    if (step === 1) {
      if (pricingOptionsInvalid(formData.portions, formData.extras)) return t("storefront:pricing.invalid")
      if (!Number.isFinite(formData.price) || formData.price < 0 || (formData.price === 0 && !formData.portions?.length)) return "Introduza um preço superior a 0."
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
        if (formData.totalCalories != null && (!Number.isFinite(formData.totalCalories) || formData.totalCalories < 0)) {
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
      if (invalid.step === 0) setProductTextLocale("pt-PT")
      setProductFormStep(invalid.step)
      return
    }

    setProductFormMessage("")
    setProductFormStep(targetStep)
  }

  const goToNextProductStep = () => {
    const message = getProductStepValidationMessage(productFormStep)
    if (message) {
      if (productFormStep === 0) setProductTextLocale("pt-PT")
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
    if (productSaveBusy.current) return
    const invalid = firstInvalidProductStep()
    if (invalid) {
      setProductFormMessage(invalid.message)
      if (invalid.step === 0) setProductTextLocale("pt-PT")
      setProductFormStep(invalid.step)
      toast.warning("Please fix the highlighted fields.")
      return
    }

    productSaveBusy.current = true
    setProductSaving(true)
    try {
      setProductFormMessage("")
      const payload = buildCatalogProductPayload({
        ...formData,
        ingredients: formData.ingredients.map((ingredient) => ({
          ...ingredient,
          removable: ingredient.removable,
        })),
        totalCalories: calorieMode === "auto"
          ? Number(calculateProductCalories(formData.ingredients).toFixed(2))
          : formData.totalCalories ?? null,
      }, editingProduct)
      await saveProductDraft(editingProduct, payload, imageFiles,
        product => {
          setEditingProduct(product)
          setFormData(current => ({ ...current, portions: product.portions ?? [], extras: product.extras ?? [] }))
        },
        (_file, media) => {
          setEditingProduct(current => current ? { ...current, media: [...current.media, media] } : current)
          setImageFiles(current => current.slice(1))
          setImagePreviews(current => current.slice(1))
        })
      productSaveBusy.current = false
      closeForm()
      if (activeTab === "products") await handleLoadProducts()
      if (activeTab === "ingredients") await handleLoadIngredients()
      toast.success(editingProduct ? "Product updated successfully." : "Product added successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save product")
      setProductFormMessage(message)
      toast.error(message)
    } finally {
      productSaveBusy.current = false
      setProductSaving(false)
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
        if (activeTab === "products") await handleLoadProducts()
        toast.success("Product deleted successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to delete product")
        setError(message)
        toast.error(message)
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
      if (activeTab === "products") await handleLoadProducts()
      toast.success("Product restored successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to restore product")
      setError(message)
      toast.error(message)
    }
  }

  const handleOpenLinkedIngredientProduct = (product: AdminProduct) => {
    setRelatedIngredientId(null)
    handleTabChange("products")
    setFilters({ ...EMPTY_PRODUCT_FILTERS })
    setShowProductForm(false)
    if (product.status === "inactive") setShowDeletedProducts(true)
    void handleEditProduct(product)
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
            removable: false,
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
    const existing = catalogIngredients.find((ingredient) => ingredient.name.toLowerCase() === name.toLowerCase())
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
        setCatalogIngredients((current) => (
          current.some((ingredient) => ingredient.ingredientId === created.ingredientId)
            ? current
            : [...current, created].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
        ))
        selectSavedProductIngredient(created, caloriesPerGram)
        toast.success("Ingredient created and selected.")
      } catch (err) {
        const latestIngredients = await listAllIngredients({ status: "all", customizationOnly: false }).catch(() => [] as AdminIngredient[])
        const duplicate = latestIngredients.find((ingredient) => ingredient.name.toLowerCase() === name.toLowerCase())
        if (duplicate) {
          setCatalogIngredients(latestIngredients)
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
            removable: false,
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
    if (productSaveBusy.current) return
    const selected = Array.from(files ?? [])
    const supported = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"])
    const nextFiles = selected.filter(file => supported.has(file.type))
    if (nextFiles.length !== selected.length) toast.warning("Choose JPG, PNG, WebP, AVIF or GIF images.")
    if (nextFiles.length === 0) return
    setImageFiles((current) => [...current, ...nextFiles])
    setImagePreviews((current) => [...current, ...nextFiles.map((file) => { const url = URL.createObjectURL(file); productPreviewUrls.current.add(url); return url })])
  }

  const removePendingProductImage = (previewIndex: number, fileIndex: number) => {
    setImageFiles((current) => current.filter((_, index) => index !== fileIndex))
    setImagePreviews((current) => current.filter((_, index) => index !== previewIndex))
  }

  const handleDeleteExistingProductMedia = async (mediaId: number) => {
    if (!editingProduct || productSaveBusy.current) return
    productSaveBusy.current = true
    setDeletingProductMediaId(mediaId)
    try {
      await deleteProductMedia(editingProduct.productId, mediaId)
      setEditingProduct((current) => current
        ? { ...current, media: current.media.filter((media) => media.mediaId !== mediaId) }
        : current)
      const refreshed = await getProduct(editingProduct.productId)
      setEditingProduct(current => current?.productId === refreshed.productId ? refreshed : current)
      if (activeTab === "products") await handleLoadProducts()
      toast.success("Imagem removida com sucesso.")
    } catch (err) {
      const message = getErrorMessage(err, "Não foi possível remover a imagem.")
      toast.error(message)
    } finally {
      productSaveBusy.current = false
      setDeletingProductMediaId(null)
    }
  }

  const openNewCategoryForm = () => {
    if (catalogSaveBusy.current) return
    setCategoryFormClosing(false)
    setEditingCategory(null)
    setCategoryTextLocale("pt-PT")
    setCategoryForm({ categoryName: "", categoryDescription: "" })
    setShowCategoryForm(true)
  }

  const openEditCategoryForm = (category: Category) => {
    if (catalogSaveBusy.current) return
    setCategoryFormClosing(false)
    setEditingCategory(category)
    setCategoryTextLocale("pt-PT")
    setCategoryForm({
      translations: category.translations ?? {},
      categoryName: category.categoryName,
      categoryDescription: category.categoryDescription ?? "",
    })
    setShowCategoryForm(true)
  }

  const closeCategoryForm = () => {
    if (catalogSaveBusy.current) return
    setCategoryFormClosing(true)
  }

  const handleCategoryFormExited = () => {
    setShowCategoryForm(false)
    setCategoryFormClosing(false)
    setEditingCategory(null)
    setCategoryTextLocale("pt-PT")
    setCategoryForm({ categoryName: "", categoryDescription: "" })
  }

  const handleCategorySubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!categoryForm.categoryName.trim()) { setCategoryTextLocale("pt-PT"); toast.warning(t("catalogTranslation.sourceRequired")); return }
    if (catalogSaveBusy.current) return
    catalogSaveBusy.current = true
    setCatalogSaving(true)
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.categoryId, {
          translations: categoryForm.translations,
          categoryName: categoryForm.categoryName,
          categoryDescription: categoryForm.categoryDescription,
        })
      } else {
        await createCategory(categoryForm)
      }
      catalogSaveBusy.current = false
      closeCategoryForm()
      await handleLoadCategories()
      setCatalogCategories([])
      if (activeTab === "products") await handleLoadProducts()
      toast.success(editingCategory ? "Category updated successfully." : "Category created successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save category")
      setError(message)
      toast.error(message)
    } finally {
      catalogSaveBusy.current = false
      setCatalogSaving(false)
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
        setCatalogCategories([])
        if (activeTab === "products") await handleLoadProducts()
        toast.success("Category deactivated successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to deactivate category")
        setError(message)
        toast.error(message)
        return false
      }
    })
  }

  const handleRestoreCategory = async (categoryId: number) => {
    try {
      await updateCategory(categoryId, { status: "active" })
      await handleLoadCategories()
      setCatalogCategories([])
      if (activeTab === "products") await handleLoadProducts()
      toast.success("Category activated successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to restore category")
      setError(message)
      toast.error(message)
    }
  }

  const openNewIngredientForm = () => {
    if (catalogSaveBusy.current) return
    setIngredientFormClosing(false)
    setEditingIngredient(null)
    setIngredientTextLocale("pt-PT")
    setIngredientForm({ name: "", type: "normal", status: "active", available: true, caloriesPerGram: null })
    setShowIngredientForm(true)
  }

  const openEditIngredientForm = (ingredient: AdminIngredient) => {
    if (catalogSaveBusy.current) return
    setIngredientFormClosing(false)
    setEditingIngredient(ingredient)
    setIngredientTextLocale("pt-PT")
    setIngredientForm({
      translations: ingredient.translations ?? {},
      name: ingredient.name,
      type: ingredient.type,
      status: ingredient.status,
      available: ingredient.available,
      caloriesPerGram: ingredient.caloriesPerGram ?? null,
    })
    setShowIngredientForm(true)
  }

  const closeIngredientForm = () => {
    if (catalogSaveBusy.current) return
    setIngredientFormClosing(true)
  }

  const handleIngredientFormExited = () => {
    setShowIngredientForm(false)
    setIngredientFormClosing(false)
    setEditingIngredient(null)
    setIngredientTextLocale("pt-PT")
    setIngredientForm({ name: "", type: "normal", status: "active", available: true, caloriesPerGram: null })
  }

  const handleIngredientSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ingredientForm.name.trim()) { setIngredientTextLocale("pt-PT"); toast.warning(t("catalogTranslation.sourceRequired")); return }
    if (catalogSaveBusy.current) return
    catalogSaveBusy.current = true
    setCatalogSaving(true)
    try {
      if (editingIngredient) {
        await updateIngredient(editingIngredient.ingredientId, ingredientForm)
      } else {
        await createIngredient(ingredientForm)
      }
      catalogSaveBusy.current = false
      closeIngredientForm()
      if (activeTab === "ingredients") await handleLoadIngredients()
      setCatalogIngredients([])
      toast.success(editingIngredient ? "Ingredient updated successfully." : "Ingredient created successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save ingredient")
      setError(message)
      toast.error(message)
    } finally {
      catalogSaveBusy.current = false
      setCatalogSaving(false)
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
        if (activeTab === "ingredients") await handleLoadIngredients()
        setCatalogIngredients([])
        toast.success("Ingredient deactivated successfully.")
        return true
      } catch (err) {
        const message = getErrorMessage(err, "Failed to deactivate ingredient")
        setError(message)
        toast.error(message)
        return false
      }
    })
  }

  const handleRestoreIngredient = async (ingredientId: number) => {
    try {
      await updateIngredient(ingredientId, { status: "active" })
      if (activeTab === "ingredients") await handleLoadIngredients()
      setCatalogIngredients([])
      toast.success("Ingredient activated successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to restore ingredient")
      setError(message)
      toast.error(message)
    }
  }

  const handleSetIngredientAvailability = async (ingredient: AdminIngredient, available: boolean) => {
    const key = `ingredient-${ingredient.ingredientId}`
    const optimistic = { ...ingredient, available }
    const apply = (next: AdminIngredient) => {
      const replace = (items: AdminIngredient[]) => items.map((item) => (
        item.ingredientId === ingredient.ingredientId ? next : item
      ))
      setIngredients(replace)
      setCatalogIngredients(replace)
    }
    setAvailabilityBusyKey(key)
    try {
      await persistOptimisticUpdate(
        ingredient,
        optimistic,
        apply,
        () => setIngredientAvailability(ingredient.ingredientId, available),
      )
      if (activeTab === "products") await handleLoadProducts()
      toast.success(available ? "Ingrediente disponível." : "Ingrediente indisponível.")
    } catch (err) {
      const message = getErrorMessage(err, "Não foi possível alterar a disponibilidade do ingrediente")
      setError(message)
      toast.error(message)
    } finally {
      setAvailabilityBusyKey(null)
    }
  }

  const handleLoadIngredientProducts = async (ingredientId: number, page = 1, perPage = 20) => {
    const requestId = (ingredientProductRequestRef.current[ingredientId] ?? 0) + 1
    ingredientProductRequestRef.current[ingredientId] = requestId
    setRelatedIngredientId(ingredientId)
    setRelatedIngredientLoadingId(ingredientId)
    try {
      const result = await listIngredientProducts(ingredientId, { page, perPage })
      if (ingredientProductRequestRef.current[ingredientId] !== requestId) return
      setIngredientProducts((current) => ({ ...current, [ingredientId]: result }))
    } catch (err) {
      if (ingredientProductRequestRef.current[ingredientId] === requestId) {
        setError(getErrorMessage(err, "Não foi possível carregar os produtos relacionados."))
      }
    } finally {
      if (ingredientProductRequestRef.current[ingredientId] === requestId) {
        setRelatedIngredientLoadingId((current) => current === ingredientId ? null : current)
      }
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

  const openNewStaffForm = () => {
    if (catalogSaveBusy.current) return
    setStaffFormClosing(false)
    setEditingStaff(null)
    setStaffForm({ name: "", email: "", password: "", role: "manager", status: "active" })
    setShowStaffForm(true)
  }

  const openEditStaffForm = (admin: CurrentAdmin) => {
    if (catalogSaveBusy.current) return
    setStaffFormClosing(false)
    setEditingStaff(admin)
    setStaffForm({ name: admin.name, email: admin.email, password: "", role: admin.role, status: admin.status })
    setShowStaffForm(true)
  }

  const closeStaffForm = () => {
    if (catalogSaveBusy.current) return
    setStaffFormClosing(true)
  }

  const handleStaffFormExited = () => {
    setShowStaffForm(false)
    setStaffFormClosing(false)
    setEditingStaff(null)
    setStaffForm({ name: "", email: "", password: "", role: "manager", status: "active" })
  }

  const handleStaffSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (catalogSaveBusy.current) return
    catalogSaveBusy.current = true
    setCatalogSaving(true)
    try {
      const payload = { ...staffForm }
      if (editingStaff) {
        if (!payload.password) delete payload.password
        await updateStaffAdmin(editingStaff.adminId, payload)
      } else {
        if (!payload.password) throw new Error("A palavra-passe é obrigatória para um novo administrador")
        await createStaffAdmin(payload as AdminUserPayload & { password: string })
      }
      catalogSaveBusy.current = false
      closeStaffForm()
      await handleLoadStaff()
      toast.success(editingStaff ? "Staff admin updated successfully." : "Staff admin created successfully.")
    } catch (err) {
      const message = getErrorMessage(err, "Failed to save staff admin")
      setError(message)
      toast.error(message)
    } finally {
      catalogSaveBusy.current = false
      setCatalogSaving(false)
    }
  }

  const handleSaveEvents = async () => {
    if (siteThemeSaving) return
    if (eventsHaveIssues(eventsSettings)) {
      toast.error(i18n.t("invalid", { ns: "adminEvents" }))
      return
    }
    setSiteThemeSaving(true)
    try {
      const saved = await updateAdminEventsSettings({ events: eventsSettings.events.map(event => ({ ...event, imageUrl: event.imageUrl.trim() || eventImageFallback })) })
      setEventsSettings(saved)
      setSiteThemeSaved(true)
      window.setTimeout(() => setSiteThemeSaved(false), 2200)
      toast.success(i18n.t("saved", { ns: "adminEvents" }))
    } catch (err) {
      toast.error(getErrorMessage(err, i18n.t("failed", { ns: "adminEvents" })))
    } finally { setSiteThemeSaving(false) }
  }

  const handleSaveSiteTheme = async () => {
    try {
      setSiteThemeSaving(true)
      const [savedTheme, savedChefSpecial, savedCompanyDetails, savedSocialMedia] = await Promise.all([
        updateAdminSiteTheme(siteTheme),
        updateAdminChefSpecial(chefSpecial),
        updateAdminCompanyDetails(companyDetails),
        updateAdminSocialMediaSettings(socialMedia),
      ])
      setSiteTheme(savedTheme)
      setChefSpecial(savedChefSpecial)
      setCompanyDetails(savedCompanyDetails)
      setSocialMedia(savedSocialMedia)
      localStorage.setItem("bonefree_site_theme", JSON.stringify(savedTheme))
      window.dispatchEvent(new Event("siteThemeUpdated"))
      setSiteThemeSaved(true)
      window.setTimeout(() => setSiteThemeSaved(false), 2200)
      toast.success("Definições do site guardadas com sucesso.")
    } catch (err) {
      const message = getErrorMessage(err, "Não foi possível guardar as definições do site.")
      setError(message)
      toast.error(message)
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
        toast.error(message)
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
        toast.error(message)
        return false
      }
    })
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

  // These collections are already filtered and counted by the API. Never apply
  // a second filter to the visible page, otherwise matching rows on later pages
  // disappear and the pagination metadata becomes misleading.

  const filteredCategories = categories

  const filteredStaffAdmins = staffAdmins
  const hasCategoryFilters = Boolean(categorySearch.trim()) || Boolean(categoryIdFilter) || categoryStatusFilter !== "all"

  const hasStaffFilters = Boolean(staffSearch.trim()) || staffRoleFilter !== "all" || staffStatusFilter !== "all"
  const getBaseUnavailableReason = useCallback((product: AdminProduct) => {
    if (!product.available) return "Indisponível por decisão operacional."
    const names = product.unavailableBaseIngredients ?? []
    if (names.length === 0) return null
    if (names.length === 1) return `Indisponível: o ingrediente base ${names[0]} não está disponível.`

    const shownNames = names.slice(0, 2).join(", ")
    const remainingCount = names.length - 2
    return `Indisponível: ${remainingCount > 0 ? `${shownNames} e mais ${remainingCount}` : shownNames}.`
  }, [])
  const filteredIngredients = ingredients
  const relatedIngredient = relatedIngredientId === null
    ? null
    : ingredients.find((ingredient) => ingredient.ingredientId === relatedIngredientId) ?? null
  const relatedIngredientPage = relatedIngredientId === null ? null : ingredientProducts[relatedIngredientId] ?? null
  const clearIngredientFilters = () => {
    setIngredientFilters({ search: "", type: "", status: "all" })
  }
  const selectedIngredientIds = new Set(
    formData.ingredients
      .map((ingredient) => ingredient.ingredientId)
      .filter((id): id is number => typeof id === "number"),
  )
  const activeCategories = catalogCategories.filter((category) => category.status !== "inactive")
  const selectedProductFilterCategory =
    activeCategories.find((category) => category.categoryId === filters.category)?.categoryName ??
    "All categories"
  const activeProductIngredients = catalogIngredients.filter((ingredient) => ingredient.status !== "inactive")
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
  const productMediaPreviewItems = [
    ...(editingProduct?.media ?? []).map(media => ({
      src: getImageUrl(productMediaUrl(media, "card") ?? media.originalUrl),
      name: media.originalFilename ?? "Imagem do produto",
      status: media.isPrimary ? "Imagem principal" : "Multimédia existente",
      mediaId: media.mediaId, fileIndex: -1, isPendingUpload: false,
    })),
    ...imagePreviews.map((src, fileIndex) => ({
      src, name: imageFiles[fileIndex]?.name ?? "Nova imagem do produto",
      status: "Pronta para carregar", mediaId: null, fileIndex, isPendingUpload: true,
    })),
  ]
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
  const renderAdminPagination = (tab: PaginatedAdminTab, meta = pageMeta[tab], archived = false) => (
    <Pagination
      variant="admin"
      page={meta.page}
      perPage={meta.perPage}
      total={meta.total}
      totalPages={meta.totalPages}
      onPageChange={(nextPage) => {
        if (archived) setArchivedProductPage((current) => ({ ...current, page: nextPage }))
        else updatePageMeta(tab, { page: nextPage })
        const next = new URLSearchParams(searchParams)
        next.set(archived ? "archived_page" : "page", String(nextPage))
        setSearchParams(next)
      }}
      onPerPageChange={(nextPerPage) => {
        if (archived) setArchivedProductPage((current) => ({ ...current, page: 1, perPage: nextPerPage }))
        else updatePageMeta(tab, { page: 1, perPage: nextPerPage })
        const next = new URLSearchParams(searchParams)
        next.set(archived ? "archived_page" : "page", "1")
        next.set(archived ? "archived_per_page" : "per_page", String(nextPerPage))
        setSearchParams(next)
      }}
    />
  )
  const adminShellClassName = [
    "ad-shell",
    `ad-theme-${adminTheme}`,
    isSidebarCollapsed && !isMobileAdminNav ? "ad-shell-collapsed" : "",
    isMobileAdminNav ? "ad-shell-mobile-nav" : "",
    isAdminSidebarOpen ? "ad-sidebar-open" : "",
  ].filter(Boolean).join(" ")

  if (!currentAdmin) return null
  if (!canAccessAdmin(currentAdmin.role)) return <AdminAccessDenied />

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AdminI18nBoundary>
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
            <p className="ad-page-sub">{new Date().toLocaleDateString(resolvedLocale(), { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>

          <div className="ad-topbar-actions">
            <LanguageSwitcher className="admin-language-switcher" />
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
                      type="button"
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

          {/* ── PRODUCTS ── */}
          {activeTab === "categories" && (
            <div className="ad-content">
              <div className="ad-section-bar">
                <div>
                  <h2 className="ad-section-title">Categories</h2>
                  <p className="ad-section-sub">Gira as categorias do menu para os produtos e para a navegação dos clientes.</p>
                </div>
                <button className="ad-btn ad-btn-primary" disabled={catalogSaving} onClick={openNewCategoryForm}>+ Add category</button>
              </div>

              {showCategoryForm && (
                <AdaptivePanel
                  ariaLabel={editingCategory ? "Editar categoria" : "Adicionar categoria"}
                  closeLabel="Fechar editor de categoria"
                  closing={categoryFormClosing}
                  drawerLabel="Mostrar editor no painel lateral"
                  modalLabel="Mostrar editor num modal"
                  mode={adminEditorViewMode}
                  modeGroupLabel="Modo de visualização do editor"
                  onExited={handleCategoryFormExited}
                  onModeChange={setAdminEditorViewMode}
                  onRequestClose={closeCategoryForm}
                  panelClassName="ad-admin-editor-panel"
                >
                  <div className="ad-admin-editor-heading">
                    <span>Catálogo</span>
                    <h3>{editingCategory ? "Editar categoria" : "Adicionar categoria"}</h3>
                    <p>Defina o nome e a descrição apresentados na organização do menu.</p>
                  </div>
                  <form className="ad-form" onSubmit={handleCategorySubmit} aria-busy={catalogSaving}>
                    <fieldset disabled={catalogSaving} className="ad-editor-fields">
                    <CatalogLanguageTabs locale={categoryTextLocale} onChange={setCategoryTextLocale} />
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
                          lang={categoryTextLocale}
                          value={categoryText.name ?? ""}
                          maxLength={100}
                          onChange={(event) => updateCategoryText("name", event.target.value)}
                          placeholder="Hambúrgueres"
                          required={categoryTextLocale === "pt-PT"}
                        />
                      </div>
                    </div>
                    <div className="ad-form-group">
                      <label>Description</label>
                      <textarea
                        rows={3}
                        lang={categoryTextLocale}
                        value={categoryText.description ?? ""}
                        maxLength={255}
                        onChange={(event) => updateCategoryText("description", event.target.value)}
                        placeholder="Descrição interna curta..."
                      />
                    </div>
                    <div className="ad-form-actions">
                      <button type="submit" className="ad-btn ad-btn-primary">{catalogSaving ? "A guardar..." : editingCategory ? "Guardar categoria" : "Criar categoria"}</button>
                      <button type="button" className="ad-btn ad-btn-ghost" onClick={closeCategoryForm}>Cancelar</button>
                    </div>
                  </fieldset>
                  </form>
                </AdaptivePanel>
              )}

              <div className="ad-card ad-directory-toolbar">
                <label className="ad-directory-search">
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
                <div className="ad-directory-toolbar-meta">
                  <span>{pageMeta.categories.total} apresentadas</span>
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
                  const activeCount = category.activeProductCount ?? 0
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
              {renderAdminPagination("categories")}
            </div>
          )}

          {activeTab === "ingredients" && (
            <div className="ad-content">
              <div className="ad-section-bar">
                <div>
                  <p className="ad-section-kicker">
                    Admin Console · {new Date().toLocaleDateString(resolvedLocale(), { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </p>
                  <h2 className="ad-section-title">Ingredientes</h2>
                  <p className="ad-section-sub">
                    {canEditAdminCatalog
                      ? "Gerir os ingredientes e a informação nutricional dos pratos."
                      : "Consulte os ingredientes e altere apenas a disponibilidade operacional."}
                  </p>
                </div>
                {canEditAdminCatalog && <button className="ad-btn ad-btn-primary" disabled={catalogSaving} onClick={openNewIngredientForm}>Adicionar ingrediente</button>}
              </div>

              {canEditAdminCatalog && showIngredientForm && (
                <AdaptivePanel
                  ariaLabel={editingIngredient ? "Editar ingrediente" : "Adicionar ingrediente"}
                  closeLabel="Fechar editor de ingrediente"
                  closing={ingredientFormClosing}
                  drawerLabel="Mostrar editor no painel lateral"
                  modalLabel="Mostrar editor num modal"
                  mode={adminEditorViewMode}
                  modeGroupLabel="Modo de visualização do editor"
                  onExited={handleIngredientFormExited}
                  onModeChange={setAdminEditorViewMode}
                  onRequestClose={closeIngredientForm}
                  panelClassName="ad-admin-editor-panel"
                >
                  <div className="ad-admin-editor-heading">
                    <span>Catálogo</span>
                    <h3>{editingIngredient ? "Editar ingrediente" : "Adicionar ingrediente"}</h3>
                    <p>Atualize a composição, as calorias e a disponibilidade operacional.</p>
                  </div>
                  <form className="ad-form" onSubmit={handleIngredientSubmit} aria-busy={catalogSaving}>
                    <fieldset disabled={catalogSaving} className="ad-editor-fields">
                    <CatalogLanguageTabs locale={ingredientTextLocale} onChange={setIngredientTextLocale} />
                    <div className="ad-form-row">
                      <div className="ad-form-group">
                        <label>Nome</label>
                        <input
                          lang={ingredientTextLocale}
                          value={ingredientText.name ?? ""}
                          maxLength={120}
                          onChange={(event) => updateIngredientText(event.target.value)}
                          placeholder="Queijo cheddar"
                          required={ingredientTextLocale === "pt-PT"}
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
                        {catalogSaving ? "A guardar..." : editingIngredient ? "Guardar ingrediente" : "Criar ingrediente"}
                      </button>
                      <button type="button" className="ad-btn ad-btn-ghost" onClick={closeIngredientForm}>Cancelar</button>
                    </div>
                  </fieldset>
                  </form>
                </AdaptivePanel>
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
                  <span>{pageMeta.ingredients.total} apresentados</span>
                  <button type="button" className="ad-btn ad-btn-ghost" onClick={clearIngredientFilters}>Limpar filtros</button>
                </div>
              </div>

              <div className="ad-ingredient-grid">
                {filteredIngredients.map((ingredient) => {
                  const isActive = ingredient.status !== "inactive"
                  const relatedPage = ingredientProducts[ingredient.ingredientId]
                  const linkedProductCount = ingredient.linkedProductCount ?? relatedPage?.total ?? 0

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
                            aria-haspopup="dialog"
                            aria-expanded={relatedIngredientId === ingredient.ingredientId}
                            aria-label={`${linkedProductCount} produtos associados a ${ingredient.name}`}
                            onClick={() => {
                              if (relatedIngredientId === ingredient.ingredientId) setRelatedIngredientId(null)
                              else void handleLoadIngredientProducts(ingredient.ingredientId)
                            }}
                          >
                            <strong>{linkedProductCount}</strong>
                            <span>{linkedProductCount === 1 ? "produto" : "produtos"}</span>
                          </button>
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
                        {canEditAdminCatalog && <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => openEditIngredientForm(ingredient)}>Editar</button>}
                        {canEditAdminCatalog && (isActive ? (
                          <button className="ad-btn ad-btn-sm ad-btn-danger" onClick={() => handleDeactivateIngredient(ingredient.ingredientId)}>Desativar</button>
                        ) : (
                          <button className="ad-btn ad-btn-sm ad-btn-primary" onClick={() => handleRestoreIngredient(ingredient.ingredientId)}>Restaurar</button>
                        ))}
                      </div>
                    </article>
                  )
                })}
                {ingredients.length === 0 && <p className="ad-empty">Nenhum ingrediente encontrado.</p>}
                {ingredients.length > 0 && filteredIngredients.length === 0 && <p className="ad-empty">Nenhum ingrediente corresponde a estes filtros.</p>}
              </div>
              {relatedIngredient && (
                <>
                  <div className="ad-modal-backdrop" onClick={() => setRelatedIngredientId(null)} />
                  <section
                    className="ad-modal ad-related-products-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="related-products-title"
                  >
                    <header className="ad-modal-header ad-related-products-header">
                      <div>
                        <span className="ad-related-products-kicker">Produtos associados</span>
                        <h3 className="ad-modal-title" id="related-products-title">{relatedIngredient.name}</h3>
                        <p>
                          {relatedIngredientPage?.total ?? relatedIngredient.linkedProductCount ?? 0}
                          {` ${(relatedIngredientPage?.total ?? relatedIngredient.linkedProductCount ?? 0) === 1 ? "produto utiliza" : "produtos utilizam"} este ingrediente`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="ad-modal-close"
                        onClick={() => setRelatedIngredientId(null)}
                        aria-label="Fechar produtos associados"
                      >
                        <X size={20} />
                      </button>
                    </header>
                    <div className="ad-modal-body ad-related-products-body">
                      {relatedIngredientLoadingId === relatedIngredient.ingredientId && !relatedIngredientPage ? (
                        <p className="ad-related-products-state" role="status">A carregar produtos associados...</p>
                      ) : (relatedIngredientPage?.items.length ?? 0) > 0 ? (
                        <div className="ad-related-products-list">
                          {relatedIngredientPage!.items.map((product) => (
                            <button
                              key={product.productId}
                              type="button"
                              className={`ad-related-product-card ${product.status === "inactive" ? "disabled" : ""}`}
                              onClick={() => handleOpenLinkedIngredientProduct(product)}
                            >
                              <span className="ad-related-product-main">
                                <code>{product.productDisplayId ?? formatProductId(product.productId)}</code>
                                <strong>{product.name}</strong>
                                <small>{product.categoryDisplayId}</small>
                              </span>
                              <span className="ad-related-product-meta">
                                <strong>{formatProductPrices(product)}</strong>
                                <span className={`ad-pill ${product.status === "inactive" ? "ad-pill-gray" : "ad-pill-green"}`}>
                                  {product.status === "inactive" ? "inativo" : product.effectiveAvailable ? "disponível" : "indisponível"}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="ad-related-products-state">Nenhum produto utiliza este ingrediente.</p>
                      )}

                      {relatedIngredientLoadingId === relatedIngredient.ingredientId && relatedIngredientPage && (
                        <span className="ad-related-products-loading" role="status">A atualizar resultados...</span>
                      )}

                      {relatedIngredientPage && (
                        <Pagination
                          variant="admin"
                          className="ad-related-products-pagination"
                          page={relatedIngredientPage.page}
                          perPage={relatedIngredientPage.perPage}
                          total={relatedIngredientPage.total}
                          totalPages={relatedIngredientPage.totalPages}
                          onPageChange={(page) => void handleLoadIngredientProducts(relatedIngredient.ingredientId, page, relatedIngredientPage.perPage)}
                          onPerPageChange={(perPage) => void handleLoadIngredientProducts(relatedIngredient.ingredientId, 1, perPage)}
                        />
                      )}
                    </div>
                  </section>
                </>
              )}
              {renderAdminPagination("ingredients")}
            </div>
          )}

          {activeTab === "products" && (
            <div className="ad-content">
              <div className="ad-section-bar">
                <div>
                  <h2 className="ad-section-title">Todos os produtos</h2>
                  {!canEditAdminCatalog && <p className="ad-section-sub">Consulte os detalhes e a disponibilidade dos pratos.</p>}
                </div>
                {canEditAdminCatalog && <button className="ad-btn ad-btn-primary" onClick={openNewForm}>Adicionar produto</button>}
              </div>

              <div className="ad-product-toolbar ad-product-toolbar-compact">
                <div className="ad-product-search-row">
                  <label className="ad-product-search">
                    <Search size={18} aria-hidden="true" />
                    <input type="search" aria-label="Pesquisar produtos" placeholder="Pesquisar produtos…"
                      value={filters.name} onChange={e => setFilters({ ...filters, name: e.target.value })} />
                  </label>
                  <button type="button" className="ad-btn ad-btn-ghost ad-filter-toggle"
                    aria-expanded={productFiltersOpen} aria-controls="admin-product-filters"
                    onClick={() => {
                      setProductFiltersOpen(current => !current)
                      setCategoryFilterOpen(false)
                    }}>
                    <SlidersHorizontal size={17} aria-hidden="true" />
                    Filtros
                    {[filters.category, filters.minPrice, filters.maxPrice, filters.featured, filters.glutenFree, filters.containsAlcohol].filter(Boolean).length > 0 && (
                      <span className="ad-filter-count">{[filters.category, filters.minPrice, filters.maxPrice, filters.featured, filters.glutenFree, filters.containsAlcohol].filter(Boolean).length}</span>
                    )}
                  </button>
                </div>
                <div id="admin-product-filters" hidden={!productFiltersOpen}>
                  <div className="ad-product-filter-row">
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
                      <label>Preço mínimo (€)</label>
                      <input
                        type="number" placeholder="0.00" step="0.01" min="0"
                        value={filters.minPrice}
                        onChange={e => setFilters({ ...filters, minPrice: e.target.value })}
                      />
                    </div>
                    <div className="ad-form-group">
                      <label>Preço máximo (€)</label>
                      <input
                        type="number" placeholder="999.99" step="0.01" min="0"
                        value={filters.maxPrice}
                        onChange={e => setFilters({ ...filters, maxPrice: e.target.value })}
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
              </div>

              {/* Product Form Modal */}
              {productEditorLoading && <p role="status">A carregar editor de produto...</p>}
              {canEditAdminCatalog && showProductForm && (
                <>
                  <div className="ad-modal-backdrop" />
                  <div className="ad-modal ad-product-modal" role="dialog" aria-modal="true" aria-labelledby="admin-product-editor-title">
                    <div className="ad-product-modal-header">
                      <div>
                        <p className="ad-product-modal-kicker">Produto do menu</p>
                        <h3 id="admin-product-editor-title">{editingProduct ? "Editar produto" : "Criar produto"}</h3>
                        <span>Preencha os detalhes do produto, a informação nutricional e as imagens num fluxo simples.</span>
                      </div>
                      <button type="button" className="ad-modal-close ad-product-close" disabled={productSaving || deletingProductMediaId !== null} onClick={closeForm} aria-label="Fechar editor de produto">
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
                            disabled={productSaving || deletingProductMediaId !== null}
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
                        <fieldset disabled={productSaving || deletingProductMediaId !== null} className="ad-editor-fields">
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
                          <CatalogLanguageTabs locale={productTextLocale} onChange={setProductTextLocale} />
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
                                lang={productTextLocale}
                                value={productText.name ?? ""}
                                maxLength={150}
                                onChange={e => updateProductText("name", e.target.value)}
                                placeholder="Hambúrguer de cheddar fumado"
                                required={productTextLocale === "pt-PT"}
                              />
                            </label>
                            <label className="ad-field">
                              <span>Categoria</span>
                              <CustomSelect
                                value={formData.categoryId}
                                onChange={(nextValue) => setFormData({ ...formData, categoryId: Number(nextValue) || 0 })}
                                placeholder={catalogCategories.length === 0 ? "A carregar categorias..." : "Selecione uma categoria"}
                                options={[
                                  { value: "", label: catalogCategories.length === 0 ? "A carregar categorias..." : "Selecione uma categoria" },
                                  ...catalogCategories.filter((cat) => cat.status !== "inactive").map((cat) => ({
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
                                lang={productTextLocale}
                                value={productText.description ?? ""}
                                maxLength={255}
                                onChange={e => updateProductText("description", e.target.value)}
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
                          <PricingOptionsEditor portions={formData.portions} extras={formData.extras}
                            locale={productTextLocale} onLocaleChange={setProductTextLocale}
                            onPortionsChange={portions => setFormData(current => ({ ...current, portions }))}
                            onExtrasChange={extras => setFormData(current => ({ ...current, extras }))} />
                        </section>

                        <section className="ad-product-section" id="product-config">
                          <CatalogLanguageTabs locale={productTextLocale} onChange={setProductTextLocale} />
                          <div className="ad-product-section-head">
                            <div>
                              <h4>Configuração</h4>
                              <p>Controle destaques e etiquetas do menu.</p>
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
                              <span>Total de calorias (opcional)</span>
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
                                  placeholder="Desconhecido"
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
                                          removePendingProductImage(item.fileIndex, item.fileIndex)
                                          return
                                        }
                                        if (item.mediaId != null) {
                                          void handleDeleteExistingProductMedia(item.mediaId)
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
                                      setImagePreviews([])
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
                                    {productSaving ? "A guardar..." : "Guardar alterações"}
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
                                {productSaving ? "A guardar produto e imagens..." : editingProduct ? "Guardar alterações" : "Criar produto"}
                              </button>
                            )}
                          </div>
                        </div>
                      </fieldset>
                      </form>

                    </div>
                  </div>
                </>
              )}

              {/* Active products */}
              <div className="ad-card ad-product-table-card">
                <h3 style={{ marginBottom: "1rem", fontSize: "0.95rem", fontWeight: 600 }}>Produtos ativos</h3>
                {products.length > 0 ? (
                  <div className="ad-product-card-list">
                    {products.map((p) => {
                      const unavailableReason = getBaseUnavailableReason(p)
                      const isUnavailable = !p.effectiveAvailable
                      const image = primaryProductMediaUrl(p.media, "card")

                      return (
                        <article
                          key={p.productId}
                          className={`ad-admin-product-card ${isUnavailable ? "unavailable" : ""}`}
                          onClick={handleProductCardClick}
                        >
                          <div className="ad-admin-product-card-hero" onClick={() => void handleEditProduct(p)}>
                            {image && <img src={getImageUrl(image)} alt="" onError={handleAdminImageError} />}
                            <div className="ad-admin-product-card-top">
                              <span>{p.productDisplayId ?? formatProductId(p.productId)}</span>
                              {canEditAdminCatalog && <div
                                className="ad-card-action-menu"
                                data-product-action-menu={p.productId}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  aria-expanded={openProductActionMenuId === p.productId}
                                  aria-haspopup="menu"
                                  aria-label={`Ações para ${p.name}`}
                                  className="ad-card-action-trigger"
                                  onClick={(event) => handleToggleProductActionMenu(event, p.productId)}
                                  type="button"
                                >
                                  <MoreHorizontal size={18} aria-hidden="true" />
                                </button>
                                <div
                                  aria-hidden={openProductActionMenuId !== p.productId}
                                  className={`ad-row-action-menu-popover ad-card-action-popover ${openProductActionMenuId === p.productId ? "is-open" : ""}`}
                                  inert={openProductActionMenuId !== p.productId ? true : undefined}
                                  role="menu"
                                >
                                  <button type="button" onClick={() => void handleEditProduct(p)}>Editar produto</button>
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() => {
                                      setOpenProductActionMenuId(null)
                                      void handleDeleteProduct(p.productId)
                                    }}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </div>}
                            </div>
                            <h3>{p.name}</h3>
                          </div>

                          <div className="ad-admin-product-card-body">
                            <div className="ad-admin-product-card-stats">
                              <div><strong>{formatProductPrices(p)}</strong><span>preço</span></div>
                              <div><strong>{p.totalCalories == null ? "-" : formatCalories(p.totalCalories)}</strong><span>kcal</span></div>

                            </div>

                            <div className="ad-admin-product-card-lines">
                              <div><span>Disponibilidade</span><strong>{isUnavailable ? "Indisponível" : "Disponível"}</strong></div>

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
                            {!canEditAdminCatalog && (
                              <button className="ad-admin-product-card-edit" onClick={() => void handleEditProduct(p)}>
                                Ver detalhes
                              </button>
                            )}
                            {canEditAdminCatalog && <button className="ad-admin-product-card-edit" onClick={() => handleEditProduct(p)}>
                              Editar produto
                            </button>}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : <p className="ad-empty">Nenhum produto ativo</p>}
                {renderAdminPagination("products")}
              </div>

              {/* Soft-deleted products */}
              {(
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
                    Produtos arquivados ({archivedProductPage.total})
                  </button>

                  {showDeletedProducts && (
                    <table className="ad-table" style={{ marginTop: "1rem", opacity: 0.7 }}>
                      <thead>
                        <tr>
                          <th>Imagem</th><th>ID</th><th>Nome</th><th>Preço</th><th>Calorias</th><th>Disponibilidade</th><th>Ações</th>
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
                              <td data-label="Preço">{formatProductPrices(p)}</td>
                              <td data-label="Calories">{p.totalCalories == null ? "-" : `${formatCalories(p.totalCalories)} kcal`}</td>
                              <td data-label="Disponibilidade"><span className="ad-pill ad-pill-gray">{p.effectiveAvailable ? "Disponível" : "Indisponível"}</span></td>

                              <td data-label="Actions">
                                <div className="ad-actions ad-product-row-actions" onClick={(event) => event.stopPropagation()}>
                                  <div className="ad-actions-inline">
                                    <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => void handleEditProduct(p)}>Ver detalhes</button>
                                    <button
                                      className="ad-btn ad-btn-sm ad-btn-ghost"
                                      disabled={availabilityBusyKey === `product-${p.productId}`}
                                      onClick={() => void handleSetProductAvailability(p, !p.available)}
                                    >
                                      {availabilityBusyKey === `product-${p.productId}`
                                        ? "A guardar..."
                                        : p.available ? "Marcar indisponível" : "Marcar disponível"}
                                    </button>
                                    {canEditAdminCatalog && <button className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => handleRestoreProduct(p.productId)}>Restaurar</button>}
                                  </div>
                                  {canEditAdminCatalog && <details className="ad-row-action-menu">
                                    <summary aria-label={`Ações para ${p.name}`}>
                                      <MoreHorizontal size={18} aria-hidden="true" />
                                    </summary>
                                    <div className="ad-row-action-menu-popover">
                                      <button type="button" onClick={() => handleRestoreProduct(p.productId)}>Restaurar</button>
                                    </div>
                                  </details>}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  {showDeletedProducts && renderAdminPagination("products", archivedProductPage, true)}
                </div>
              )}
            </div>
          )}
          {activeTab === "meal-finder" && <Suspense fallback={<p>…</p>}><MealFinderAdmin /></Suspense>}
          {activeTab === "reservations" && <Suspense fallback={<p>{t("common.loading", { defaultValue: "…" })}</p>}><ReservationAdmin owner={isOwner} /></Suspense>}
          {activeTab === "settings" && isOwner && (
            <SiteSettingsPanel
              value={siteTheme}
              chefSpecial={chefSpecial}

              companyDetails={companyDetails}
              socialMedia={socialMedia}
              eventsSettings={eventsSettings}
              loading={siteThemeLoading}
              products={settingsProducts}
              saving={siteThemeSaving}
              saved={siteThemeSaved}
              onChange={setSiteTheme}
              onChefSpecialChange={setChefSpecial}

              onCompanyDetailsChange={setCompanyDetails}
              onSocialMediaChange={setSocialMedia}
              onEventsSettingsChange={setEventsSettings}
              onSaveEvents={handleSaveEvents}
              onSave={handleSaveSiteTheme}
            />
          )}

          {activeTab === "staff" && (
            <div className="ad-content">
              <div className="ad-section-bar">
                <h2 className="ad-section-title">Utilizadores admin</h2>
                <button className="ad-btn ad-btn-primary" disabled={catalogSaving} onClick={openNewStaffForm}>+ Adicionar admin</button>
              </div>

              {showStaffForm && (
                <AdaptivePanel
                  ariaLabel={editingStaff ? "Editar funcionário" : "Adicionar funcionário"}
                  closeLabel="Fechar editor de funcionário"
                  closing={staffFormClosing}
                  drawerLabel="Mostrar editor no painel lateral"
                  modalLabel="Mostrar editor num modal"
                  mode={adminEditorViewMode}
                  modeGroupLabel="Modo de visualização do editor"
                  onExited={handleStaffFormExited}
                  onModeChange={setAdminEditorViewMode}
                  onRequestClose={closeStaffForm}
                  panelClassName="ad-admin-editor-panel"
                >
                  <div className="ad-admin-editor-heading">
                    <span>Equipa</span>
                    <h3>{editingStaff ? "Editar funcionário" : "Adicionar funcionário"}</h3>
                    <p>Atualize os dados de acesso, o cargo e o estado deste membro da equipa.</p>
                  </div>
                  <form onSubmit={handleStaffSubmit} className="ad-form" aria-busy={catalogSaving}>
                    <fieldset disabled={catalogSaving} className="ad-editor-fields">
                    <div className="ad-form-row">
                      <div className="ad-form-group"><label>Nome</label><input value={staffForm.name} onChange={e => setStaffForm({ ...staffForm, name: e.target.value })} required /></div>
                      <div className="ad-form-group"><label>Email</label><input type="email" value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} required /></div>
                      <div className="ad-form-group"><label>Palavra-passe</label><input type="password" value={staffForm.password || ""} onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} required={!editingStaff} /></div>
                    </div>
                    <div className="ad-form-row">
                      <div className="ad-form-group"><label>Cargo</label><CustomSelect className="ad-select" value={staffForm.role} onChange={(nextValue) => setStaffForm({ ...staffForm, role: nextValue as AdminRole })} options={editableStaffRoleOptions} /></div>
                      <div className="ad-form-group"><label>Estado</label><CustomSelect className="ad-select" value={staffForm.status} onChange={(nextValue) => setStaffForm({ ...staffForm, status: String(nextValue) as UserStatus })} options={[{ value: "active", label: "Ativo" }, { value: "suspended", label: "Suspenso" }]} /></div>
                    </div>
                    <div className="ad-form-actions">
                      <button type="submit" className="ad-btn ad-btn-primary">{catalogSaving ? "A guardar..." : editingStaff ? "Guardar funcionário" : "Criar funcionário"}</button>
                      <button type="button" className="ad-btn ad-btn-ghost" onClick={closeStaffForm}>Cancelar</button>
                    </div>
                  </fieldset>
                  </form>
                </AdaptivePanel>
              )}

              <div className="ad-card ad-directory-toolbar">
                <label className="ad-directory-search">
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
                      options={staffRoleOptions}
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
                <div className="ad-directory-toolbar-meta">
                  <span>{pageMeta.staff.total} apresentados</span>
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
                            <td data-label="Cargo"><span className="ad-pill ad-pill-blue">{formatAdminRole(admin.role)}</span></td>
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
              {renderAdminPagination("staff")}
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
    </AdminI18nBoundary>
  )
}
