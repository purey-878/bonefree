export type FieldErrors<T extends string> = Partial<Record<T, string>>

const disposableEmailDomains = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
])

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/
const namePattern = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '\u2019-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/
const postalCodePattern = /^\d{4}-\d{3}$/
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/

export function normalizeText(value: string) {
  return value.trim()
}

export function normalizePhone(value: string) {
  return value.replace(/\s+/g, "")
}

export function validateEmail(value: string) {
  const email = normalizeText(value).toLowerCase()
  if (!emailPattern.test(email)) return i18n.t("validation.emailInvalid", { ns: "errors" })
  const domain = email.split("@").pop() ?? ""
  if (disposableEmailDomains.has(domain)) return i18n.t("validation.emailInvalid", { ns: "errors" })
  return ""
}

export function validatePassword(value: string) {
  return passwordPattern.test(value)
    ? ""
    : i18n.t("validation.passwordStrength", { ns: "errors" })
}

export function validateName(value: string, required = true) {
  const name = normalizeText(value)
  if (!name) return required ? i18n.t("validation.nameInvalid", { ns: "errors" }) : ""
  if (name.length < 2) return i18n.t("validation.nameTooShort", { ns: "errors" })
  if (name.length > 100) return i18n.t("validation.nameTooLong", { ns: "errors" })
  if (/^\d+$/.test(name)) return i18n.t("validation.nameOnlyNumbers", { ns: "errors" })
  if (!namePattern.test(name) || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name)) {
    return i18n.t("validation.nameInvalid", { ns: "errors" })
  }
  return ""
}

export function validatePhone(value: string, required = true) {
  const phone = normalizePhone(value)
  if (!phone) return required ? i18n.t("validation.phoneInvalid", { ns: "errors" }) : ""
  const national = phone.startsWith("+351") ? phone.slice(4) : phone
  if (!/^\+?\d+$/.test(phone) || (phone.includes("+") && !phone.startsWith("+351"))) {
    return i18n.t("validation.phoneDigits", { ns: "errors" })
  }
  if (!/^\d{9}$/.test(national) || !national.startsWith("9")) {
    return i18n.t("validation.phoneInvalid", { ns: "errors" })
  }
  return ""
}

export function validateNif(value: string, required = false) {
  const taxId = normalizeText(value)
  if (!taxId) return required ? i18n.t("validation.taxIdLength", { ns: "errors" }) : ""
  if (!/^\d{9}$/.test(taxId)) return i18n.t("validation.taxIdLength", { ns: "errors" })
  const checksum = taxId
    .slice(0, 8)
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * (9 - index), 0)
  let checkDigit = 11 - (checksum % 11)
  if (checkDigit >= 10) checkDigit = 0
  return checkDigit === Number(taxId[8]) ? "" : i18n.t("validation.taxIdInvalid", { ns: "errors" })
}

export function validatePostalCode(value: string, required = false) {
  const postalCode = normalizeText(value)
  if (!postalCode) return required ? i18n.t("validation.postalCodeInvalid", { ns: "errors" }) : ""
  return postalCodePattern.test(postalCode) ? "" : i18n.t("validation.postalCodeInvalid", { ns: "errors" })
}
import i18n from "../i18n"
