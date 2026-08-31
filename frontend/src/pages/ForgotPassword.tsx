import { useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { authService } from "../services/authService"
import { validateEmail, validatePassword } from "../utils/validation"
import "./Auth.css"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"
import { useToast } from "../components/ui/toastContext"
import { useTranslation } from "react-i18next"

type ResetStep = "email" | "otp" | "password" | "done"

function ForgotPassword() {
  const { t } = useTranslation(["account", "common"])
  const [step, setStep] = useState<ResetStep>("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [resetToken, setResetToken] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; code?: string; password?: string; confirmPassword?: string }>({})
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  const requestCode = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    const emailError = validateEmail(email)
    setFieldErrors({ email: emailError || undefined })
    if (emailError) {
      setError(t("fixFields"))
      return
    }
    setLoading(true)

    try {
      await authService.requestPasswordReset(email)
      toast.success(t("reset.codeSent"))
      setStep("otp")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reset.sendFailed"))
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ code: t("reset.codeLength") })
      setError(t("fixFields"))
      return
    }
    setLoading(true)

    try {
      const result = await authService.verifyPasswordOtp(email, code)
      setResetToken(result.resetToken)
      toast.success(t("reset.codeVerified"))
      setStep("password")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reset.invalidCode"))
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault()
    setError("")

    const passwordError = validatePassword(password)
    const confirmPasswordError = password === confirmPassword ? "" : t("passwordMismatch")
    setFieldErrors({
      password: passwordError || undefined,
      confirmPassword: confirmPasswordError || undefined,
    })
    if (passwordError || confirmPasswordError) {
      setError(t("fixFields"))
      return
    }

    setLoading(true)
    try {
      await authService.resetPassword(email, resetToken, password)
      toast.success(t("reset.passwordUpdated"))
      setStep("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reset.resetFailed"))
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
          {t("back")}
        </button>
      <div className="auth-card glass-panel">
        <div className="auth-stepper" aria-label={t("reset.progress")}>
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
          {t("reset.title")}
        </h1>
        <p className="auth-subtitle">
          {step === "email" && t("reset.emailIntro")}
          {step === "otp" && t("reset.codeIntro")}
          {step === "password" && t("reset.passwordIntro")}
          {step === "done" && t("reset.doneIntro")}
        </p>

        {error && <div className="alert alert-danger">{error}</div>}

        {step === "email" && (
          <form onSubmit={requestCode} className="auth-form">
            <div className="form-group">
              <label htmlFor="reset-email" className="form-label">{t("fields.email", { ns: "common" })}</label>
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
            <button type="submit" className="auth-btn bonefree-button" disabled={loading}>
              {loading ? t("reset.sendingCode") : t("reset.sendCode")}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyCode} className="auth-form">
            <div className="form-group">
              <label htmlFor="reset-code" className="form-label">{t("reset.codeLabel")}</label>
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
            <button type="submit" className="auth-btn bonefree-button" disabled={loading}>
              {loading ? t("reset.verifyingCode") : t("reset.verifyCode")}
            </button>
            <button type="button" className="auth-secondary-action" onClick={() => setStep("email")}>
              {t("reset.otherEmail")}
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={resetPassword} className="auth-form">
            <div className="form-group">
              <label htmlFor="new-password" className="form-label">{t("fields.newPassword", { ns: "common" })}</label>
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
              <label htmlFor="confirm-new-password" className="form-label">{t("fields.passwordConfirmation", { ns: "common" })}</label>
              <input
                id="confirm-new-password"
                type="password"
                className={`form-input ${fieldErrors.confirmPassword ? "is-invalid" : ""}`}
                placeholder={t("fields.password", { ns: "common" })}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  setFieldErrors((current) => ({ ...current, confirmPassword: undefined }))
                }}
                required
              />
              {fieldErrors.confirmPassword && <small className="field-error">{fieldErrors.confirmPassword}</small>}
            </div>
            <button type="submit" className="auth-btn bonefree-button" disabled={loading}>
              {loading ? t("actions.saving", { ns: "common" }) : t("reset.resetPassword")}
            </button>
          </form>
        )}

        {step === "done" && (
          <Link to="/login" className="auth-btn bonefree-button auth-done-link">
            {t("reset.backToLogin")}
          </Link>
        )}

        <p className="auth-footer">
          {t("reset.remember")} <Link to="/login" className="auth-link">{t("signIn")}</Link>
        </p>
      </div>
      </div>


    </div>
    <Footer />
    </>
  )
}

export default ForgotPassword
