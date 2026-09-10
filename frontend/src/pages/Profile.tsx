import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useProfileNavigation, type ProfileTab } from "../hooks/useProfileNavigation"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  ChevronRight,
  Mail,
  Pencil,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Star,
  UserRound,
  WalletCards,
} from "lucide-react"

import FloatingProfileIcons from "../components/FloatingProfileIcons"
import { Pagination } from "../components/ui"
import { useToast } from "../components/ui/toastContext"
import { useAuth } from "../hooks"
import { checkoutService } from "../services"
import { translateUserMessage } from "../utils/messages"
import { authService } from "../services/authService"
import type { ProfileOverview } from "../services/authService"
import { getPublicLoyaltyCouponSettings } from "../services/siteSettingsService"
import type { Coupon } from "../types/checkout"
import type { LoyaltyCouponSettings } from "../types/siteSettings"
import type { ProfileUpdateRequest } from "../types/user"
import {
  defaultLoyaltyCouponSettings,
  loyaltyCouponDetail,
} from "../utils/loyaltyCoupon"
import {
  normalizePhone,
  validateEmail,
  validateName,
  validateNif,
  validatePhone,
  validatePostalCode,
} from "../utils/validation"
import type { FieldErrors } from "../utils/validation"
import { formatEuro } from "../utils/money"
import i18n, { resolvedLocale } from "../i18n"
import "./Profile.css"

interface ProfileForm {
  name: string
  lastName: string
  email: string
  phone: string
  taxId: string
  address: string
  postalCode: string
  city: string
}

const tabs: Array<{ id: ProfileTab; labelKey: string; icon: typeof ReceiptText }> = [
  { id: "personal", labelKey: "profile.tabs.personal", icon: UserRound },
  { id: "coupons", labelKey: "profile.tabs.coupons", icon: WalletCards },
  { id: "favorites", labelKey: "profile.overview.favouriteMeals", icon: Star },
  { id: "overview", labelKey: "profile.tabs.overview", icon: Sparkles },
]

