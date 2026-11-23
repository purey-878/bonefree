import { ReservationPromotionBadge } from './ReservationPromotionNotice';
import { useReservationPromotion } from '../hooks/useReservationPromotion';
import { ArrowUpRight, Clock3, Leaf, Mail, MapPin, Phone, Sparkles, Sun, Waves } from "lucide-react"
import "./Footer.css"
import { brandLogo } from "../constants/brandLogo"
import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getPublicCompanyDetails, getPublicSocialMediaSettings } from "../services/siteSettingsService"
import { defaultCompanyDetails, defaultSocialMediaSettings, socialIconPaths } from "../utils/footerSettings"
import { useTranslation } from "react-i18next"

const Footer: React.FC = () => {
  const { t } = useTranslation(["storefront", "common"])
  const promotion = useReservationPromotion();
  const [companyDetails, setCompanyDetails] = useState(defaultCompanyDetails)
  const [socialMedia, setSocialMedia] = useState(defaultSocialMediaSettings)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      getPublicCompanyDetails().catch(() => defaultCompanyDetails),
      getPublicSocialMediaSettings().catch(() => defaultSocialMediaSettings),
    ]).then(([nextCompanyDetails, nextSocialMedia]) => {
      if (cancelled) return
      setCompanyDetails(nextCompanyDetails)
      setSocialMedia(nextSocialMedia)
    })

    return () => { cancelled = true }
  }, [])

  const socialLinks = socialMedia.links.filter(link => link.enabled)
  const exploreLinks = [
    ["/", "navigation.home"], ["/menu", "navigation.menu"],
    ["/about", "navigation.about"], ["/events", "navigation.events"],
    ["/contact", "navigation.contact"], ["/meal-finder", "navigation.mealFinder"],
  ] as const

  return (
    <footer className="footer bf-footer">
      <svg className="bf-footer-wave" viewBox="0 0 1440 96" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 28 C170 67 330 0 520 23 S820 66 1030 27 S1280 4 1440 24 L1440 96 L0 96 Z" fill="#fdcd43" opacity=".55" />
        <path d="M0 38 C190 76 315 13 510 34 S800 77 1025 39 S1250 18 1440 34 L1440 96 L0 96 Z" fill="#c8dbb1" />
        <path d="M0 48 C180 88 300 16 510 42 S810 92 1020 52 S1260 24 1440 50 L1440 96 L0 96 Z" fill="#f8f0d5" />
      </svg>
      <div className="bf-footer-doodles" aria-hidden="true"><Sun /><Leaf /><Waves /></div>
      <div className="bf-footer-inner">
        <div className="bf-footer-intro">
          <Link to="/" className="bf-footer-logo" aria-label={t("navigation.bonefreeHome", { ns: "common" })}><img {...brandLogo} sizes="88px" alt={companyDetails.brandName} /></Link>
          <p>{t("footer.description")}</p>
          <Link to={promotion ? `/reservations?date=${promotion.next_date}` : "/reservations"} className="bf-footer-reserve reservation-reserve-button"><Sparkles size={18} aria-hidden="true" />{t("navigation.reserveTable", { ns: "common" })}<ReservationPromotionBadge promotion={promotion} compact /><ArrowUpRight size={19} aria-hidden="true" /></Link>
        </div>

        <div className="bf-footer-grid">
          <nav aria-labelledby="footer-explore-title">
            <h2 id="footer-explore-title">{t("footer.links")}</h2>
            <ul className="bf-footer-links">{exploreLinks.map(([path, label]) => <li key={path}><Link to={path}>{t(label, { ns: "common" })}<ArrowUpRight size={14} aria-hidden="true" /></Link></li>)}</ul>
          </nav>
          <section aria-labelledby="footer-contact-title">
            <h2 id="footer-contact-title">{t("footer.contact")}</h2>
            <address className="bf-footer-contact">
              <Link to="/contact"><MapPin size={18} aria-hidden="true" /><span>{companyDetails.address}</span></Link>
              <a href={`tel:${companyDetails.phone.replace(/[^+0-9]/g, "")}`}><Phone size={18} aria-hidden="true" /><span>{companyDetails.phone}</span></a>
              <a href={`mailto:${companyDetails.email}`}><Mail size={18} aria-hidden="true" /><span>{companyDetails.email}</span></a>
            </address>
          </section>
          <section aria-labelledby="footer-hours-title">
            <h2 id="footer-hours-title"><Clock3 size={18} aria-hidden="true" />{t("contact.hours")}</h2>
            <p className="bf-footer-hours">{t("contact.hoursValue")}</p>
            <a className="bf-footer-community" href="https://chat.whatsapp.com/HHYqnv1aAByGWne4njshGs" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={socialIconPaths.whatsapp} /></svg><span>{t("footer.community")}</span><ArrowUpRight size={16} aria-hidden="true" /></a>
            {socialLinks.length > 0 && <div className="bf-footer-follow"><h3>{t("footer.follow")}</h3><div className="bf-footer-socials" aria-label={t("footer.socialLabel")}>
              {socialLinks.map(link => <a key={link.platform} href={link.href || "#"} aria-label={link.label} target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={socialIconPaths[link.platform]} /></svg><span>{link.label}</span><ArrowUpRight size={14} aria-hidden="true" /></a>)}
            </div></div>}
          </section>
        </div>

        <div className="bf-footer-bottom"><p>&copy; {new Date().getFullYear()} {companyDetails.brandName}. {t("footer.rights")}</p><Link to="/privacy">{t("privacy.title")}<ArrowUpRight size={14} aria-hidden="true" /></Link></div>
        <p className="bf-footer-credit">Designed &amp; developed by <a href="https://wa.me/351938282660" target="_blank" rel="noopener noreferrer"><strong>Purab Shrestha</strong></a></p>
      </div>
    </footer>
  )
}

export default Footer
