import {
  adminManagementAdminLogin,
  adminManagementCreateCategory,
  adminManagementCreateCustomer,
  adminManagementCreateIngredient,
  adminManagementCreateProduct,
  adminManagementCreateStaffAdmin,
  adminManagementDeleteCategory,
  adminManagementDeleteCustomer,
  adminManagementDeleteIngredient,
  adminManagementDeleteProduct,
  adminManagementDeleteProductMedia,
  adminManagementDeleteStaffAdmin,
  adminManagementGetAnalyticsSeries,
  adminManagementGetDashboardAnalytics,
  adminManagementGetOrder,
  adminManagementGetPopularProducts,
  adminManagementGetProduct,
  adminManagementGetProductAnalytics,
  adminManagementGetSalesPerformance,
  adminManagementListCategories,
  adminManagementListCustomers,
  adminManagementListIngredients,
  adminManagementListKitchenOrders,
  adminManagementListOrders,
  adminManagementListProducts,
  adminManagementListStaffAdmins,
  adminManagementListStaffOrders,
  adminManagementPayCounterOrder,
  adminManagementReadCurrentAdmin,
  adminManagementSetIngredientAvailability,
  adminManagementSetProductAvailability,
  adminManagementToggleProductStatus,
  adminManagementUpdateCategory,
  adminManagementUpdateCustomer,
  adminManagementUpdateIngredient,
  adminManagementUpdateOrderStatus,
  adminManagementUpdateProduct,
  adminManagementUpdateStaffAdmin,
  adminManagementUploadProductMedia,
  reviewsCreateReviewReply,
  reviewsDeleteReviewReaction,
  reviewsDeleteReviewReply,
  reviewsListProductReviews,
  reviewsUpdateReviewReply,
  reviewsUpsertReviewReaction,
} from '../api/generated';
import type {
  CategoryCreate,
  CategoryUpdate,
  CustomerAdminCreate,
  CustomerAdminUpdate,
  IngredientCreate,
  IngredientUpdate,
  OrderState,
  ProductCreate,
  ProductUpdate,
  StaffAdminCreate,
  StaffAdminUpdate,
} from '../api/generated';
import { adminApiClient, apiData, publicApiClient } from '../api/clients';
import { toDomain, toDto } from '../api/mappers';
import type {
  AdminCustomer,
  AdminCustomerPayload,
  AdminIngredient,
  AdminIngredientPayload,
  AdminOrder,
  AdminProduct,
  AdminProductPayload,
  AdminReview,
  AdminUserPayload,
  AnalyticsMetric,
  AnalyticsRange,
  AnalyticsSeries,
  Category,
  CategoryPayload,
  CurrentAdmin,
  DashboardData,
  ProductAnalytics,
  ProductFilters,
  ReactionType,
  ReviewReaction,
  ReviewReply,
  SalesPerformance,
} from '../types/admin';
import type { ProductMedia } from '../types/product';

const pathId = (value: string | number) => String(value);

export async function adminLogin(email: string, password: string): Promise<{ accessToken: string; tokenType: string; admin: CurrentAdmin }> {
  return toDomain(await apiData(adminManagementAdminLogin({
    body: { email, password }, client: publicApiClient, throwOnError: true,
  })));
}

export async function getDashboardAnalytics(): Promise<DashboardData> {
  const value = toDomain<DashboardData>(await apiData(adminManagementGetDashboardAnalytics({ client: adminApiClient, throwOnError: true })));
  return {
    ...value,
    unavailableProducts: value.unavailableProducts ?? [],
    popularProducts: value.popularProducts ?? [],
    salesCharts: value.salesCharts ?? { byHour: [], byDay: [], byMonth: [], byYear: [] },
  };
}

export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  return toDomain(await apiData(adminManagementReadCurrentAdmin({ client: adminApiClient, throwOnError: true })));
}

export async function createProduct(product: AdminProductPayload): Promise<AdminProduct> {
  return toDomain(await apiData(adminManagementCreateProduct({
    body: toDto<ProductCreate>(product), client: adminApiClient, throwOnError: true,
  })));
}

export async function listProducts(skip = 0, limit = 10, includeDeleted = false, filters?: ProductFilters): Promise<AdminProduct[]> {
  return toDomain(await apiData(adminManagementListProducts({
    query: {
      skip, limit, include_deleted: includeDeleted,
      name: filters?.name,
      category: filters?.category == null ? undefined : String(filters.category),
      min_price: filters?.minPrice,
      max_price: filters?.maxPrice,
      featured: filters?.featured,
      gluten_free: filters?.glutenFree,
      contains_alcohol: filters?.containsAlcohol,
    },
    client: adminApiClient,
    throwOnError: true,
  })));
}

export async function getProduct(productId: string | number): Promise<AdminProduct> {
  return toDomain(await apiData(adminManagementGetProduct({
    path: { product_id: pathId(productId) }, client: adminApiClient, throwOnError: true,
  })));
}

export async function getProductAnalytics(productId: string | number, days = 30): Promise<ProductAnalytics> {
  return toDomain(await apiData(adminManagementGetProductAnalytics({
    path: { product_id: pathId(productId) }, query: { days }, client: adminApiClient, throwOnError: true,
  })));
}

