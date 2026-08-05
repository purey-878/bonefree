import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, CakeSlice, CupSoda, Salad, Sandwich, Soup } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../hooks'
import { validateEmail } from '../utils/validation'
import './Auth.css'
import Footer from '../components/Footer'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const from = (location.state as { from?: string } | null)?.from || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const errors = {
      email: validateEmail(email),
      password: password.trim() ? '' : 'A palavra-passe é obrigatória.',
    }
    setFieldErrors(errors)
    if (errors.email || errors.password) {
      setError('Corrija os campos assinalados.')
      return
    }
    setLoading(true)

    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar sessão')
    } finally {
      setLoading(false)
    }
  }

  return (

    <>
      <div className="auth-container auth-page">
        <Navbar />
        <div className="auth-floating-food-bg" aria-hidden="true">
          <span className="auth-food-float auth-food-float-salad"><Salad /></span>
          <span className="auth-food-float auth-food-float-soup"><Soup /></span>
          <span className="auth-food-float auth-food-float-sandwich"><Sandwich /></span>
          <span className="auth-food-float auth-food-float-drink"><CupSoda /></span>
          <span className="auth-food-float auth-food-float-cake"><CakeSlice /></span>
        </div>
        <div className="auth-card-stack">
          <button type="button" className="auth-back-button py-3 fw-semibold" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar
          </button>
        <div className="auth-card glass-panel auth-flow-card auth-login-card">
          <div className="auth-mode-switch" aria-label="Modo de autenticação">
            <Link className="active" to="/login" aria-current="page">Entrar</Link>
            <Link to="/register" state={{ from }}>Criar conta</Link>
          </div>
          <h1 className="auth-title fw-extrabold">
            Bem-vindo  <br/> de volta <span className="green">.</span>
          </h1>
       

          {error && <div className="alert alert-danger">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                className={`form-input ${fieldErrors.email ? 'is-invalid' : ''}`}
                placeholder="nome@exemplo.pt"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setFieldErrors((current) => ({ ...current, email: undefined }))
                }}
                required
              />
              {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Palavra-passe
              </label>
              <input
                id="password"
                type="password"
                className={`form-input ${fieldErrors.password ? 'is-invalid' : ''}`}
                placeholder="Palavra-passe"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setFieldErrors((current) => ({ ...current, password: undefined }))
                }}
                required
              />
              {fieldErrors.password && <small className="field-error">{fieldErrors.password}</small>}
            </div>

            <button type="submit" className="auth-btn prey-button fw-bold letter-spacing-2 " disabled={loading}>
              {loading ? 'A entrar...' : 'Entrar'}
            </button>
          </form>

          <div className="auth-inline-action">
            <Link to="/forgot-password" className="auth-link text-secondary opacity-100">
              Esqueceu-se da palavra-passe?
            </Link>
          </div>

          <p className="auth-footer ">
            Novo por aqui?{' '}
            <Link to="/register" className="auth-link  text-secondary  opacity-75">
              Criar conta
            </Link>
          </p>
        </div>
        </div>
      </div>
      <Footer />

      </>
  )
}

export default Login
