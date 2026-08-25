import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getPublicCompanyDetails, getPublicSocialMediaSettings } from "../services/siteSettingsService"
import { defaultCompanyDetails, defaultSocialMediaSettings, socialIconPaths } from "../utils/footerSettings"
import { useTranslation } from "react-i18next"

const Footer: React.FC = () => {
  const { t } = useTranslation(["storefront", "common"])
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

    return () => {
      cancelled = true
    }
  }, [])

  const socialLinks = socialMedia.links.filter((link) => link.enabled)

  return (
    <footer className="footer pt-5 pb-3 text-light opacity-100">
      <div className="container">
        <div className="row">
          <div className="col-lg-3 col-md-6 mb-4">
            <div className="footer-brand">
              <img src="/assets/images/bonefree-logo.webp" alt={companyDetails.brandName} />
            </div>
            <p className="mt-3">{companyDetails.description}</p>
          </div>

          <div className="col-lg-3 col-md-6 mb-4">
            <h5 className="fw-bold mb-3">{t("footer.links")}</h5>
            <ul className="list-unstyled">
              <li><Link to="/" className="text-light text-decoration-none footer-link">{t("navigation.home", { ns: "common" })}</Link></li>
              <li><Link to="/menu" className="text-light text-decoration-none footer-link">{t("navigation.menu", { ns: "common" })}</Link></li>
              <li><Link to="/about" className="text-light text-decoration-none footer-link">{t("navigation.about", { ns: "common" })}</Link></li>
              <li><Link to="/contact" className="text-light text-decoration-none footer-link">{t("navigation.contact", { ns: "common" })}</Link></li>
            </ul>
          </div>

          <div className="col-lg-3 col-md-6 mb-4">
            <h5 className="fw-bold mb-3">{t("footer.contact")}</h5>
            <p><i className="bi bi-geo-alt-fill me-2" />{companyDetails.address}</p>
            <p><i className="bi bi-telephone-fill me-2" />{companyDetails.phone}</p>
            <p><i className="bi bi-envelope-fill me-2" />{companyDetails.email}</p>
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
            <p className="mb-0">&copy; {new Date().getFullYear()} {companyDetails.brandName}. {t("footer.rights")}</p>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
