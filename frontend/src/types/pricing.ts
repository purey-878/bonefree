import type { ExtraKind } from '../api/pricingTypes';
import type { CatalogTranslations } from '../utils/catalogTranslations';

interface OptionText {
  id?: number;
  label: string;
  displayOrder?: number;
  isAvailable: boolean;
  translations?: CatalogTranslations;
}
export interface CatalogPortion extends OptionText { price: number; }
export interface CatalogExtra extends OptionText { priceDelta: number; type: ExtraKind; }
