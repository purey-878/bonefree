import { CakeSlice, CupSoda, Salad, Sandwich, Soup } from "lucide-react"
import type { FormEvent } from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import Footer from "../components/Footer"
import Navbar from "../components/Navbar"
import { adminLogin } from "../services/adminService"
import { adminDashboardPathForRole, normalizeAdminRole } from "../utils/adminAccess"
import "./Auth.css"

export default function AdminLogin() {
  const { t } = useTranslation(["account", "common"])
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const data = await adminLogin(email, password)
      const adminRole = normalizeAdminRole(data.admin?.role)
      const adminName = data.admin?.name ?? ""

      localStorage.setItem("admin_token", data.accessToken)
      localStorage.setItem("admin_name", adminName)
      localStorage.setItem("admin_role", adminRole ?? "")

      navigate(adminDashboardPathForRole(), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.failed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="auth-container auth-page admin-auth-page">
        <Navbar />
        <div className="auth-floating-food-bg" aria-hidden="true">
          <span className="auth-food-float auth-food-float-salad"><Salad /></span>
          <span className="auth-food-float auth-food-float-soup"><Soup /></span>
          <span className="auth-food-float auth-food-float-sandwich"><Sandwich /></span>
          <span className="auth-food-float auth-food-float-drink"><CupSoda /></span>
          <span className="auth-food-float auth-food-float-cake"><CakeSlice /></span>
        </div>

        <div className="auth-card glass-panel auth-flow-card auth-login-card admin-login-card">
          <h1 className="auth-title fw-extrabold">
            {t("admin.title")}
          </h1>

          {error && <div className="alert alert-danger">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="admin-email" className="form-label">{t("fields.email", { ns: "common" })}</label>
              <input
                id="admin-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@bonefree.pt"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="admin-password" className="form-label">{t("fields.password", { ns: "common" })}</label>
              <input
                id="admin-password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("fields.password", { ns: "common" })}
                required
              />
            </div>

            <button type="submit" disabled={loading} className="auth-btn bonefree-button fw-bold letter-spacing-2">
              {loading ? t("admin.signingIn") : t("admin.signIn")}
            </button>
          </form>

        </div>
      </div>
      <Footer />
    </>
  )
}