function profileTabFromParam(value: string | null): ProfileTab | null {
  if (value === "overview" || value === "coupons" || value === "personal" || value === "favorites") return value
  return null
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatCurrency(value: number | string) {
  return formatEuro(value)
}

function initials(firstName?: string | null, lastName?: string | null, email?: string) {
  const first = firstName?.trim().charAt(0) ?? ""
  const last = lastName?.trim().charAt(0) ?? ""
  const fallback = email?.trim().charAt(0) ?? "P"
  return `${first}${last}`.trim().toUpperCase() || fallback.toUpperCase()
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function hasInvoiceAddressData(form: ProfileForm) {
  return Boolean(
    form.address.trim() ||
    form.postalCode.trim() ||
    form.city.trim(),
  )
}

function customerTier(orderCount: number, totalSpent: number) {
  if (orderCount >= 20 || totalSpent >= 600) return i18n.t("profile.tier.diamond", { ns: "account" })
  if (orderCount >= 10 || totalSpent >= 300) return i18n.t("profile.tier.gold", { ns: "account" })
  if (orderCount >= 4 || totalSpent >= 120) return i18n.t("profile.tier.regular", { ns: "account" })
  return i18n.t("profile.tier.new", { ns: "account" })
}

function numericSetting(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function loyaltyProfileHeadline(settings: LoyaltyCouponSettings) {
  const orderCount = Math.max(1, Math.round(numericSetting(settings.qualifyingOrderCount, 3)))
  return i18n.t("profile.coupons.headline", { ns: "account", count: orderCount, minimum: formatCurrency(settings.qualifyingOrderMinimum) })
}

function ProfileContent() {
  const { t } = useTranslation(["account", "common"])
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth()
  const toast = useToast()
  const tabFromUrl = profileTabFromParam(searchParams.get("tab") ?? searchParams.get("section")) ?? "personal"
  const [form, setForm] = useState<ProfileForm>({
    name: "",
    lastName: "",
    email: "",
    phone: "",
    taxId: "",
    address: "",
    postalCode: "",
    city: "",
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof ProfileForm>>({})
  const [overview, setOverview] = useState<ProfileOverview | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([])
  const [couponsPage, setCouponsPage] = useState(() => Math.max(1, Number(searchParams.get("coupon_page")) || 1))
  const [couponsPerPage, setCouponsPerPage] = useState(() => [10, 20, 50, 100].includes(Number(searchParams.get("coupon_per_page"))) ? Number(searchParams.get("coupon_per_page")) : 20)
  const [couponsTotal, setCouponsTotal] = useState(0)
  const [couponsTotalPages, setCouponsTotalPages] = useState(0)
  const lastWrittenSearchRef = useRef(searchParams.toString())
  const skipUrlWriteRef = useRef(false)
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltyCouponSettings>(defaultLoyaltyCouponSettings)
  const [loyaltySettingsLoaded, setLoyaltySettingsLoaded] = useState(false)
  const visibleTabs = tabs.filter(tab => tab.id !== "coupons" || loyaltySettings.enabled)
  const [loadingCoupons, setLoadingCoupons] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { activeTab, isMobile, navRef, selectTab } = useProfileNavigation(
    tabFromUrl,
    loyaltySettings.enabled,
    isAuthenticated && !authLoading && loyaltySettingsLoaded && !loadingOverview && (!loyaltySettings.enabled || !loadingCoupons),
  )

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login")
    }
  }, [authLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (!user) return
    setForm({
      name: user.name ?? "",
      lastName: user.lastName ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      taxId: user.taxId ?? "",
      address: user.billingAddress?.address ?? "",
      postalCode: user.billingAddress?.postalCode ?? "",
      city: user.billingAddress?.city ?? "",
    })
  }, [user])

  useEffect(() => {
    if (!isAuthenticated) return

    const loadProfileData = async () => {
      try {
        setError(null)
        const profileOverview = await authService.getProfileOverview()
        setOverview(profileOverview)
      } catch (err) {
        setError(translateUserMessage(err instanceof Error ? err.message : t("profile.errors.profileData")))
      } finally {
        setLoadingOverview(false)
      }
    }

    void loadProfileData()
  }, [isAuthenticated, t])

  useEffect(() => {
    if (!isAuthenticated) return
    let current = true
    void getPublicLoyaltyCouponSettings()
      .catch(() => defaultLoyaltyCouponSettings)
      .then(settings => {
        if (!current) return
        setLoyaltySettings(settings)
        setLoyaltySettingsLoaded(true)
      })
    return () => { current = false }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !loyaltySettings.enabled) return
    let current = true
    setLoadingCoupons(true)
    void checkoutService.getCoupons({ page: couponsPage, perPage: couponsPerPage }).then((result) => {
      if (!current) return
      setAvailableCoupons(result.items)
      setCouponsTotal(result.total)
      setCouponsTotalPages(result.totalPages)
      if (result.totalPages === 0 && couponsPage !== 1) setCouponsPage(1)
      else if (result.totalPages > 0 && couponsPage > result.totalPages) setCouponsPage(result.totalPages)
    }).catch((err) => {
      if (current) setError(translateUserMessage(err instanceof Error ? err.message : t("profile.errors.profileData")))
    }).finally(() => {
      if (current) setLoadingCoupons(false)
    })
    return () => { current = false }
  }, [couponsPage, couponsPerPage, isAuthenticated, loyaltySettings.enabled, t])

  const totalSpent = overview?.totalSpent ?? 0
  const totalItems = overview?.totalItems ?? 0
  const favoriteMeals = overview?.favoriteProducts ?? []

  const favoriteItem = favoriteMeals[0]?.name ?? t("profile.discovering")
  const displayName = `${form.name} ${form.lastName}`.trim() || user?.email || t("profile.defaultCustomer")
  const tier = customerTier(overview?.orderCount ?? 0, totalSpent)
  const couponStreak = overview?.loyaltyProgress ?? { current: 0, required: 1, remaining: 1, percent: 0, minimumSubtotal: 0 }
  const showCouponProgress = loyaltySettings.enabled && couponStreak.current > 0 && couponStreak.current < couponStreak.required

  const updateForm = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: field === "phone" ? normalizePhone(value) : value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setError(null)
  }

  useEffect(() => {
    const currentSearch = searchParams.toString()
    if (currentSearch === lastWrittenSearchRef.current) return
    lastWrittenSearchRef.current = currentSearch
    skipUrlWriteRef.current = true
    const nextCouponsPerPage = Number(searchParams.get("coupon_per_page"))
    setCouponsPage(Math.max(1, Number(searchParams.get("coupon_page")) || 1))
    setCouponsPerPage([10, 20, 50, 100].includes(nextCouponsPerPage) ? nextCouponsPerPage : 20)
  }, [searchParams])

  useEffect(() => {
    if (skipUrlWriteRef.current) {
      skipUrlWriteRef.current = false
      return
    }
    const next = new URLSearchParams(searchParams)
    if (couponsPage === 1) next.delete("coupon_page"); else next.set("coupon_page", String(couponsPage))
    if (couponsPerPage === 20) next.delete("coupon_per_page"); else next.set("coupon_per_page", String(couponsPerPage))
    if (next.toString() !== searchParams.toString()) {
      lastWrittenSearchRef.current = next.toString()
      setSearchParams(next, { replace: true })
    }
  }, [couponsPage, couponsPerPage, searchParams, setSearchParams])

  const selectProfileTab = (tab: ProfileTab) => {
    selectTab(tab)
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams)
      nextParams.delete("section")
      if (tab === "personal") {
        nextParams.delete("tab")
      } else {
        nextParams.set("tab", tab)
      }
      return nextParams
    }, { replace: true })
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const errors: FieldErrors<keyof ProfileForm> = {}
      const nomeError = validateName(form.name)
      const apelidoError = validateName(form.lastName)
      const emailError = validateEmail(form.email)
      const phoneError = validatePhone(form.phone, false)
      const nifError = validateNif(form.taxId)
      const postalCodeError = validatePostalCode(form.postalCode, false)
      if (nomeError) errors.name = nomeError
      if (apelidoError) errors.lastName = apelidoError
      if (emailError) errors.email = emailError
      if (phoneError) errors.phone = phoneError
      if (nifError) errors.taxId = nifError
      if (postalCodeError) errors.postalCode = postalCodeError
      setFieldErrors(errors)
      if (Object.keys(errors).length > 0) {
        setError(t("errors:messages.fixFields"))
        toast.warning(t("errors:messages.fixFields"))
        return
      }

      setSaving(true)
      setError(null)
      const payload: ProfileUpdateRequest = {
        name: nullableText(form.name),
        lastName: nullableText(form.lastName),
        email: form.email.trim(),
        phone: nullableText(form.phone),
        taxId: nullableText(form.taxId),
        billingAddress: hasInvoiceAddressData(form)
          ? {
              address: nullableText(form.address),
              postalCode: nullableText(form.postalCode),
              city: nullableText(form.city),
            }
          : null,
      }

      await authService.updateProfile(payload)
      await refreshUser()
      toast.success(t("profile.messages.saved"))
    } catch (err) {
      const message = translateUserMessage(err instanceof Error ? err.message : t("profile.errors.save"))
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const jumpToOrders = () => navigate("/orders")

  const jumpToPersonal = () => {
    selectProfileTab("personal")
    if (isMobile) return
    window.requestAnimationFrame(() => {
      document.querySelector(".profile-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  if (authLoading || !isAuthenticated) {
    return (
      <section className="profile-page site-page">
        <FloatingProfileIcons />
        <main className="profile-shell">
          <div className="profile-loading">{t("profile.loading")}</div>
        </main>
      </section>
    )
  }

  const profileNavigation = (
    <nav ref={navRef} className="profile-tabs" aria-label={t("profile.tabs.label")}>
      {visibleTabs.map((tab) => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            data-profile-tab={tab.id}
            aria-current={activeTab === tab.id ? "location" : undefined}
            aria-controls={`profile-${tab.id}`}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => selectProfileTab(tab.id)}
          >
            <Icon size={17} />
            {t(tab.labelKey)}
          </button>
        )
      })}
    </nav>
  )

  return (
    <section className="profile-page site-page">
      <FloatingProfileIcons />
      <main className="profile-shell">
        {isMobile && <h1 className="visually-hidden">{displayName}</h1>}
        {isMobile && profileNavigation}
        {!isMobile && <section className="profile-hero-panel">
          <div className="profile-identity">
            <div className="profile-avatar" aria-hidden="true">
              {initials(form.name, form.lastName, user?.email)}
            </div>
            <div className="profile-identity-copy">
              <div className="profile-kicker-row">
                <span className="profile-tier-badge"><Sparkles size={14} /> {tier}</span>
                <span className="profile-muted-chip">{t("profile.hero.customerProfile")}</span>
              </div>
              <h1>{displayName}</h1>
              <p><Mail size={15} /> {form.email}</p>
            </div>
          </div>

          <div className="profile-hero-actions">
            <button type="button" className="profile-primary-cta" onClick={jumpToOrders}>
              <RefreshCw size={18} />
              {t("profile.hero.reorder")}
            </button>
            <button type="button" className="profile-secondary-cta" onClick={jumpToPersonal}>
              <Pencil size={17} />
              {t("profile.hero.edit")}
            </button>
          </div>
        </section>}

        {error && (
          <div className="profile-alert error">
            <span>{error}</span>

          </div>
        )}

        {!isMobile && profileNavigation}

        {(isMobile || activeTab === "personal") && (
          <form className="profile-settings-layout profile-personal-layout" id="profile-personal" data-profile-section="personal" onSubmit={handleSave}>
            <ProfileFormSection
              eyebrow={t("profile.personal.label")}
              icon={UserRound}
              title={t("profile.personal.title")}
              description={t("profile.personal.description")}
            >
              <FormField label={t("fields.firstName", { ns: "common" })}>
                <input className={fieldErrors.name ? "is-invalid" : ""} value={form.name} onChange={(e) => updateForm("name", e.target.value)} autoComplete="given-name" />
                {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
              </FormField>
              <FormField label={t("fields.lastName", { ns: "common" })}>
                <input className={fieldErrors.lastName ? "is-invalid" : ""} value={form.lastName} onChange={(e) => updateForm("lastName", e.target.value)} autoComplete="family-name" />
                {fieldErrors.lastName && <small className="field-error">{fieldErrors.lastName}</small>}
              </FormField>
              <FormField label={t("fields.email", { ns: "common" })}>
                <input className={fieldErrors.email ? "is-invalid" : ""} type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} autoComplete="email" />
                {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
              </FormField>
              <FormField label={t("fields.phone", { ns: "common" })}>
                <input className={fieldErrors.phone ? "is-invalid" : ""} value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} autoComplete="tel" inputMode="tel" />
                {fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}
              </FormField>
            </ProfileFormSection>

            <ProfileFormSection
              eyebrow={t("profile.personal.billingLabel")}
              icon={WalletCards}
              title={t("profile.personal.billingTitle")}
              description={t("profile.personal.billingDescription")}
            >
              <FormField label={t("fields.taxId", { ns: "common" })}>
                <input className={fieldErrors.taxId ? "is-invalid" : ""} value={form.taxId} onChange={(e) => updateForm("taxId", e.target.value)} maxLength={9} inputMode="numeric" />
                {fieldErrors.taxId && <small className="field-error">{fieldErrors.taxId}</small>}
              </FormField>
              <FormField label={t("profile.personal.billingAddress")} wide>
                <input value={form.address} onChange={(e) => updateForm("address", e.target.value)} autoComplete="street-address" />
              </FormField>
              <FormField label={t("fields.postalCode", { ns: "common" })}>
                <input className={fieldErrors.postalCode ? "is-invalid" : ""} value={form.postalCode} onChange={(e) => updateForm("postalCode", e.target.value)} autoComplete="postal-code" inputMode="numeric" placeholder="0000-000" />
                {fieldErrors.postalCode && <small className="field-error">{fieldErrors.postalCode}</small>}
              </FormField>
              <FormField label={t("fields.city", { ns: "common" })}>
                <input value={form.city} onChange={(e) => updateForm("city", e.target.value)} autoComplete="address-level2" />
              </FormField>
            </ProfileFormSection>

            <div className="profile-settings-save">
              <button type="submit" className="profile-primary-cta" disabled={saving}>
                {saving ? t("profile.personal.saving") : t("profile.personal.save")}
              </button>
            </div>
          </form>
        )}

        {loyaltySettings.enabled && (isMobile || activeTab === "coupons") && (
          <section className="profile-panel profile-coupons-section" id="profile-coupons" data-profile-section="coupons">
            <div className="profile-section-heading">
              <div>
                <span>{t("profile.coupons.label")}</span>
                <h2>{t("profile.coupons.title")}</h2>
              </div>
              <button type="button" className="profile-text-button" onClick={jumpToOrders}>
                {t("profile.coupons.reorder")} <ChevronRight size={16} />
              </button>
            </div>

          {showCouponProgress && (
            <div className="profile-coupon-progress-card">
              <div className="profile-coupon-progress-copy">
                <span><Sparkles size={15} /> {t("profile.streak.label")}</span>
                <strong>{t("profile.streak.eligible", { count: couponStreak.required, current: couponStreak.current, required: couponStreak.required })}</strong>
                <p>{t("profile.streak.remaining", { count: couponStreak.remaining, minimum: formatCurrency(couponStreak.minimumSubtotal) })}</p>
              </div>
              <div className="profile-coupon-progress-track" aria-label={t("profile.streak.aria", { current: couponStreak.current, required: couponStreak.required })}>
                <span style={{ width: `${couponStreak.percent}%` }} />
              </div>
            </div>
          )}

            <div className="profile-loyalty-banner">
              <div>
                <Sparkles size={20} />
                <span>{t("profile.coupons.brand")}</span>
                <h3>{loyaltyProfileHeadline(loyaltySettings)}</h3>
                <p>{loyaltyCouponDetail(loyaltySettings)}</p>
              </div>
            </div>

            {loadingCoupons ? (
              <div className="profile-loading small">{t("profile.coupons.loading")}</div>
            ) : availableCoupons.length === 0 ? (
              <div className="profile-empty">
                {t("profile.coupons.empty", { minimum: formatCurrency(loyaltySettings.qualifyingOrderMinimum) })}
              </div>
            ) : (
              <div className="profile-coupon-grid">
                {availableCoupons.map((coupon) => (
                  <article key={coupon.couponId} className="profile-coupon-card">
                    <span>{coupon.type === "fixed_value" ? t("profile.coupons.fixed") : t("profile.coupons.percentage")}</span>
                    <h3>{t("profile.coupons.discount", { value: formatCurrency(coupon.value) })}</h3>
                    <p>{t("profile.coupons.useCode", { code: coupon.code })}</p>
                    <small>
                      {t("profile.coupons.minimum", { value: formatCurrency(coupon.minimumOrderValue) })}
                      {coupon.expiresAt ? ` · ${t("profile.coupons.expires", { date: formatDate(coupon.expiresAt) })}` : ""}
                    </small>
                    <Link to="/checkout" className="profile-order-again">{t("profile.coupons.use")}</Link>
                  </article>
                ))}
              </div>
            )}
            <Pagination page={couponsPage} perPage={couponsPerPage} total={couponsTotal} totalPages={couponsTotalPages} onPageChange={setCouponsPage} onPerPageChange={(value) => { setCouponsPerPage(value); setCouponsPage(1) }} />
          </section>
        )}

        {(isMobile || activeTab === "favorites") && (
          <section className="profile-panel profile-favorites-section" id="profile-favorites" data-profile-section="favorites">
            <div className="profile-section-heading compact">
              <div>
                <span>{t("profile.overview.fastReorder")}</span>
                <h2>{t("profile.overview.favouriteMeals")}</h2>
              </div>
            </div>
            <div className="profile-favorite-list">
              {favoriteMeals.slice(0, 3).map((meal) => (
                <button
                  type="button"
                  key={meal.productId}
                  className="profile-favorite-row"
                  onClick={() => navigate(`/product/${meal.productId}`)}
                >
                  <span>{meal.name}</span>
                  <strong>{t("profile.overview.repeatCount", { count: meal.quantity })}</strong>
                </button>
              ))}
              {favoriteMeals.length === 0 && <div className="profile-empty compact">{t("profile.overview.noFavourites")}</div>}
            </div>
          </section>
        )}

        {(isMobile || activeTab === "overview") && (
          <div className="profile-overview-section" id="profile-overview" data-profile-section="overview">
            <section className="profile-panel profile-overview-main">
              <div className="profile-section-heading">
                <div>
                  <span>{t("profile.overview.label")}</span>
                  <h2>{t("profile.overview.title")}</h2>
                </div>
                <button type="button" className="profile-text-button" onClick={jumpToOrders}>
                  {t("profile.overview.viewOrders")} <ChevronRight size={16} />
                </button>
              </div>

              <div className="profile-metric-grid">
                <div className="profile-metric-card">
                  <ReceiptText size={18} />
                  <span>{t("profile.hero.orders")}</span>
                  <strong>{overview?.orderCount ?? 0}</strong>
                </div>
                <div className="profile-metric-card">
                  <WalletCards size={18} />
                  <span>{t("profile.hero.totalSpent")}</span>
                  <strong>{formatCurrency(totalSpent)}</strong>
                </div>
                <div className="profile-metric-card">
                  <ShoppingBag size={18} />
                  <span>{t("profile.overview.itemsOrdered")}</span>
                  <strong>{totalItems}</strong>
                </div>
                <div className="profile-metric-card">
                  <WalletCards size={18} />
                  <span>{t("profile.overview.averageOrder")}</span>
                  <strong>{formatCurrency(overview?.averageOrderValue ?? 0)}</strong>
                </div>
                <div className="profile-metric-card">
                  <Star size={18} />
                  <span>{t("profile.overview.favourite")}</span>
                  <strong>{favoriteItem}</strong>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </section>
  )
}

function ProfileFormSection({
  children,
  description,
  eyebrow,
  icon: Icon,
  title,
}: {
  children: React.ReactNode
  description: string
  eyebrow: string
  icon: typeof UserRound
  title: string
}) {
  return (
    <section className="profile-panel profile-form-card">
      <div className="profile-form-card-heading">
        <div className="profile-form-icon"><Icon size={18} /></div>
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="profile-form-grid">{children}</div>
    </section>
  )
}

function FormField({
  children,
  label,
  wide = false,
}: {
  children: React.ReactNode
  label: string
  wide?: boolean
}) {
  return (
    <label className={wide ? "profile-field wide" : "profile-field"}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export default function Profile() {
  const [searchParams] = useSearchParams()
  if ((searchParams.get("tab") ?? searchParams.get("section")) === "orders") {
    const next = new URLSearchParams(searchParams)
    next.delete("tab")
    next.delete("section")
    return <Navigate to={{ pathname: "/orders", search: next.toString() }} replace />
  }
  return <ProfileContent />
}
