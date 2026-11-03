import { afterAll, describe, expect, it } from "vitest"

import i18n from "../i18n"
import { formatAdminRole } from "./adminEnumLabels"

const originalLanguage = i18n.language

afterAll(async () => {
  await i18n.changeLanguage(originalLanguage)
})

describe("admin enum labels", () => {

  it("translates staff roles in the active interface language", async () => {
    await i18n.changeLanguage("de-DE")

    expect(formatAdminRole("owner")).toBe("Inhaber")
    expect(formatAdminRole("waiter")).toBe("Servicekraft")
  })

})
