import { apiData, publicApiClient } from '../api/clients';
import {
  productsGetProduct,
  productsListProducts
} from '../api/generated';
import { toDomain } from '../api/mappers';
import type { Page, PageRequest } from '../types/pagination';
import type {
  Product
} from '../types/product';

export interface ProductListOptions extends PageRequest {
  search?: string;
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  special?: 'all' | 'gluten_free' | 'alcohol';
  sort?: 'default' | 'price_asc' | 'price_desc' | 'name_asc';
  productIds?: number[];
}

export interface ProductCategoryFacet {
  categoryId: number;
  categoryDisplayId: string;
  name: string;
  count: number;
}

export interface ProductPage extends Page<Product> {
  facets: { totalProducts: number; maxPrice: number; categories: ProductCategoryFacet[] };
}

export const productService = {
  async getPage(options: ProductListOptions = {}): Promise<ProductPage> {
    return toDomain<ProductPage>(await apiData(productsListProducts({
      query: {
        page: options.page,
        per_page: options.perPage,
        search: options.search,
        category_id: options.categoryId,
        min_price: options.minPrice,
        max_price: options.maxPrice,
        special: options.special,
        sort: options.sort,
        product_ids: options.productIds,
      },
      client: publicApiClient,
      throwOnError: true,
    })));
  },

  async getAll(): Promise<Product[]> {
    const first = await this.getPage({ page: 1, perPage: 100 });
    const items = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) {
      items.push(...(await this.getPage({ page, perPage: 100 })).items);
    }
    return items;
  },

  async getById(id: string | number): Promise<Product> {
    return toDomain<Product>(await apiData(productsGetProduct({
      path: { product_id: String(id) },
      client: publicApiClient,
      throwOnError: true,
    })));
  },

};
