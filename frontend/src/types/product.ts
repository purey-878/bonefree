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
  originalPrice?: number | null;
  discountPercent?: number;
  sold?: number;
  totalCalories?: number | null;
  customizable: boolean;
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

export interface ProductSuggestion {
  productId: number;
  productDisplayId: string;
  name: string;
  category: string;
  price: number | null;
  score: number;
  reason: string;
}

export interface ProductAvailabilitySuggestions {
  productId: number;
  productDisplayId: string;
  name: string;
  available: boolean;
  availabilityReason: string;
  substitutes: ProductSuggestion[];
  similarDishes: ProductSuggestion[];
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewReply {
  replyId: number;
  reviewId: number;
  adminId: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewReaction {
  reactionId: number;
  reviewId: number;
  adminId: number;
  type: 'like' | 'heart';
  createdAt: string;
}

export interface ProductReview {
  reviewId: number;
  productId: number;
  productDisplayId: string;
  customerId: number;
  orderProductId: number | null;
  customerName: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  reply?: ReviewReply | null;
  replies?: ReviewReply[];
  reactions?: ReviewReaction[];
}

export interface ProductReviewStats {
  productId: number;
  productDisplayId: string;
  averageRating: number | null;
  totalReviews: number;
}

export interface ProductReviewEligibilityItem {
  orderProductId: number;
  orderId: number;
  productId: number;
  productDisplayId: string;
  productName: string;
  orderedAt: string;
  existingReview: ProductReview | null;
}

export interface ProductReviewEligibility {
  eligible: boolean;
  authenticated: boolean;
  items: ProductReviewEligibilityItem[];
  existingReview?: ProductReview | null;
  message: string;
}

export interface ProductReviewPayload {
  orderProductId?: number;
  rating?: number;
  title?: string | null;
  comment?: string | null;
}
