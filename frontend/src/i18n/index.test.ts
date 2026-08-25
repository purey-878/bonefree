import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import i18n, {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  changeLocale,
  i18nReady,
  normalizeLocale,
  resolvePreferredLocale,
  resolvedLocale,
  resources,
} from "."
import { formatEuro, formatPercent } from "../utils/money"
import { translateFieldError, translateUserMessage } from "../utils/messages"
import { validateEmail } from "../utils/validation"
import { customizationSummary } from "../services/cartService"

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const result = new Map<string, string>()
  if (!value || typeof value !== "object") return result
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof child === "string") result.set(path, child)
    else for (const [nestedKey, nestedValue] of flatten(child, path)) result.set(nestedKey, nestedValue)
  }
  return result
}

beforeAll(async () => {
  await i18nReady
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await i18n.changeLanguage(DEFAULT_LOCALE)
})

describe("locale resolution", () => {
  it("normalises Portuguese, British English and German variants", () => {
    expect(normalizeLocale("pt_BR")).toBe("pt-PT")
    expect(normalizeLocale("en-US")).toBe("en-GB")
    expect(normalizeLocale("de-AT")).toBe("de-DE")
    expect(normalizeLocale("fr-FR")).toBeNull()
  })

  it("prioritises a valid stored preference, then the browser, then Portuguese", () => {
    expect(resolvePreferredLocale("de-DE", ["en-US"])).toBe("de-DE")
    expect(resolvePreferredLocale("unsupported", ["fr-FR", "en-US"])).toBe("en-GB")
    expect(resolvePreferredLocale(null, ["de-AT"])).toBe("de-DE")
    expect(resolvePreferredLocale(null, ["fr-FR"])).toBe("pt-PT")
  })

  it("persists a change and updates the document language immediately", async () => {
    const values = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    vi.stubGlobal("document", { documentElement: { lang: "pt-PT" } })

    await changeLocale("de-DE")

    expect(values.get(LOCALE_STORAGE_KEY)).toBe("de-DE")
    expect(document.documentElement.lang).toBe("de-DE")
    expect(resolvedLocale()).toBe("de-DE")
  })
})

describe("translation catalogues", () => {
  it("keeps exactly the same non-empty keys in every locale", () => {
    const reference = flatten(resources["pt-PT"])
    expect(reference.size).toBeGreaterThan(0)

    for (const locale of SUPPORTED_LOCALES) {
      const catalogue = flatten(resources[locale])
      expect([...catalogue.keys()].sort()).toEqual([...reference.keys()].sort())
      expect([...catalogue.values()].every((value) => value.trim().length > 0)).toBe(true)
    }
  })

  it.each([
    ["pt-PT", "1 artigo", "2 artigos"],
    ["en-GB", "1 item", "2 items"],
    ["de-DE", "1 Artikel", "2 Artikel"],
  ] as const)("supports pluralisation in %s", async (locale, singular, plural) => {
    await i18n.changeLanguage(locale)
    expect(i18n.t("orders.common.items", { ns: "admin", count: 1 })).toBe(singular)
    expect(i18n.t("orders.common.items", { ns: "admin", count: 2 })).toBe(plural)
  })
})

describe("locale-aware messages and formatting", () => {
  it.each(SUPPORTED_LOCALES)("formats EUR, percentages, numbers, dates and times for %s", async (locale) => {
    await i18n.changeLanguage(locale)
    const instant = new Date("2025-06-14T17:30:00Z")

    expect(formatEuro(1234.5)).toBe(new Intl.NumberFormat(locale, {
      style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(1234.5))
    expect(formatPercent(12.5)).toBe(new Intl.NumberFormat(locale, {
      style: "percent", maximumFractionDigits: 2,
    }).format(0.125))
    expect((1234.5).toLocaleString(resolvedLocale())).toBe((1234.5).toLocaleString(locale))
    expect(instant.toLocaleDateString(resolvedLocale())).toBe(instant.toLocaleDateString(locale))
    expect(instant.toLocaleTimeString(resolvedLocale())).toBe(instant.toLocaleTimeString(locale))
  })

  it("translates API, validation and interpolated field messages after a language change", async () => {
    await i18n.changeLanguage("en-GB")
    expect(translateUserMessage("Product updated successfully.")).toBe("Product updated successfully.")
    expect(validateEmail("invalid")).toBe("Invalid email address.")
    expect(translateFieldError({ field: "email", code: "required" })).toBe("Email is required.")

    await i18n.changeLanguage("de-DE")
    expect(translateUserMessage("Produto indisponível.")).toBe("Produkt als nicht verfügbar markiert.")
    expect(validateEmail("invalid")).toBe("Ungültige E-Mail-Adresse.")
    expect(translateFieldError({ field: "email", code: "required" })).toBe("E-Mail ist erforderlich.")
  })

  it("translates legacy customisation labels while preserving free-form customer notes", async () => {
    await i18n.changeLanguage("en-GB")
    expect(customizationSummary({
      remove: ["onion"], add: ["extra sauce"], preferences: ["cut in half"], note: "Sem sal",
      removedIngredients: [], extras: [], substitutions: [], finalUnitPrice: null,
    })).toEqual([
      "Remove: Onion", "Add: Extra sauce", "Preferences: Cut in half", "Note: Sem sal",
    ])
  })
})
