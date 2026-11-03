import type { ProductMedia } from './product';
export type EntityStatus = 'active' | 'inactive';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type IngredientType = 'normal' | 'sauce' | 'extra' | 'drink' | 'base' | 'side';

export interface AdminIngredient {
  ingredientId: number;
  name: string;
  type: IngredientType;
  status: EntityStatus;
  available: boolean;
  caloriesPerGram?: number | null;
  linkedProductCount?: number;
}

export interface AdminIngredientPayload {
  name: string;
  type: IngredientType;
  status?: EntityStatus;
  available: boolean;
  caloriesPerGram?: number | null;
}

export interface AdminProductIngredient {
  ingredientId?: number | null;
  name?: string | null;
  type: IngredientType;
  available?: boolean;
  includedByDefault: boolean;
  removable: boolean;
  substitutable: boolean;
  quantity?: string | null;
  caloriesPerGram?: number | null;
}

export interface AdminProductPayload {
  productId?: number;
  name: string;
  productDescription: string;
  price: number;
  available: boolean;
  categoryId: number;
  customizable: boolean;
  menuTags: string;
  featured: boolean;
  discountPercentage: number;
  glutenFree: boolean;
  containsAlcohol: boolean;
  totalCalories?: number | null;
  ingredients: AdminProductIngredient[];
}

export interface AdminProduct extends AdminProductPayload {
  productId: number;
  productDisplayId: string;
  categoryDisplayId: string;
  effectiveAvailable: boolean;
  unavailableBaseIngredients: string[];
  status: EntityStatus | null;
  deletedAt: string | null;
  media: ProductMedia[];
}

export interface Category { categoryId: number; categoryDisplayId: string; categoryName: string; categoryDescription?: string | null; status?: EntityStatus | null; activeProductCount?: number; }
export interface CategoryPayload { categoryName: string; categoryDescription?: string | null; }

export interface ProductFilters { name?: string; category?: string | number; minPrice?: number; maxPrice?: number; featured?: boolean; glutenFree?: boolean; containsAlcohol?: boolean; }
export type AdminRole = 'owner' | 'manager' | 'waiter' | 'chef';
export interface CurrentAdmin { adminId: number; name: string; email: string; role: AdminRole; status: UserStatus; }
export interface AdminUserPayload { name: string; email: string; password?: string; role: AdminRole; status: UserStatus; }
