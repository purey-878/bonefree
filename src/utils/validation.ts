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
  if (!emailPattern.test(email)) return "Email inválido."
  const domain = email.split("@").pop() ?? ""
  if (disposableEmailDomains.has(domain)) return "Email inválido."
  return ""
}

export function validatePassword(value: string) {
  return passwordPattern.test(value)
    ? ""
    : "A palavra-passe deve conter maiúscula, minúscula, número e carácter especial."
}

export function validateName(value: string, required = true) {
  const name = normalizeText(value)
  if (!name) return required ? "Introduza um nome completo válido." : ""
  if (name.length < 2) return "O nome deve ter pelo menos 2 caracteres."
  if (name.length > 100) return "O nome deve ter no máximo 100 caracteres."
  if (/^\d+$/.test(name)) return "O nome não pode conter apenas números."
  if (!namePattern.test(name) || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name)) {
    return "Introduza um nome completo válido."
  }
  return ""
}

export function validatePhone(value: string, required = true) {
  const phone = normalizePhone(value)
  if (!phone) return required ? "Número de telefone português inválido." : ""
  const national = phone.startsWith("+351") ? phone.slice(4) : phone
  if (!/^\+?\d+$/.test(phone) || (phone.includes("+") && !phone.startsWith("+351"))) {
    return "O número de telefone deve conter apenas dígitos."
  }
  if (!/^\d{9}$/.test(national) || !national.startsWith("9")) {
    return "Número de telefone português inválido."
  }
  return ""
}

export function validateNif(value: string, required = false) {
  const nif = normalizeText(value)
  if (!nif) return required ? "O NIF deve conter exatamente 9 dígitos." : ""
  if (!/^\d{9}$/.test(nif)) return "O NIF deve conter exatamente 9 dígitos."
  const checksum = nif
    .slice(0, 8)
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * (9 - index), 0)
  let checkDigit = 11 - (checksum % 11)
  if (checkDigit >= 10) checkDigit = 0
  return checkDigit === Number(nif[8]) ? "" : "NIF português inválido."
}

export function validatePostalCode(value: string, required = false) {
  const postalCode = normalizeText(value)
  if (!postalCode) return required ? "O código postal deve seguir o formato português XXXX-XXX." : ""
  return postalCodePattern.test(postalCode) ? "" : "O código postal deve seguir o formato português XXXX-XXX."
}
