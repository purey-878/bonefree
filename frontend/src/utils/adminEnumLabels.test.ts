import { afterAll, describe, expect, it } from "vitest"

import i18n from "../i18n"
import { formatAdminRole, formatPaymentMethod, formatPaymentStatus } from "./adminEnumLabels"

const originalLanguage = i18n.language

afterAll(async () => {
  await i18n.changeLanguage(originalLanguage)
})

describe("admin enum labels", () => {
  it("translates payment values without changing their API representation", async () => {
    await i18n.changeLanguage("pt-PT")

    expect(formatPaymentMethod("counter")).toBe("Balcão")
    expect(formatPaymentStatus("paid")).toBe("Pago")
    expect(formatPaymentStatus("unpaid")).toBe("Por pagar")
  })

  it("translates staff roles in the active interface language", async () => {
    await i18n.changeLanguage("de-DE")

    expect(formatAdminRole("owner")).toBe("Inhaber")
    expect(formatAdminRole("waiter")).toBe("Servicekraft")
  })

  it("keeps unknown future enum values readable", () => {
    expect(formatPaymentStatus("partially_paid")).toBe("partially paid")
  })
})
