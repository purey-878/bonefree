import { X } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { AdminProductIngredient } from "../../types/admin"
import { calculateIngredientCalories, ingredientCaloriesPerGram, parseQuantityToGrams } from "../../utils/productNutrition"
import { resolvedLocale } from "../../i18n"
import "./ProductIngredientRows.css"

type Props = {
  ingredients: AdminProductIngredient[]
  automatic: boolean
  onQuantityChange: (index: number, quantity: string) => void
  onRemove: (index: number) => void
}

export default function ProductIngredientRows({ ingredients, automatic, onQuantityChange, onRemove }: Props) {
  const { t } = useTranslation("admin")
  return (
    <div className="ad-ingredient-rows">
      {ingredients.map((ingredient, index) => {
        const grams = parseQuantityToGrams(ingredient.quantity)
        const calories = calculateIngredientCalories(ingredient)
        const missingCalories = ingredientCaloriesPerGram(ingredient) === null
        return (
          <div className="ad-ingredient-edit-row" key={`${ingredient.ingredientId ?? ingredient.name}-${index}`}>
            <strong>{ingredient.name}</strong>
            <label>
              <span>{t("legacy.quantityGrams")}</span>
              <input
                aria-label={`${t("legacy.quantityGrams")} — ${ingredient.name}`}
                type="number"
                min="0"
                step="any"
                value={grams ?? ""}
                onChange={(event) => onQuantityChange(index, event.target.value ? `${event.target.value}g` : "")}
              />
            </label>
            <span className="ad-ingredient-calorie-value">
              {calories === null ? t("legacy.nutritionNotInformed") : `${calories.toLocaleString(resolvedLocale(), { maximumFractionDigits: 1 })} kcal`}
            </span>
            <button type="button" className="ad-ingredient-remove" aria-label={`${t("legacy.removeIngredient")} — ${ingredient.name}`} onClick={() => onRemove(index)}>
              <X size={16} aria-hidden="true" />
            </button>
            {automatic && calories === null && (
              <small className="ad-ingredient-nutrition-help">
                {t(missingCalories ? "legacy.ingredientCaloriesMissing" : "legacy.ingredientQuantityMissing")}
              </small>
            )}
          </div>
        )
      })}
      {ingredients.length === 0 && <p className="ad-empty ad-empty-compact">{t("legacy.noCompositionIngredients")}</p>}
    </div>
  )
}
