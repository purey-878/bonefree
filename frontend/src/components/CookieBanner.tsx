import { useEffect, useState } from "react"
import { useAuth } from "../hooks"
import "./CookieBanner.css"

const COOKIE_CONSENT_KEY = "bonefree_cookie_consent"
const COOKIE_CONSENT_VERSION = 1

type CookieConsent = {
  accepted: boolean
  version: number
  acceptedAt: string
}

function hasAcceptedCookies() {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY)
    if (!raw) return false
    const consent = JSON.parse(raw) as Partial<CookieConsent>
    return consent.accepted === true && consent.version === COOKIE_CONSENT_VERSION
  } catch {
    return false
  }
}

function storeAcceptedCookies() {
  const consent: CookieConsent = {
    accepted: true,
    version: COOKIE_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
  }
  localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent))
}

export default function CookieBanner() {
  const { isAuthenticated, loading } = useAuth()
  const [accepted, setAccepted] = useState(() => hasAcceptedCookies())

  useEffect(() => {
    if (isAuthenticated) {
      storeAcceptedCookies()
    }
  }, [isAuthenticated])

  const acceptAllCookies = () => {
    storeAcceptedCookies()
    setAccepted(true)
  }

  const visible = !loading && !isAuthenticated && !accepted

  if (!visible) return null

  return (
    <section className="cookie-banner" role="dialog" aria-live="polite" aria-label="Aviso de cookies">
      <div>
        <strong>Cookies no BONEFREE</strong>
        <p>Usamos cookies e armazenamento local para manter a sessao, carrinho, preferencias e melhorar a experiencia.</p>
      </div>
      <button type="button" onClick={acceptAllCookies}>
        Aceitar todos os cookies
      </button>
    </section>
  )
}