export async function listIngredients(includeInactive = false, customizationOnly = false): Promise<AdminIngredient[]> {
  return toDomain(await apiData(adminManagementListIngredients({
    query: { include_inactive: includeInactive, customization_only: customizationOnly },
    client: adminApiClient,
    throwOnError: true,
  })));
}

export async function createIngredient(payload: AdminIngredientPayload): Promise<AdminIngredient> {
  return toDomain(await apiData(adminManagementCreateIngredient({
    body: toDto<IngredientCreate>(payload), client: adminApiClient, throwOnError: true,
  })));
}

export async function updateIngredient(ingredientId: number, payload: Partial<AdminIngredientPayload>): Promise<AdminIngredient> {
  return toDomain(await apiData(adminManagementUpdateIngredient({
    path: { ingredient_id: ingredientId }, body: toDto<IngredientUpdate>(payload), client: adminApiClient, throwOnError: true,
  })));
}

export async function deleteIngredient(ingredientId: number): Promise<AdminIngredient> {
  return toDomain(await apiData(adminManagementDeleteIngredient({
    path: { ingredient_id: ingredientId }, client: adminApiClient, throwOnError: true,
  })));
}

export async function setIngredientAvailability(ingredientId: number, available: boolean): Promise<AdminIngredient> {
  return toDomain(await apiData(adminManagementSetIngredientAvailability({
    path: { ingredient_id: ingredientId }, body: { available }, client: adminApiClient, throwOnError: true,
  })));
}

export async function updateProduct(productId: string | number, product: Partial<AdminProductPayload>): Promise<AdminProduct> {
  return toDomain(await apiData(adminManagementUpdateProduct({
    path: { product_id: pathId(productId) }, body: toDto<ProductUpdate>(product), client: adminApiClient, throwOnError: true,
  })));
}

export async function deleteProduct(productId: string | number): Promise<AdminProduct> {
  return toDomain(await apiData(adminManagementDeleteProduct({
    path: { product_id: pathId(productId) }, client: adminApiClient, throwOnError: true,
  })));
}

export async function restoreProduct(productId: string | number): Promise<AdminProduct> {
  return toDomain(await apiData(adminManagementToggleProductStatus({
    path: { product_id: pathId(productId) }, client: adminApiClient, throwOnError: true,
  })));
}

export async function setProductAvailability(productId: string | number, available: boolean): Promise<AdminProduct> {
  return toDomain(await apiData(adminManagementSetProductAvailability({
    path: { product_id: pathId(productId) }, body: { available }, client: adminApiClient, throwOnError: true,
  })));
}

