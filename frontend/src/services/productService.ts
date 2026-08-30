import {
  productsGetAvailabilitySuggestions,
  productsGetCustomizationOptions,
  productsGetProduct,
  productsGetProductCustomization,
  productsListProducts,
  reviewsListFeaturedProductReviews,
  reviewsCreateProductReview,
  reviewsDeleteProductReview,
  reviewsGetProductReviewEligibility,
  reviewsGetProductReviewStats,
  reviewsListProductReviews,
  reviewsUpdateProductReview,
} from '../api/generated';
import type { ProductReviewCreate, ProductReviewUpdate } from '../api/generated';
import { apiData, customerApiClient, publicApiClient } from '../api/clients';
import { toDomain } from '../api/mappers';
import type { ProductCustomizationDetails, ProductCustomizationOptions } from '../types/cart';
import type {
  Product,
  ProductAvailabilitySuggestions,
  FeaturedProductReview,
  ProductReview,
  ProductReviewEligibility,
  ProductReviewPayload,
  ProductReviewStats,
} from '../types/product';
import type { Page, PageRequest } from '../types/pagination';

interface AvailabilitySuggestionOptions {
  limit?: number;
}

export interface ProductListOptions extends PageRequest {
  search?: string;
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  special?: 'all' | 'gluten_free' | 'alcohol';
  sort?: 'default' | 'popular' | 'price_asc' | 'price_desc' | 'name_asc';
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

export interface ReviewListOptions extends PageRequest {
  rating?: number;
  minRating?: number;
  hasText?: boolean;
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

  async getAvailabilitySuggestions(
    id: string | number,
    options: AvailabilitySuggestionOptions = {},
  ): Promise<ProductAvailabilitySuggestions> {
    return toDomain<ProductAvailabilitySuggestions>(await apiData(productsGetAvailabilitySuggestions({
      path: { product_id: String(id) },
      query: {
        limit: options.limit,
      },
      client: publicApiClient,
      throwOnError: true,
    })));
  },

  async getCustomizationOptions(id: string | number): Promise<ProductCustomizationOptions> {
    return toDomain<ProductCustomizationOptions>(await apiData(productsGetCustomizationOptions({
      path: { product_id: String(id) },
      client: publicApiClient,
      throwOnError: true,
    })));
  },

  async getCustomizationDetails(id: string | number): Promise<ProductCustomizationDetails> {
    return toDomain<ProductCustomizationDetails>(await apiData(productsGetProductCustomization({
      path: { product_id: String(id) },
      client: publicApiClient,
      throwOnError: true,
    })));
  },

  async getReviewsPage(id: string | number, options: ReviewListOptions = {}): Promise<Page<ProductReview>> {
    return toDomain<Page<ProductReview>>(await apiData(reviewsListProductReviews({
      path: { product_id: String(id) },
      query: {
        page: options.page,
        per_page: options.perPage,
        rating: options.rating,
        min_rating: options.minRating,
        has_text: options.hasText,
      },
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async getReviews(id: string | number): Promise<ProductReview[]> {
    return (await this.getReviewsPage(id, { page: 1, perPage: 100 })).items;
  },

  async getFeaturedReviews(limit = 3): Promise<FeaturedProductReview[]> {
    return toDomain<FeaturedProductReview[]>(await apiData(reviewsListFeaturedProductReviews({
      query: { limit },
      client: publicApiClient,
      throwOnError: true,
    })));
  },

  async getReviewStats(id: string | number): Promise<ProductReviewStats> {
    return toDomain<ProductReviewStats>(await apiData(reviewsGetProductReviewStats({
      path: { product_id: String(id) },
      client: publicApiClient,
      throwOnError: true,
    })));
  },

  async getReviewEligibility(id: string | number): Promise<ProductReviewEligibility> {
    return toDomain<ProductReviewEligibility>(await apiData(reviewsGetProductReviewEligibility({
      path: { product_id: String(id) },
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async createReview(id: string | number, payload: ProductReviewPayload): Promise<ProductReview> {
    if (payload.orderProductId === undefined || payload.rating === undefined) {
      throw new TypeError('orderProductId and rating are required to create a review');
    }
    const body: ProductReviewCreate = {
      order_product_id: payload.orderProductId,
      rating: payload.rating,
      title: payload.title,
      comment: payload.comment,
    };
    return toDomain<ProductReview>(await apiData(reviewsCreateProductReview({
      path: { product_id: String(id) },
      body,
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async updateReview(reviewId: number, payload: ProductReviewPayload): Promise<ProductReview> {
    const body: ProductReviewUpdate = {
      rating: payload.rating,
      title: payload.title,
      comment: payload.comment,
    };
    return toDomain<ProductReview>(await apiData(reviewsUpdateProductReview({
      path: { review_id: reviewId },
      body,
      client: customerApiClient,
      throwOnError: true,
    })));
  },

  async deleteReview(reviewId: number): Promise<void> {
    await reviewsDeleteProductReview({
      path: { review_id: reviewId },
      client: customerApiClient,
      throwOnError: true,
    });
  },
};
