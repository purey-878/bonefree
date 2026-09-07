import { useTranslation } from "react-i18next"

type AdminStatusBadgeProps = {
  active: boolean
}

export default function AdminStatusBadge({ active }: AdminStatusBadgeProps) {
  const { t } = useTranslation("admin")

  return (
    <span className={`ad-pill ${active ? "ad-pill-green" : "ad-pill-gray"}`}>
      {t(active ? "legacy.active" : "legacy.inactive")}
    </span>
  )
}
