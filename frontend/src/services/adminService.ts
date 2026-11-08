import { adminApiClient, apiData, publicApiClient } from '../api/clients';
import type {
  IngredientType as ApiIngredientType,
  CategoryCreate,
  CategoryUpdate,
  EntityStatus,
  IngredientCreate,
  IngredientUpdate,
  ProductCreate,
  ProductUpdate,
  StaffAdminCreate,
  StaffAdminUpdate,
  UserRole,
  UserStatus
} from '../api/generated';
import {
  adminManagementAdminLogin,
  adminManagementCreateCategory,
  adminManagementCreateIngredient,
  adminManagementCreateProduct,
  adminManagementCreateStaffAdmin,
  adminManagementDeleteCategory,
  adminManagementDeleteIngredient,
  adminManagementDeleteProduct,
  adminManagementDeleteProductMedia,
  adminManagementDeleteStaffAdmin,
  adminManagementGetProduct,
  adminManagementListCategories,
  adminManagementListIngredientProducts,
  adminManagementListIngredients,
  adminManagementListProducts,
  adminManagementListStaffAdmins,
  adminManagementReadCurrentAdmin,
  adminManagementSetIngredientAvailability,
  adminManagementSetProductAvailability,
  adminManagementToggleProductStatus,
  adminManagementUpdateCategory,
  adminManagementUpdateIngredient,
  adminManagementUpdateProduct,
  adminManagementUpdateStaffAdmin,
  adminManagementUploadProductMedia
} from '../api/generated';
import { toDomain, toDto } from '../api/mappers';
import type {
  AdminIngredient,
  AdminIngredientPayload,
  AdminProduct,
  AdminProductPayload,
  AdminUserPayload,
  Category,
  CategoryPayload,
  CurrentAdmin,
  ProductFilters
} from '../types/admin';
import type { Page } from '../types/pagination';
import type { ProductMedia } from '../types/product';

const pathId = (value: string | number) => String(value);

export async function adminLogin(email: string, password: string): Promise<{ accessToken: string; tokenType: string; admin: CurrentAdmin }> {
  return toDomain(await apiData(adminManagementAdminLogin({
    body: { email, password }, client: publicApiClient, throwOnError: true,
  })));
}

export async function getCurrentAdmin(): Promise<CurrentAdmin> {
  return toDomain(await apiData(adminManagementReadCurrentAdmin({ client: adminApiClient, throwOnError: true })));
}

export async function createProduct(product: AdminProductPayload): Promise<AdminProduct> {
  return toDomain(await apiData(adminManagementCreateProduct({
    body: toDto<ProductCreate>(product), client: adminApiClient, throwOnError: true,
  })));
}

export interface AdminProductListOptions {
  page?: number;
  perPage?: number;
  catalogState?: 'active' | 'archived' | 'all';
  filters?: ProductFilters;
}

export async function listProducts(options: AdminProductListOptions = {}): Promise<Page<AdminProduct>> {
  const filters = options.filters;
  return toDomain(await apiData(adminManagementListProducts({
    query: {
      page: options.page ?? 1,
      per_page: options.perPage ?? 20,
      catalog_state: options.catalogState ?? 'active',
      name: filters?.name?.trim() || undefined,
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

export async function listAllProducts(options: Omit<AdminProductListOptions, 'page' | 'perPage'> = {}): Promise<AdminProduct[]> {
  const first = await listProducts({ ...options, page: 1, perPage: 100 });
  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    items.push(...(await listProducts({ ...options, page, perPage: 100 })).items);
  }
  return items;
}

export async function getProduct(productId: string | number): Promise<AdminProduct> {
  return toDomain(await apiData(adminManagementGetProduct({
    path: { product_id: pathId(productId) }, client: adminApiClient, throwOnError: true,
  })));
}

export interface IngredientListOptions {
  page?: number;
  perPage?: number;
  search?: string;
  type?: string;
  status?: 'active' | 'inactive' | 'archived' | 'all';
  customizationOnly?: boolean;
}

export async function listIngredients(options: IngredientListOptions = {}): Promise<Page<AdminIngredient>> {
  return toDomain(await apiData(adminManagementListIngredients({
    query: {
      page: options.page ?? 1,
      per_page: options.perPage ?? 20,
      search: options.search?.trim() || undefined,
      type: (options.type || undefined) as ApiIngredientType | undefined,
      status: (options.status === 'all' ? undefined : options.status) as EntityStatus | undefined,
      customization_only: options.customizationOnly,
    },
    client: adminApiClient,
    throwOnError: true,
  })));
}

export async function listAllIngredients(options: Omit<IngredientListOptions, 'page' | 'perPage'> = {}): Promise<AdminIngredient[]> {
  const first = await listIngredients({ ...options, page: 1, perPage: 100 });
  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    items.push(...(await listIngredients({ ...options, page, perPage: 100 })).items);
  }
  return items;
}

export async function listIngredientProducts(
  ingredientId: number,
  options: { page?: number; perPage?: number } = {},
): Promise<Page<AdminProduct>> {
  return toDomain(await apiData(adminManagementListIngredientProducts({
    path: { ingredient_id: ingredientId },
    query: { page: options.page ?? 1, per_page: options.perPage ?? 20 },
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

export async function listStaffAdmins(options: { page?: number; perPage?: number; search?: string; role?: string; status?: string } = {}): Promise<Page<CurrentAdmin>> {
  return toDomain(await apiData(adminManagementListStaffAdmins({
    query: {
      page: options.page ?? 1,
      per_page: options.perPage ?? 20,
      search: options.search?.trim() || undefined,
      role: (options.role || undefined) as UserRole | undefined,
      status: (options.status || undefined) as UserStatus | undefined,
    }, client: adminApiClient, throwOnError: true,
  })));
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

export async function listCategories(options: { page?: number; perPage?: number; search?: string; categoryId?: number; status?: string } = {}): Promise<Page<Category>> {
  return toDomain(await apiData(adminManagementListCategories({
    query: {
      page: options.page ?? 1,
      per_page: options.perPage ?? 20,
      search: options.search?.trim() || undefined,
      category_id: options.categoryId || undefined,
      status: (options.status || undefined) as EntityStatus | undefined,
    }, client: adminApiClient, throwOnError: true,
  })));
}
export async function listAllCategories(options: Omit<Parameters<typeof listCategories>[0], 'page' | 'perPage'> = {}): Promise<Category[]> {
  const first = await listCategories({ ...options, page: 1, perPage: 100 });
  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    items.push(...(await listCategories({ ...options, page, perPage: 100 })).items);
  }
  return items;
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
export async function uploadProductMedia(productId: string | number, file: File, replaceExisting = false): Promise<UploadedProductMedia> {
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