export async function listOrders(skip = 0, limit = 10): Promise<AdminOrder[]> {
  return toDomain(await apiData(adminManagementListOrders({ query: { skip, limit }, client: adminApiClient, throwOnError: true })));
}
export async function listStaffOrders(skip = 0, limit = 100): Promise<AdminOrder[]> {
  return toDomain(await apiData(adminManagementListStaffOrders({ query: { skip, limit }, client: adminApiClient, throwOnError: true })));
}
export async function listKitchenOrders(skip = 0, limit = 50): Promise<AdminOrder[]> {
  return toDomain(await apiData(adminManagementListKitchenOrders({ query: { skip, limit }, client: adminApiClient, throwOnError: true })));
}
export async function getOrder(orderId: number): Promise<AdminOrder> {
  return toDomain(await apiData(adminManagementGetOrder({ path: { order_id: orderId }, client: adminApiClient, throwOnError: true })));
}
export async function updateOrderStatus(orderId: number, state: string): Promise<AdminOrder> {
  return toDomain(await apiData(adminManagementUpdateOrderStatus({
    path: { order_id: orderId }, body: { state: state as OrderState }, client: adminApiClient, throwOnError: true,
  })));
}
export async function payCounterOrder(orderId: number): Promise<AdminOrder> {
  const value = await apiData(adminManagementPayCounterOrder({ path: { order_id: orderId }, client: adminApiClient, throwOnError: true }));
  return toDomain(value.order);
}
export async function listCustomers(search = ''): Promise<AdminCustomer[]> {
  return toDomain(await apiData(adminManagementListCustomers({
    query: { skip: 0, limit: 100, search: search.trim() || undefined }, client: adminApiClient, throwOnError: true,
  })));
}
export async function createCustomer(payload: AdminCustomerPayload): Promise<AdminCustomer> {
  return toDomain(await apiData(adminManagementCreateCustomer({
    body: toDto<CustomerAdminCreate>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function updateCustomer(customerId: number, payload: Partial<AdminCustomerPayload>): Promise<AdminCustomer> {
  return toDomain(await apiData(adminManagementUpdateCustomer({
    path: { customer_id: customerId }, body: toDto<CustomerAdminUpdate>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function deleteCustomer(customerId: number): Promise<AdminCustomer> {
  return toDomain(await apiData(adminManagementDeleteCustomer({
    path: { customer_id: customerId }, client: adminApiClient, throwOnError: true,
  })));
}

export async function listStaffAdmins(): Promise<CurrentAdmin[]> {
  return toDomain(await apiData(adminManagementListStaffAdmins({ client: adminApiClient, throwOnError: true })));
}
export async function createStaffAdmin(payload: AdminUserPayload & { password: string }): Promise<CurrentAdmin> {
  return toDomain(await apiData(adminManagementCreateStaffAdmin({
    body: toDto<StaffAdminCreate>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function updateStaffAdmin(adminId: number, payload: AdminUserPayload): Promise<CurrentAdmin> {
  return toDomain(await apiData(adminManagementUpdateStaffAdmin({
    path: { admin_id: adminId }, body: toDto<StaffAdminUpdate>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function deleteStaffAdmin(adminId: number): Promise<CurrentAdmin> {
  return toDomain(await apiData(adminManagementDeleteStaffAdmin({
    path: { admin_id: adminId }, client: adminApiClient, throwOnError: true,
  })));
}

export async function listCategories(includeInactive = false): Promise<Category[]> {
  return toDomain(await apiData(adminManagementListCategories({
    query: { include_inactive: includeInactive }, client: adminApiClient, throwOnError: true,
  })));
}
export async function createCategory(payload: CategoryPayload): Promise<Category> {
  return toDomain(await apiData(adminManagementCreateCategory({
    body: toDto<CategoryCreate>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function updateCategory(categoryId: string | number, payload: Partial<CategoryPayload> & { status?: Category['status'] }): Promise<Category> {
  return toDomain(await apiData(adminManagementUpdateCategory({
    path: { category_id: pathId(categoryId) }, body: toDto<CategoryUpdate>(payload), client: adminApiClient, throwOnError: true,
  })));
}
export async function deleteCategory(categoryId: string | number): Promise<Category> {
  return toDomain(await apiData(adminManagementDeleteCategory({
    path: { category_id: pathId(categoryId) }, client: adminApiClient, throwOnError: true,
  })));
}

export type UploadedProductMedia = { media: ProductMedia; message: string; };
export async function uploadProductMedia(productId: string | number, file: File, replaceExisting = true): Promise<UploadedProductMedia> {
  return toDomain(await apiData(adminManagementUploadProductMedia({
    path: { product_id: pathId(productId) },
    query: { replace_existing: replaceExisting },
    body: { file },
    client: adminApiClient,
    throwOnError: true,
  })));
}
export async function deleteProductMedia(productId: string | number, mediaId: number): Promise<void> {
  await adminManagementDeleteProductMedia({
    path: { product_id: pathId(productId), media_id: mediaId }, client: adminApiClient, throwOnError: true,
  });
}

export async function getPopularProducts(limit = 5): Promise<DashboardData['popularProducts']> {
  return toDomain(await apiData(adminManagementGetPopularProducts({ query: { limit }, client: adminApiClient, throwOnError: true })));
}
export async function getSalesPerformance(days = 7): Promise<SalesPerformance> {
  return toDomain(await apiData(adminManagementGetSalesPerformance({ query: { days }, client: adminApiClient, throwOnError: true })));
}
export async function getAnalyticsSeries(metric: AnalyticsMetric, range: AnalyticsRange, startDate?: string, endDate?: string): Promise<AnalyticsSeries> {
  return toDomain(await apiData(adminManagementGetAnalyticsSeries({
    query: { metric, range, start_date: range === 'custom' ? startDate : undefined, end_date: range === 'custom' ? endDate : undefined },
    client: adminApiClient,
    throwOnError: true,
  })));
}

export async function listProductReviews(productId: string | number): Promise<AdminReview[]> {
  return toDomain(await apiData(reviewsListProductReviews({
    path: { product_id: pathId(productId) }, client: adminApiClient, throwOnError: true,
  })));
}
export async function createReviewReply(reviewId: number, text: string): Promise<ReviewReply> {
  return toDomain(await apiData(reviewsCreateReviewReply({
    path: { review_id: reviewId }, body: { text }, client: adminApiClient, throwOnError: true,
  })));
}
export async function updateReviewReply(reviewId: number, replyId: number, text: string): Promise<ReviewReply> {
  return toDomain(await apiData(reviewsUpdateReviewReply({
    path: { review_id: reviewId, reply_id: replyId }, body: { text }, client: adminApiClient, throwOnError: true,
  })));
}
export async function deleteReviewReply(reviewId: number, replyId: number): Promise<void> {
  await reviewsDeleteReviewReply({
    path: { review_id: reviewId, reply_id: replyId }, client: adminApiClient, throwOnError: true,
  });
}
export async function setReviewReaction(reviewId: number, type: ReactionType): Promise<ReviewReaction> {
  return toDomain(await apiData(reviewsUpsertReviewReaction({
    path: { review_id: reviewId }, body: { type }, client: adminApiClient, throwOnError: true,
  })));
}
export async function deleteReviewReaction(reviewId: number): Promise<void> {
  await reviewsDeleteReviewReaction({ path: { review_id: reviewId }, client: adminApiClient, throwOnError: true });
}
