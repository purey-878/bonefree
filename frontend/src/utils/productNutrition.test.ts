import { describe, expect, it } from "vitest"
import type { AdminProductIngredient } from "../types/admin"
import { calculateIngredientCalories, calculateProductCalories, initialCalorieMode, parseQuantityToGrams, productNutritionPayload } from "./productNutrition"

const ingredient: AdminProductIngredient = {
  ingredientId: 1, name: "Rice", type: "normal", includedByDefault: true,
  removable: true, substitutable: false, quantity: "100g", caloriesPerGram: 1.3,
}

describe("product nutrition", () => {
  it("converts existing gram and kilogram quantities without losing decimals", () => {
    expect(parseQuantityToGrams("0,125 kg")).toBe(125)
    expect(parseQuantityToGrams(".5g")).toBe(0.5)
    expect(parseQuantityToGrams("0g")).toBe(0)
    for (const value of ["", "-2g", "two", "3 cups", "Infinity"]) expect(parseQuantityToGrams(value)).toBeNull()
  })

  it("distinguishes missing nutrition from an explicitly zero calorie ingredient", () => {
    expect(calculateIngredientCalories({ ...ingredient, caloriesPerGram: 0 })).toBe(0)
    expect(calculateProductCalories([{ ...ingredient, caloriesPerGram: 0 }])).toBe(0)
    expect(calculateIngredientCalories({ ...ingredient, caloriesPerGram: null })).toBeNull()
    expect(calculateProductCalories([ingredient, { ...ingredient, quantity: "" }])).toBeNull()
    expect(calculateProductCalories([ingredient, { ...ingredient, caloriesPerGram: null }])).toBeNull()
    expect(calculateProductCalories([])).toBeNull()
    expect(calculateProductCalories([{ ...ingredient, caloriesPerGram: Infinity }])).toBeNull()
  })

  it("keeps composition and the manual total independent when changing calculation modes", () => {
    const ingredients = [{ ...ingredient }]
    const snapshot = structuredClone(ingredients)
    expect(productNutritionPayload(ingredients, "manual", 450)).toEqual({ ingredients: snapshot, totalCalories: 450 })
    expect(productNutritionPayload(ingredients, "auto", 450).totalCalories).toBe(130)
    expect(productNutritionPayload(ingredients, "manual", 450).totalCalories).toBe(450)
    expect(ingredients).toEqual(snapshot)
  })

  it("allows manual calories with unquantified ingredients and with no ingredients", () => {
    const ingredients = [{ ...ingredient, quantity: "", caloriesPerGram: null }]
    expect(productNutritionPayload(ingredients, "manual", 375)).toEqual({ ingredients, totalCalories: 375 })
    expect(productNutritionPayload([], "manual", 375).totalCalories).toBe(375)
    expect(productNutritionPayload(ingredients, "auto", 375).totalCalories).toBeNull()
  })

  it("rounds the complete automatic total only after adding all ingredients", () => {
    const ingredients = [ingredient, { ...ingredient, quantity: "0.025kg", caloriesPerGram: 0.333 }]
    expect(productNutritionPayload(ingredients, "auto").totalCalories).toBe(138.33)
  })

  it("keeps saved overrides authoritative when reopening existing products", () => {
    expect(initialCalorieMode(450)).toBe("manual")
    expect(initialCalorieMode(130)).toBe("manual")
    expect(initialCalorieMode(null)).toBe("auto")
    expect(initialCalorieMode(0)).toBe("manual")
  })
})
