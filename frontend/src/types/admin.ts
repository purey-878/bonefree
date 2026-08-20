export interface ProductImage { imageId: number; imagePath: string; }
export type EntityStatus = 'active' | 'inactive';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type IngredientType = 'normal' | 'sauce' | 'extra' | 'drink' | 'base' | 'side';

export interface AdminIngredient {
  ingredientId: number;
  name: string;
  type: IngredientType;
  status: EntityStatus;
  caloriesPerGram?: number | null;
}

export interface AdminIngredientPayload {
  name: string;
  type: IngredientType;
  status?: EntityStatus;
  caloriesPerGram?: number | null;
}

export interface AdminProductIngredient {
  ingredientId?: number | null;
  name?: string | null;
  type: IngredientType;
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
  stock: number;
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
  sold: number | null;
  status: EntityStatus | null;
  deletedAt: string | null;
  images: ProductImage[];
}

export interface AdminOrderItem {
  productId: number;
  productDisplayId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  customization?: string | null;
  customizationSummary?: string[];
}

export interface AdminOrder {
  orderId: number;
  customerId?: number;
  customerEmail?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  state: string;
  paymentMethod?: string;
  paymentStatus?: string;
  total?: number;
  notes?: string | null;
  fulfillmentMethod?: 'dine_in' | 'pickup' | 'takeaway' | string;
  tableNumber?: number | null;
  canceledAt?: string | null;
  cancellationOrigin?: string | null;
  totalItems: number;
  items: AdminOrderItem[];
}

export interface ReviewReply { replyId: number; reviewId: number; adminId: number; text: string; createdAt: string; updatedAt: string; }
export type ReactionType = 'like' | 'heart';
export interface ReviewReaction { reactionId: number; reviewId: number; adminId: number; type: ReactionType; createdAt: string; }

export interface AdminReview {
  reviewId: number;
  productId: number;
  productDisplayId: string;
  productName?: string;
  customerId: number;
  orderProductId?: number | null;
  customerName?: string | null;
  rating: number;
  title?: string | null;
  comment?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  reply?: ReviewReply | null;
  replies?: ReviewReply[];
  reactions?: ReviewReaction[];
}

export interface DashboardProductMetric { productId: number; productDisplayId: string; name: string; stock?: number; price: number; category: string; sold?: number; }
export interface DashboardData {
  totalProducts: number;
  totalCategories: number;
  totalCustomers: number;
  totalCarts: number;
  lowStockProducts: Array<DashboardProductMetric & { stock: number }>;
  popularProducts: Array<DashboardProductMetric & { sold: number }>;
  salesCharts: DashboardSalesGraphs;
}

export interface Category { categoryId: number; categoryDisplayId: string; categoryName: string; categoryDescription?: string | null; status?: EntityStatus | null; }
export interface CategoryPayload { categoryName: string; categoryDescription?: string | null; }
export interface SalesDay { period: string; totalSales: number; quantitySold: number; orderCount: number; }
export interface DashboardSalesGraphs { byHour: SalesDay[]; byDay: SalesDay[]; byMonth: SalesDay[]; byYear: SalesDay[]; }
export interface SalesPerformance { totalSales: number; quantitySold: number; orderCount: number; period: string; salesByDay: SalesDay[]; }

export interface ProductAnalytics {
  productId: number;
  productDisplayId: string;
  totalSales: number;
  quantitySold: number;
  orderCount: number;
  currentPrice: number;
  currentStock: number;
  averageRating: number | null;
  totalReviews: number;
  salesByDay: SalesDay[];
}

export type AnalyticsMetric = 'sales' | 'orders' | 'clients' | 'products';
export type AnalyticsRange = 'day' | 'month' | 'year' | 'custom';
export interface AnalyticsSeriesPoint { period: string; label: string; value: number; quantitySold: number; orderCount: number; }
export interface AnalyticsSeries { metric: AnalyticsMetric; range: AnalyticsRange; startDate: string; endDate: string; total: number; points: AnalyticsSeriesPoint[]; }

export interface ProductFilters { name?: string; category?: string | number; minPrice?: number; maxPrice?: number; featured?: boolean; glutenFree?: boolean; containsAlcohol?: boolean; }
export type AdminRole = 'owner' | 'manager' | 'waiter' | 'chef';
export interface CurrentAdmin { adminId: number; name: string; email: string; role: AdminRole; status: UserStatus; }
export interface AdminUserPayload { name: string; email: string; password?: string; role: AdminRole; status: UserStatus; }

export interface AdminCustomer {
  customerId: number;
  name: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  taxId: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  status: UserStatus | null;
  createdAt: string | null;
}

export interface AdminCustomerPayload {
  name: string;
  lastName?: string;
  email: string;
  password?: string;
  phone?: string;
  taxId?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  status?: UserStatus;
}
