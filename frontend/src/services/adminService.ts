import { API_BASE, adminHeaders, getAdminToken } from "./api";
import { translateUserMessage } from "../utils/messages";
import type {
  AdminOrder,
  AdminRefund,
  AdminCustomer,
  AdminCustomerPayload,
  AnalyticsMetric,
  AnalyticsRange,
  AnalyticsSeries,
  AdminIngredient,
  AdminIngredientPayload,
  AdminProduct,
  AdminProductPayload,
  AdminReview,
  AdminUserPayload,
  Category,
  CategoryPayload,
  CurrentAdmin,
  DashboardData,
  ProductAnalytics,
  ProductFilters,
  RefundFilters,
  RefundPayload,
  SalesPerformance,
  ReactionType,
  ReviewReaction,
  ReviewReply,
} from "../types/admin";

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const error = (await response.json()) as { detail?: string };
    return new Error(translateUserMessage(error.detail || fallback));
  } catch {
    return new Error(translateUserMessage(fallback));
  }
}

export const getDashboardAnalytics = async (): Promise<DashboardData> => {
  const response = await fetch(`${API_BASE}/admin/analytics/dashboard`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch dashboard analytics");
  return response.json();
};

export const getCurrentAdmin = async (): Promise<CurrentAdmin> => {
  const response = await fetch(`${API_BASE}/admin/me`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch current admin");
  return response.json();
};

export const createProduct = async (productData: AdminProductPayload): Promise<AdminProduct> => {
  const response = await fetch(`${API_BASE}/admin/products`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(productData),
  });
  if (!response.ok) throw await parseError(response, "Failed to create product");
  return response.json();
};

export const listProducts = async (
  skip = 0,
  limit = 10,
  includeDeleted = false,
  filters?: ProductFilters,
): Promise<AdminProduct[]> => {
  const params = new URLSearchParams();
  params.append("skip", skip.toString());
  params.append("limit", limit.toString());
  params.append("include_deleted", includeDeleted.toString());
  
  if (filters?.name) params.append("name", filters.name);
  if (filters?.category) params.append("category", String(filters.category));
  if (filters?.min_price !== undefined) params.append("min_price", filters.min_price.toString());
  if (filters?.max_price !== undefined) params.append("max_price", filters.max_price.toString());
  if (filters?.destaque !== undefined) params.append("destaque", String(filters.destaque));
  if (filters?.gluten_free !== undefined) params.append("gluten_free", String(filters.gluten_free));
  if (filters?.contains_alcohol !== undefined) params.append("contains_alcohol", String(filters.contains_alcohol));
  
  const response = await fetch(
    `${API_BASE}/admin/products?${params.toString()}`,
    { headers: adminHeaders() }
  );
  if (!response.ok) throw await parseError(response, "Failed to fetch products");
  return response.json();
};

export const getProduct = async (productId: string | number): Promise<AdminProduct> => {
  const response = await fetch(`${API_BASE}/admin/products/${productId}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch product");
  return response.json();
};

export const getProductAnalytics = async (productId: string | number, days = 30): Promise<ProductAnalytics> => {
  const response = await fetch(
    `${API_BASE}/admin/products/${productId}/analytics?days=${days}`,
    { headers: adminHeaders() }
  );
  if (!response.ok) throw await parseError(response, "Failed to fetch product analytics");
  return response.json();
};

export const listIngredients = async (includeInactive = false, customizationOnly = false): Promise<AdminIngredient[]> => {
  const params = new URLSearchParams({
    include_inactive: String(includeInactive),
    customization_only: String(customizationOnly),
  });
  const response = await fetch(`${API_BASE}/admin/ingredients?${params.toString()}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch ingredients");
  return response.json();
};

export const createIngredient = async (payload: AdminIngredientPayload): Promise<AdminIngredient> => {
  const response = await fetch(`${API_BASE}/admin/ingredients`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Failed to create ingredient");
  return response.json();
};

export const updateIngredient = async (
  ingredientId: number,
  payload: Partial<AdminIngredientPayload> & { status?: number },
): Promise<AdminIngredient> => {
  const response = await fetch(`${API_BASE}/admin/ingredients/${ingredientId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Failed to update ingredient");
  return response.json();
};

export const deleteIngredient = async (ingredientId: number): Promise<AdminIngredient> => {
  const response = await fetch(`${API_BASE}/admin/ingredients/${ingredientId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to deactivate ingredient");
  return response.json();
};

export const updateProduct = async (productId: string | number, productData: Partial<AdminProductPayload>): Promise<AdminProduct> => {
  const response = await fetch(`${API_BASE}/admin/products/${productId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(productData),
  });
  if (!response.ok) throw await parseError(response, "Failed to update product");
  return response.json();
};

export const deleteProduct = async (productId: string | number): Promise<AdminProduct> => {
  const response = await fetch(`${API_BASE}/admin/products/${productId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to delete product");
  return response.json();
};

export const restoreProduct = async (productId: string | number): Promise<AdminProduct> => {
  const response = await fetch(`${API_BASE}/admin/products/${productId}/toggle-status`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to restore product");
  return response.json();
};

export const listOrders = async (skip = 0, limit = 10): Promise<AdminOrder[]> => {
  const response = await fetch(
    `${API_BASE}/admin/orders?skip=${skip}&limit=${limit}`,
    { headers: adminHeaders() }
  );
  if (!response.ok) throw await parseError(response, "Failed to fetch orders");
  return response.json();
};

export const listStaffOrders = async (skip = 0, limit = 100): Promise<AdminOrder[]> => {
  const response = await fetch(
    `${API_BASE}/admin/staff/orders?skip=${skip}&limit=${limit}`,
    { headers: adminHeaders() }
  );
  if (!response.ok) throw await parseError(response, "Failed to fetch staff orders");
  return response.json();
};

export const listKitchenOrders = async (skip = 0, limit = 50): Promise<AdminOrder[]> => {
  const response = await fetch(
    `${API_BASE}/admin/kitchen/orders?skip=${skip}&limit=${limit}`,
    { headers: adminHeaders() }
  );
  if (!response.ok) throw await parseError(response, "Failed to fetch kitchen orders");
  return response.json();
};

export const getOrder = async (orderId: number): Promise<AdminOrder> => {
  const response = await fetch(`${API_BASE}/admin/orders/${orderId}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch order");
  return response.json();
};

export const updateOrderStatus = async (orderId: number, estado: string): Promise<AdminOrder> => {
  const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ estado }),
  });
  if (!response.ok) throw await parseError(response, "Failed to update order status");
  return response.json();
};

export const payCounterOrder = async (orderId: number): Promise<AdminOrder> => {
  const response = await fetch(`${API_BASE}/admin/orders/${orderId}/pay-counter`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to mark counter order as paid");
  const data = (await response.json()) as { order: AdminOrder };
  return data.order;
};

export const refundOrder = async (orderId: number, payload: RefundPayload): Promise<AdminOrder> => {
  const response = await fetch(`${API_BASE}/admin/orders/${orderId}/refund`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Failed to refund order");
  const data = (await response.json()) as { order: AdminOrder };
  return data.order;
};

export const listRefunds = async (filters: RefundFilters = {}): Promise<AdminRefund[]> => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const response = await fetch(`${API_BASE}/admin/refunds?${params.toString()}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch refunds");
  return response.json();
};

export const exportRefunds = async (filters: RefundFilters = {}): Promise<{ blob: Blob; filename: string }> => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const response = await fetch(`${API_BASE}/admin/refunds/export?${params.toString()}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to export refunds");
  return {
    blob: await response.blob(),
    filename: "bonefree-refunds.csv",
  };
};

export const listClientes = async (search = ""): Promise<AdminCustomer[]> => {
  const params = new URLSearchParams({ skip: "0", limit: "100" });
  if (search.trim()) params.set("search", search.trim());
  const response = await fetch(`${API_BASE}/admin/clientes?${params.toString()}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch customers");
  return response.json();
};

export const createCliente = async (payload: AdminCustomerPayload): Promise<AdminCustomer> => {
  const response = await fetch(`${API_BASE}/admin/clientes`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Failed to create customer");
  return response.json();
};

export const updateCliente = async (clienteId: number, payload: Partial<AdminCustomerPayload>): Promise<AdminCustomer> => {
  const response = await fetch(`${API_BASE}/admin/clientes/${clienteId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Failed to update customer");
  return response.json();
};

export const deleteCliente = async (clienteId: number): Promise<AdminCustomer> => {
  const response = await fetch(`${API_BASE}/admin/clientes/${clienteId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to deactivate customer");
  return response.json();
};

export const listStaffAdmins = async (): Promise<CurrentAdmin[]> => {
  const response = await fetch(`${API_BASE}/admin/staff`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch staff admins");
  return response.json();
};

export const createStaffAdmin = async (payload: AdminUserPayload & { password: string }): Promise<CurrentAdmin> => {
  const response = await fetch(`${API_BASE}/admin/staff`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Failed to create staff admin");
  return response.json();
};

export const updateStaffAdmin = async (adminId: number, payload: AdminUserPayload): Promise<CurrentAdmin> => {
  const response = await fetch(`${API_BASE}/admin/staff/${adminId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Failed to update staff admin");
  return response.json();
};

export const deleteStaffAdmin = async (adminId: number): Promise<CurrentAdmin> => {
  const response = await fetch(`${API_BASE}/admin/staff/${adminId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to deactivate staff admin");
  return response.json();
};

export const listCategories = async (includeInactive = false): Promise<Category[]> => {
  const token = getAdminToken();
  const response = await fetch(`${API_BASE}/admin/categories?include_inactive=${includeInactive}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw await parseError(response, "Failed to load categories");
  return response.json();
};

export const createCategory = async (payload: CategoryPayload): Promise<Category> => {
  const response = await fetch(`${API_BASE}/admin/categories`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Failed to create category");
  return response.json();
};

export const updateCategory = async (categoryId: string | number, payload: Partial<CategoryPayload> & { status?: number }): Promise<Category> => {
  const response = await fetch(`${API_BASE}/admin/categories/${categoryId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response, "Failed to update category");
  return response.json();
};

export const deleteCategory = async (categoryId: string | number): Promise<Category> => {
  const response = await fetch(`${API_BASE}/admin/categories/${categoryId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to deactivate category");
  return response.json();
};

export type UploadedProductImage = {
  caminho_imagem: string
  filename: string
  message: string
  url: string
}

export const uploadProductImage = async (productId: string | number, file: File, replaceExisting = true): Promise<UploadedProductImage> => {
  const token = getAdminToken();
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE}/admin/products/${productId}/image?replace_existing=${replaceExisting}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!response.ok) {
    throw await parseError(response, "Failed to upload image");
  }

  return response.json()
};

export const deleteProductImage = async (productId: string | number, imageId: number): Promise<void> => {
  const response = await fetch(`${API_BASE}/admin/products/${productId}/images/${imageId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!response.ok) {
    throw await parseError(response, "Failed to remove image");
  }
};

export const getLowStockProducts = async (threshold = 5, limit = 10): Promise<DashboardData["produtos_baixo_estoque"]> => {
  const response = await fetch(
    `${API_BASE}/admin/analytics/low-stock?threshold=${threshold}&limit=${limit}`,
    { headers: adminHeaders() }
  );
  if (!response.ok) throw await parseError(response, "Failed to fetch low stock products");
  return response.json();
};

export const getPopularProducts = async (limit = 5): Promise<DashboardData["produtos_populares"]> => {
  const response = await fetch(
    `${API_BASE}/admin/analytics/popular-products?limit=${limit}`,
    { headers: adminHeaders() }
  );
  if (!response.ok) throw await parseError(response, "Failed to fetch popular products");
  return response.json();
};

export const getSalesPerformance = async (days = 7): Promise<SalesPerformance> => {
  const response = await fetch(
    `${API_BASE}/admin/analytics/sales-performance?days=${days}`,
    { headers: adminHeaders() }
  );
  if (!response.ok) throw await parseError(response, "Failed to fetch sales performance");
  return response.json();
};

export const getAnalyticsSeries = async (
  metric: AnalyticsMetric,
  range: AnalyticsRange,
  startDate?: string,
  endDate?: string,
): Promise<AnalyticsSeries> => {
  const params = new URLSearchParams({ metric, range });
  if (range === "custom") {
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
  }
  const response = await fetch(`${API_BASE}/admin/analytics/series?${params.toString()}`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch analytics series");
  return response.json();
};

export const listProductReviews = async (productId: string | number): Promise<AdminReview[]> => {
  const response = await fetch(`${API_BASE}/products/${productId}/reviews`, {
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to fetch reviews");
  return response.json();
};

export const createReviewReply = async (reviewId: number, texto: string): Promise<ReviewReply> => {
  const response = await fetch(`${API_BASE}/admin/reviews/${reviewId}/reply`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ texto }),
  });
  if (!response.ok) throw await parseError(response, "Failed to create review reply");
  return response.json();
};

export const updateReviewReply = async (reviewId: number, replyId: number, texto: string): Promise<ReviewReply> => {
  const response = await fetch(`${API_BASE}/admin/reviews/${reviewId}/reply/${replyId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ texto }),
  });
  if (!response.ok) throw await parseError(response, "Failed to update review reply");
  return response.json();
};

export const deleteReviewReply = async (reviewId: number, replyId: number): Promise<void> => {
  const response = await fetch(`${API_BASE}/admin/reviews/${reviewId}/reply/${replyId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to delete review reply");
};

export const setReviewReaction = async (reviewId: number, tipo: ReactionType): Promise<ReviewReaction> => {
  const response = await fetch(`${API_BASE}/admin/reviews/${reviewId}/reaction`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ tipo }),
  });
  if (!response.ok) throw await parseError(response, "Failed to save reaction");
  return response.json();
};

export const deleteReviewReaction = async (reviewId: number): Promise<void> => {
  const response = await fetch(`${API_BASE}/admin/reviews/${reviewId}/reaction`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!response.ok) throw await parseError(response, "Failed to remove reaction");
};
