import { useId } from "react"
import { useTranslation } from "react-i18next"
import { roundCalories } from "../../utils/productNutrition"
import "./ProductCalorieField.css"

type Props = {
  automatic: boolean
  automaticTotal: number | null
  manualTotal?: number | null
  onAutomaticChange: (automatic: boolean) => void
  onManualChange: (total: number | null) => void
}

export default function ProductCalorieField({ automatic, automaticTotal, manualTotal, onAutomaticChange, onManualChange }: Props) {
  const { t } = useTranslation("admin")
  const inputId = useId()
  const incomplete = automatic && automaticTotal === null
  const value = automatic ? (automaticTotal === null ? "" : roundCalories(automaticTotal)) : manualTotal ?? ""

  return (
    <div className="ad-calorie-field">
      <label className="ad-calorie-field-heading" htmlFor={inputId}>{t("legacy.totalCalories")}</label>
      <div className="ad-calorie-field-input">
        <input
          id={inputId}
          type="number"
          min="0"
          step="any"
          readOnly={automatic}
          value={value}
          placeholder={t("legacy.nutritionNotInformed")}
          aria-describedby={incomplete ? `${inputId}-help` : undefined}
          onChange={(event) => {
            const next = event.target.valueAsNumber
            onManualChange(Number.isFinite(next) && next >= 0 ? next : null)
          }}
        />
        <span aria-hidden="true">kcal</span>
      </div>
      <button type="button" role="switch" aria-checked={automatic} className="ad-calorie-toggle" onClick={() => onAutomaticChange(!automatic)}>
        <span className="ad-calorie-toggle-track" aria-hidden="true"><span /></span>
        {t("legacy.calculateAutomatically")}
      </button>
      {incomplete && <small id={`${inputId}-help`} role="status">{t("legacy.incompleteIngredientNutrition")}</small>}
    </div>
  )
}
