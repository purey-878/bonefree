import type { ProductMedia } from './product';

export interface GuestCartItem {
  productId: number;
  quantity: number;
  customization?: ItemCustomization | null;
}

export interface CustomizationExtraSelection { optionId: number; quantity: number; }
export interface CustomizationSubstitutionSelection { originalIngredientId: number; newIngredientId: number; }

export interface ItemCustomization {
  remove: string[];
  add: string[];
  preferences: string[];
  note?: string | null;
  removedIngredients?: number[];
  extras?: CustomizationExtraSelection[];
  substitutions?: CustomizationSubstitutionSelection[];
  finalUnitPrice?: number | string | null;
}

export interface ProductCustomizationOptions { remove: string[]; add: string[]; preferences: string[]; }
export type CustomizationOptionType = 'add' | 'remove' | 'extra' | 'substitute_sauce' | 'substitute_side';

export interface CustomizationIngredient {
  ingredientId: number;
  name: string;
  type: string;
  removable: boolean;
  substitutable: boolean;
  includedByDefault: boolean;
}

export interface CustomizationOption {
  optionId: number;
  ingredientId: number | null;
  name: string;
  type: CustomizationOptionType;
  extraPrice: number | string;
  maxQuantity: number;
}

export interface ProductCustomizationDetails {
  productId: number;
  productDisplayId: string;
  name: string;
  customizable: boolean;
  basePrice: number | string;
  ingredients: CustomizationIngredient[];
  removableIngredients: CustomizationIngredient[];
  substitutableIngredients: CustomizationIngredient[];
  options: Partial<Record<CustomizationOptionType, CustomizationOption[]>>;
}

export interface CustomizedCartItemRequest {
  productId: number;
  quantity: number;
  removedIngredients: number[];
  extras: CustomizationExtraSelection[];
  substitutions: CustomizationSubstitutionSelection[];
  notes?: string | null;
}

export interface CartItem {
  cartProductId: number;
  productId: number;
  productDisplayId: string;
  name: string;
  price: number;
  quantity: number;
  available: boolean;
  unavailableReason?: string | null;
  media?: ProductMedia | null;
  customization?: ItemCustomization | null;
  subtotal: number;
}

export interface Cart { cartId: number | null; items: CartItem[] | GuestCartItem[]; total: number | null; }
export interface MergeResult { merged: number[]; capped: number[]; skipped: number[]; cart: Cart; }
