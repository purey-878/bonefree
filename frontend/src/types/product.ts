export type EntityStatus = 'active' | 'inactive';
export type IngredientType = 'normal' | 'sauce' | 'extra' | 'drink' | 'base' | 'side';
export type MediaVariantKind = 'thumb' | 'card' | 'detail';

export interface MediaVariant {
  kind: MediaVariantKind;
  url: string;
  contentType: string;
  width: number;
  height: number;
  sizeBytes?: number | null;
}

export interface ProductMedia {
  mediaId: number;
  sortOrder: number;
  altText?: string | null;
  isPrimary: boolean;
  originalUrl: string;
  originalFilename?: string | null;
  contentType: string;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  variants: MediaVariant[];
}

export interface Product {
  id: number;
  idDisplay: string;
  categoryId?: number;
  category: string;
  name: string;
  description: string | null;
  media: ProductMedia[];
  price: number | null;
  totalCalories?: number | null;
  tags?: string[];
  glutenFree?: boolean;
  containsAlcohol?: boolean;
  highlighted?: boolean;
  available: boolean;
  unavailableReason?: string | null;
  unavailableDueToUnavailableBase?: boolean;
  ingredients?: ProductIngredientNutrition[];
}

export interface ProductIngredientNutrition {
  ingredientId: number;
  name: string;
  type: IngredientType;
  status?: EntityStatus;
  available: boolean;
  quantity?: string | null;
  caloriesPerGram?: number | null;
  calories: number;
}
