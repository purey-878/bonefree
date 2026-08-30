import { useState } from "react"
import { Info, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { showPrototypeNotices } from "../config/siteFlags"
import { organizationSessionStorage } from "../core/storage/organizationStorage"
import { useOrganization } from "../organization/context/organization-context"
import "./PrototypeNotice.css"

type PrototypeNoticeTone = "general" | "order" | "account" | "product"

type PrototypeNoticeProps = {
  tone?: PrototypeNoticeTone
  className?: string
}

const translationKeys: Record<PrototypeNoticeTone, string> = {
  general: "prototypeNotice.general",
  order: "checkout.prototypeNotice",
  account: "prototypeNotice.account",
  product: "prototypeNotice.product",
}

const dismissedStorageKey = "prototype_notice_dismissed"

function readDismissed() {
  try {
    return organizationSessionStorage.getItem(dismissedStorageKey) === "true"
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    organizationSessionStorage.setItem(dismissedStorageKey, "true")
  } catch {
    return
  }
}

export default function PrototypeNotice({ tone = "general", className = "" }: PrototypeNoticeProps) {
  const { t } = useTranslation("storefront")
  const { organization, experience } = useOrganization()
  const [dismissedOrganizationSlug, setDismissedOrganizationSlug] = useState<string | null>(
    () => readDismissed() ? organization.slug : null,
  )
  const organizationName = experience.profile.display_name || organization.name
  const dismissed = dismissedOrganizationSlug === organization.slug || readDismissed()

  if (!showPrototypeNotices || dismissed) return null

  return (
    <aside className={`prototype-notice prototype-notice-${tone} ${className}`.trim()} role="status" aria-live="polite">
      <Info size={17} strokeWidth={2.4} aria-hidden="true" />
      <span className="prototype-notice-text">{t(translationKeys[tone], { organization: organizationName })}</span>
      <button
        type="button"
        className="prototype-notice-close"
        onClick={() => {
          writeDismissed()
          setDismissedOrganizationSlug(organization.slug)
        }}
        aria-label={t("prototypeNotice.close")}
      >
        <X size={16} strokeWidth={2.6} aria-hidden="true" />
      </button>
    </aside>
  )
}
