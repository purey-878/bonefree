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

function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    nome: '',
    apelido: '',
    telefone: '',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof typeof formData>>({})
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
      [name]: name === "telefone" ? normalizePhone(value) : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const errors: FieldErrors<keyof typeof formData> = {}
    const nomeError = validateName(formData.nome)
    const apelidoError = validateName(formData.apelido)
    const emailError = validateEmail(formData.email)
    const passwordError = validatePassword(formData.password)
    const phoneError = validatePhone(formData.telefone, false)
    if (nomeError) errors.nome = nomeError
    if (apelidoError) errors.apelido = apelidoError
    if (emailError) errors.email = emailError
    if (passwordError) errors.password = passwordError
    if (phoneError) errors.telefone = phoneError
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'As palavras-passe não coincidem'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setError('Corrija os campos assinalados.')
      return
    }

    setLoading(true)

    try {
      const hadGuestCart = guestCartService.get().length > 0
      await register({
        email: formData.email.trim(),
        password: formData.password,
        nome: formData.nome.trim(),
        apelido: formData.apelido.trim(),
        telefone: formData.telefone.trim() || undefined,
      })
      navigate(redirectAfterRegister(from, hadGuestCart), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar conta')
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
            Voltar
          </button>
        
        
        <div className="auth-card glass-panel auth-flow-card auth-register-card">
       
        
          <div className="auth-mode-switch" aria-label="Modo de autenticação">
            <Link to="/login" state={{ from }}>Entrar</Link>
            <Link className="active" to="/register" aria-current="page">Criar conta</Link>
          </div>
   
          <h1 className="auth-title">
            Criar conta.
          </h1>
          <p className="auth-subtitle">Guarde os seus dados e avance pelo checkout sem esforço.</p>

          {error && <div className="alert alert-danger">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email <span className="required">*</span>
              </label>
              <input
                id="email"
                type="email"
                name="email"
                className={`form-input ${fieldErrors.email ? 'is-invalid' : ''}`}
                placeholder="nome@exemplo.pt"
                value={formData.email}
                onChange={handleChange}
                required
              />
              {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="nome" className="form-label">
                  Nome <span className="required">*</span>
                </label>
                <input
                  id="nome"
                  type="text"
                  name="nome"
                  className={`form-input ${fieldErrors.nome ? 'is-invalid' : ''}`}
                  placeholder="João"
                  value={formData.nome}
                  onChange={handleChange}
                  required
                />
                {fieldErrors.nome && <small className="field-error">{fieldErrors.nome}</small>}
              </div>

              <div className="form-group">
                <label htmlFor="apelido" className="form-label">
                  Apelido <span className="required">*</span>
                </label>
                <input
                  id="apelido"
                  type="text"
                  name="apelido"
                  className={`form-input ${fieldErrors.apelido ? 'is-invalid' : ''}`}
                  placeholder="Silva"
                  value={formData.apelido}
                  onChange={handleChange}
                  required
                />
                {fieldErrors.apelido && <small className="field-error">{fieldErrors.apelido}</small>}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="telefone" className="form-label">
                Telefone
              </label>
              <input
                id="telefone"
                type="tel"
                name="telefone"
                className={`form-input ${fieldErrors.telefone ? 'is-invalid' : ''}`}
                placeholder="+351912345678"
                value={formData.telefone}
                onChange={handleChange}
                inputMode="tel"
              />
              {fieldErrors.telefone && <small className="field-error">{fieldErrors.telefone}</small>}
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Palavra-passe <span className="required">*</span>
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
                Confirmar palavra-passe <span className="required">*</span>
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

            <button type="submit" className="auth-btn prey-button" disabled={loading}>
              {loading ? 'A criar conta...' : 'Criar conta'}
            </button>
          </form>
                 </div>
          <p className="auth-footer">
            Já tem conta?{' '}
            <Link to="/login" className="auth-link">
              Entrar
            </Link>
          </p>
        </div>

    
      </div>

      <Footer />




      </>

     
    
  )

}

export default Register
