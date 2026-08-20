import { useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { CakeSlice, CupSoda, Salad, Sandwich, Soup } from "lucide-react"
import "./Auth.css"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"
import { adminLogin } from "../services/adminService"
import type { AdminRole } from "../types/admin"

function normalizeAdminRole(role: unknown): AdminRole {
  if (role === "owner") return "owner"
  if (role === "chef") return "chef"
  if (role === "waiter") return "waiter"
  return "manager"
}

function adminHomeForRole(role: AdminRole): string {
  if (role === "owner") return "/admin/dashboard"
  if (role === "chef") return "/admin/kitchen"
  return "/admin/staff"
}

export default function AdminLogin() {
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
      localStorage.setItem("admin_role", adminRole)

      navigate(adminHomeForRole(adminRole), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar sessão")
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
        <div className="auth-mode-switch" aria-label="Modo de autenticação">
          <Link className="active" to="/admin/login" aria-current="page">Admin</Link>
          <Link to="/login">Login de cliente</Link>
        </div>


        <h1 className="auth-title fw-extrabold">
          Login <br /> admin <span className="green">.</span>
        </h1>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="admin-email" className="form-label">Email</label>
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
            <label htmlFor="admin-password" className="form-label">Palavra-passe</label>
            <input
              id="admin-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Palavra-passe"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="auth-btn bonefree-button fw-bold letter-spacing-2">
            {loading ? "A entrar..." : "Entrar como admin"}
          </button>
        </form>

        <p className="auth-footer admin-auth-footer">
          Precisa da área de cliente?{" "}
          <button type="button" onClick={() => navigate("/login")} className="link-button">
            Abrir login de cliente
          </button>
        </p>
      </div>
      </div>
      <Footer />
    </>
  )
}
