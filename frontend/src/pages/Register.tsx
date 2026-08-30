import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, CakeSlice, CupSoda, Salad, Sandwich, Soup } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../hooks'
import { guestCartService } from '../services/cartService'
import {
  normalizePhone,
  validateEmail,
  validateName,
  validatePassword,
  validatePhone,
} from '../utils/validation'
import type { FieldErrors } from '../utils/validation'
import './Auth.css'
import Footer from '../components/Footer'
import { useTranslation } from 'react-i18next'

function Register() {
  const { t } = useTranslation(['account', 'common'])
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    lastName: '',
    phone: '',
  })
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof typeof formData | 'acceptedTerms'>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { register } = useAuth()
  const from = (location.state as { from?: string } | null)?.from || '/'
  const redirectAfterRegister = (target: string, hadGuestCart: boolean) => {
    if (target === '/checkout' && !hadGuestCart) return '/'
    return target
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }))
    setFormData((prev) => ({
      ...prev,
      [name]: name === "phone" ? normalizePhone(value) : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const errors: FieldErrors<keyof typeof formData | 'acceptedTerms'> = {}
    const nomeError = validateName(formData.name)
    const apelidoError = validateName(formData.lastName)
    const emailError = validateEmail(formData.email)
    const passwordError = validatePassword(formData.password)
    const phoneError = validatePhone(formData.phone, false)
    if (nomeError) errors.name = nomeError
    if (apelidoError) errors.lastName = apelidoError
    if (emailError) errors.email = emailError
    if (passwordError) errors.password = passwordError
    if (phoneError) errors.phone = phoneError
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = t('passwordMismatch')
    }
    if (!acceptedTerms) {
      errors.acceptedTerms = t('acceptTermsRequired')
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setError(t('fixFields'))
      return
    }

    setLoading(true)

    try {
      const hadGuestCart = guestCartService.get().length > 0
      await register({
        email: formData.email.trim(),
        password: formData.password,
        name: formData.name.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim() || undefined,
        acceptedTerms,
      })
      navigate(redirectAfterRegister(from, hadGuestCart), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accountCreateFailed'))
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

        <div className="auth-card-stack auth-register-stack">
               <button type="button" className="auth-back-button py-3 fw-semibold" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} aria-hidden="true" />
            {t('back')}
          </button>


        <div className="auth-card glass-panel auth-flow-card auth-register-card">


          <div className="auth-mode-switch" aria-label={t('authMode')}>
            <Link to="/login" state={{ from }}>{t('signIn')}</Link>
            <Link className="active" to="/register" aria-current="page">{t('createAccount')}</Link>
          </div>

          <h1 className="auth-title">
            {t('registerTitle')}
          </h1>
          <p className="auth-subtitle">{t('registerSubtitle')}</p>

          {error && <div className="alert alert-danger">{error}</div>}


          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                {t('fields.email', { ns: 'common' })} <span className="required">*</span>
              </label>
              <input
                id="email"
                type="email"
                name="email"
                className={`form-input ${fieldErrors.email ? 'is-invalid' : ''}`}
                placeholder={t('emailPlaceholder')}
                value={formData.email}
                onChange={handleChange}
                required
              />
              {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name" className="form-label">
                  {t('fields.firstName', { ns: 'common' })} <span className="required">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  className={`form-input ${fieldErrors.name ? 'is-invalid' : ''}`}
                  placeholder="João"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
                {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
              </div>

              <div className="form-group">
                <label htmlFor="lastName" className="form-label">
                  {t('fields.lastName', { ns: 'common' })} <span className="required">*</span>
                </label>
                <input
                  id="lastName"
                  type="text"
                  name="lastName"
                  className={`form-input ${fieldErrors.lastName ? 'is-invalid' : ''}`}
                  placeholder="Silva"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
                {fieldErrors.lastName && <small className="field-error">{fieldErrors.lastName}</small>}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="phone" className="form-label">
                {t('fields.phone', { ns: 'common' })}
              </label>
              <input
                id="phone"
                type="tel"
                name="phone"
                className={`form-input ${fieldErrors.phone ? 'is-invalid' : ''}`}
                placeholder="+351912345678"
                value={formData.phone}
                onChange={handleChange}
                inputMode="tel"
              />
              {fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                {t('fields.password', { ns: 'common' })} <span className="required">*</span>
              </label>
              <input
                id="password"
                type="password"
                name="password"
                className={`form-input ${fieldErrors.password ? 'is-invalid' : ''}`}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
              />
              {fieldErrors.password && <small className="field-error">{fieldErrors.password}</small>}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">
                {t('fields.passwordConfirmation', { ns: 'common' })} <span className="required">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                name="confirmPassword"
                className={`form-input ${fieldErrors.confirmPassword ? 'is-invalid' : ''}`}
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
              {fieldErrors.confirmPassword && <small className="field-error">{fieldErrors.confirmPassword}</small>}
            </div>

            <div className="auth-legal-check">
              <label className="auth-checkbox-row">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => {
                    setAcceptedTerms(event.target.checked)
                    setFieldErrors((current) => ({ ...current, acceptedTerms: undefined }))
                  }}
                  required
                  aria-invalid={Boolean(fieldErrors.acceptedTerms)}
                />
                <span>
                  {t('acceptTermsBefore')}{' '}
                  <Link to="/terms" className="auth-link">{t('acceptTermsLink')}</Link>
                </span>
              </label>
              {fieldErrors.acceptedTerms && <small className="field-error">{fieldErrors.acceptedTerms}</small>}
              <p>
                {t('privacyNoticeBefore')}{' '}
                <Link to="/privacy" className="auth-link">{t('privacyNoticeLink')}</Link>.
              </p>
            </div>

            <button type="submit" className="auth-btn bonefree-button" disabled={loading}>
              {loading ? t('creatingAccount') : t('createAccount')}
            </button>

          </form>
                 </div>
          <p className="auth-footer">
            {t('alreadyRegistered')}{' '}
            <Link to="/login" className="auth-link">
              {t('signIn')}
            </Link>
          </p>
        </div>


      </div>

      <Footer />




      </>



  )

}

export default Register
