import { useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { authService } from "../services/authService"
import { validateEmail, validatePassword } from "../utils/validation"
import "./Auth.css"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"

type ResetStep = "email" | "otp" | "password" | "done"

function ForgotPassword() {
  const [step, setStep] = useState<ResetStep>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [resetToken, setResetToken] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; code?: string; password?: string; confirmPassword?: string }>({})
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const requestCode = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setMessage("")
    const emailError = validateEmail(email)
    setFieldErrors({ email: emailError || undefined })
    if (emailError) {
      setError("Corrija os campos assinalados.")
      return
    }
    setLoading(true)

    try {
      const result = await authService.requestPasswordReset(email)
      setMessage(result.message)
      setStep("otp")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o código de reposição")
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setMessage("")
    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ code: "O código de reposição deve conter exatamente 6 dígitos." })
      setError("Corrija os campos assinalados.")
      return
    }
    setLoading(true)

    try {
      const result = await authService.verifyPasswordOtp(email, code)
      setResetToken(result.reset_token)
      setMessage(result.message)
      setStep("password")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código de reposição inválido")
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setMessage("")

    const passwordError = validatePassword(password)
    const confirmPasswordError = password === confirmPassword ? "" : "As palavras-passe não coincidem"
    setFieldErrors({
      password: passwordError || undefined,
      confirmPassword: confirmPasswordError || undefined,
    })
    if (passwordError || confirmPasswordError) {
      setError("Corrija os campos assinalados.")
      return
    }

    setLoading(true)
    try {
      const result = await authService.resetPassword(email, resetToken, password)
      setMessage(result.message)
      setStep("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível repor a palavra-passe")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <div className="auth-container">
      <Navbar />
  
      <div className="auth-card-stack">
        <button type="button" className="auth-back-button py-3 fw-semibold" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} aria-hidden="true" />
          Voltar
        </button>
      <div className="auth-card glass-panel">
        <div className="auth-stepper" aria-label="Progresso da reposição da palavra-passe">
          {["email", "otp", "password"].map((item, index) => (
            <span
              key={item}
              className={step === item || (step === "done" && item === "password") ? "active" : ""}
            >
              {index + 1}
            </span>
          ))}
        </div>

        <h1 className="auth-title">
          Repor <span className="green">palavra-passe</span>
        </h1>
        <p className="auth-subtitle">
          {step === "email" && "Introduza o email da conta e enviamos um código único."}
          {step === "otp" && "Introduza o código de seis dígitos enviado por email."}
          {step === "password" && "Escolha uma nova palavra-passe para a sua conta."}
          {step === "done" && "A sua palavra-passe foi atualizada."}
        </p>

        {error && <div className="alert alert-danger">{error}</div>}
        {message && <div className="auth-success">{message}</div>}

        {step === "email" && (
          <form onSubmit={requestCode} className="auth-form">
            <div className="form-group">
              <label htmlFor="reset-email" className="form-label">Email</label>
              <input
                id="reset-email"
                type="email"
                className={`form-input ${fieldErrors.email ? "is-invalid" : ""}`}
                placeholder="seu@email.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setFieldErrors((current) => ({ ...current, email: undefined }))
                }}
                required
              />
              {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
            </div>
            <button type="submit" className="auth-btn prey-button" disabled={loading}>
              {loading ? "A enviar código..." : "Enviar código"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyCode} className="auth-form">
            <div className="form-group">
              <label htmlFor="reset-code" className="form-label">Código de reposição</label>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                className={`form-input otp-input ${fieldErrors.code ? "is-invalid" : ""}`}
                placeholder="000000"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  setFieldErrors((current) => ({ ...current, code: undefined }))
                }}
                required
              />
              {fieldErrors.code && <small className="field-error">{fieldErrors.code}</small>}
            </div>
            <button type="submit" className="auth-btn prey-button" disabled={loading}>
              {loading ? "A verificar..." : "Verificar código"}
            </button>
            <button type="button" className="auth-secondary-action" onClick={() => setStep("email")}>
              Usar outro email
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={resetPassword} className="auth-form">
            <div className="form-group">
              <label htmlFor="new-password" className="form-label">Nova palavra-passe</label>
              <input
                id="new-password"
                type="password"
                className={`form-input ${fieldErrors.password ? "is-invalid" : ""}`}
                placeholder="••••••••"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setFieldErrors((current) => ({ ...current, password: undefined }))
                }}
                required
              />
              {fieldErrors.password && <small className="field-error">{fieldErrors.password}</small>}
            </div>
            <div className="form-group">
              <label htmlFor="confirm-new-password" className="form-label">Confirmar palavra-passe</label>
              <input
                id="confirm-new-password"
                type="password"
                className={`form-input ${fieldErrors.confirmPassword ? "is-invalid" : ""}`}
                placeholder="senha"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  setFieldErrors((current) => ({ ...current, confirmPassword: undefined }))
                }}
                required
              />
              {fieldErrors.confirmPassword && <small className="field-error">{fieldErrors.confirmPassword}</small>}
            </div>
            <button type="submit" className="auth-btn prey-button" disabled={loading}>
              {loading ? "A guardar..." : "Repor palavra-passe"}
            </button>
          </form>
        )}

        {step === "done" && (
          <Link to="/login" className="auth-btn prey-button auth-done-link">
            Voltar ao login
          </Link>
        )}

        <p className="auth-footer">
          Lembra-se da palavra-passe? <Link to="/login" className="auth-link">Entrar</Link>
        </p>
      </div>
      </div>

      
    </div>
    <Footer />
    </>
  )
}

export default ForgotPassword
