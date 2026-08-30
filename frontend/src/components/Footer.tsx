import React from "react"
import { Link } from "react-router-dom"
import { socialIconPaths } from "../utils/footerSettings"
import { useTranslation } from "react-i18next"
import { useOrganization } from '../organization/context/organization-context'
import { resolveNavigation } from '../organization/experience/navigation'
import type { OrganizationSocialLinks } from '../organization/model/types'
import currentManifest from '../app/manifest/currentManifest'

type SocialPlatform = keyof typeof socialIconPaths

interface FooterSocialLink {
  platform: SocialPlatform
  label: string
  href: string
  enabled: boolean
}

function publicSocialLinks(value: OrganizationSocialLinks): FooterSocialLink[] {
  return value.links.map((link) => ({
    platform: link.platform,
    label: link.label,
    href: link.href,
    enabled: link.enabled,
  }))
}

const Footer: React.FC = () => {
  const { t } = useTranslation(["storefront", "common"])
  const { organization, experience, capabilities } = useOrganization()
  const { profile } = experience
  const brandName = profile.display_name || organization.name
  const logoUrl = experience.experience.assets.logo || profile.logo_url
  const address = [
    profile.address_line_1,
    profile.address_line_2,
    [profile.postal_code, profile.city].filter(Boolean).join(' '),
    profile.country,
  ].filter(Boolean).join(', ')
  const socialLinks = publicSocialLinks(profile.social_links).filter((link) => link.enabled)
  const navigation = resolveNavigation(
    experience.experience.navigation,
    currentManifest.feature_registry,
    capabilities,
  )

  return (
    <footer className="footer pt-5 pb-3 text-light opacity-100">
      <div className="container">
        <div className="row">
          <div className="col-lg-3 col-md-6 mb-4">
            <div className="footer-brand">
              {logoUrl ? <img src={logoUrl} alt={brandName} /> : <strong>{brandName}</strong>}
            </div>
            {profile.description && <p className="mt-3">{profile.description}</p>}
          </div>

          <div className="col-lg-3 col-md-6 mb-4">
            <h5 className="fw-bold mb-3">{t("footer.links")}</h5>
            <ul className="list-unstyled">
              {navigation.map((item) => (
                <li key={item.id}>
                  <Link to={item.path} className="text-light text-decoration-none footer-link">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li><Link to="/privacy" className="text-light text-decoration-none footer-link">{t("footer.privacy")}</Link></li>
              <li><Link to="/terms" className="text-light text-decoration-none footer-link">{t("footer.terms")}</Link></li>
            </ul>
          </div>

          <div className="col-lg-3 col-md-6 mb-4">
            <h5 className="fw-bold mb-3">{t("footer.contact")}</h5>
            {address && <p><i className="bi bi-geo-alt-fill me-2" />{address}</p>}
            {profile.phone && <p><i className="bi bi-telephone-fill me-2" />{profile.phone}</p>}
            {profile.email && <p><i className="bi bi-envelope-fill me-2" />{profile.email}</p>}
          </div>

          <div className="col-lg-3 col-md-6 mb-4">
            <h5 className="fw-bold mb-3">{t("footer.follow")}</h5>
            <div className="footer-socials" aria-label={t("footer.socialLabel")}>
              {socialLinks.map((link) => (
                <a
                  key={link.platform}
                  href={link.href || "#"}
                  className="footer-social-link"
                  aria-label={link.label}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d={socialIconPaths[link.platform]} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>

        <hr className="border-light" />

        <div className="row">
          <div className="col text-center">
            <p className="mb-0">&copy; {new Date().getFullYear()} {brandName}. {t("footer.rights")}</p>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
