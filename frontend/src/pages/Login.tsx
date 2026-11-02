import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, CakeSlice, CupSoda, Salad, Sandwich, Soup } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../hooks'
import { validateEmail } from '../utils/validation'
import './Auth.css'
import Footer from '../components/Footer'
import { useTranslation } from 'react-i18next'

function Login() {
  const { t } = useTranslation(['account', 'common'])
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
      password: password.trim() ? '' : t('passwordRequired'),
    }
    setFieldErrors(errors)
    if (errors.email || errors.password) {
      setError(t('fixFields'))
      return
    }
    setLoading(true)

    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginFailed'))
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
            {t('back')}
          </button>
        <div className="auth-card glass-panel auth-flow-card auth-login-card">
          <div className="auth-mode-switch" aria-label={t('authMode')}>
            <Link className="active" to="/login" aria-current="page">{t('signIn')}</Link>
            <Link to="/register" state={{ from }}>{t('createAccount')}</Link>
          </div>
          <h1 className="auth-title fw-extrabold">
            {t('welcomeTitle')} <span className="green">.</span>
          </h1>

          {error && <div className="alert alert-danger">{error}</div>}


          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                {t('fields.email', { ns: 'common' })}
              </label>
              <input
                id="email"
                type="email"
                className={`form-input ${fieldErrors.email ? 'is-invalid' : ''}`}
                placeholder={t('emailPlaceholder')}
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
                {t('fields.password', { ns: 'common' })}
              </label>
              <input
                id="password"
                type="password"
                className={`form-input ${fieldErrors.password ? 'is-invalid' : ''}`}
                placeholder={t('fields.password', { ns: 'common' })}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setFieldErrors((current) => ({ ...current, password: undefined }))
                }}
                required
              />
              {fieldErrors.password && <small className="field-error">{fieldErrors.password}</small>}
            </div>

            <button type="submit" className="auth-btn bonefree-button fw-bold letter-spacing-2 " disabled={loading}>
              {loading ? t('signingIn') : t('signIn')}
            </button>
          </form>

          <div className="auth-inline-action">
            <Link to="/forgot-password" className="auth-link text-secondary opacity-100">
              {t('forgotPassword')}
            </Link>
          </div>

          <p className="auth-footer ">
            {t('newHere')}{' '}
            <Link to="/register" className="auth-link  text-secondary  opacity-75">
              {t('createAccount')}
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
