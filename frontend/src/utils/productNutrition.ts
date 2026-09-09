import type { AdminProductIngredient } from "../types/admin"

export type CalorieMode = "manual" | "auto"

export function parseQuantityToGrams(quantity?: string | null): number | null {
  const value = quantity?.trim().replace(",", ".")
  const match = value?.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(g|gram|grams|kg|kilogram|kilograms)?$/i)
  if (!match) return null
  const amount = Number(match[1])
  const grams = /^(kg|kilogram)/i.test(match[2] ?? "") ? amount * 1000 : amount
  return Number.isFinite(grams) && grams >= 0 ? grams : null
}

export function ingredientCaloriesPerGram(ingredient: AdminProductIngredient): number | null {
  const calories = ingredient.caloriesPerGram
  return typeof calories === "number" && Number.isFinite(calories) && calories >= 0 ? calories : null
}

export function calculateIngredientCalories(ingredient: AdminProductIngredient): number | null {
  const grams = parseQuantityToGrams(ingredient.quantity)
  const calories = ingredientCaloriesPerGram(ingredient)
  if (grams === null || calories === null) return null
  const total = grams * calories
  return Number.isFinite(total) ? total : null
}

export function calculateProductCalories(ingredients: AdminProductIngredient[]): number | null {
  if (ingredients.length === 0) return null
  let total = 0
  for (const ingredient of ingredients) {
    const calories = calculateIngredientCalories(ingredient)
    if (calories === null) return null
    total += calories
  }
  return Number.isFinite(total) ? total : null
}

export function roundCalories(total: number): number {
  return Math.round((total + Number.EPSILON * total) * 100) / 100
}

// The API stores a total, without its calculation mode. Reopening a product
// must preserve that value until the user explicitly chooses to recalculate it.
export function initialCalorieMode(savedTotal?: number | null): CalorieMode {
  return savedTotal == null ? "auto" : "manual"
}

export function productNutritionPayload(ingredients: AdminProductIngredient[], mode: CalorieMode, manualTotal?: number | null) {
  const total = mode === "auto" ? calculateProductCalories(ingredients) : manualTotal
  return {
    ingredients,
    totalCalories: total == null ? null : roundCalories(total),
  }
}
