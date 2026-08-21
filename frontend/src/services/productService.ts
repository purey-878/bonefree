import {
  productsGetAvailabilitySuggestions,
  productsGetCustomizationOptions,
  productsGetProduct,
  productsGetProductCustomization,
  productsListProducts,
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
  ProductReview,
  ProductReviewEligibility,
  ProductReviewPayload,
  ProductReviewStats,
} from '../types/product';

interface AvailabilitySuggestionOptions {
  limit?: number;
}

export const productService = {
  async getAll(): Promise<Product[]> {
    return toDomain<Product[]>(await apiData(productsListProducts({
      client: publicApiClient,
      throwOnError: true,
    })));
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

  async getReviews(id: string | number): Promise<ProductReview[]> {
    return toDomain<ProductReview[]>(await apiData(reviewsListProductReviews({
      path: { product_id: String(id) },
      client: customerApiClient,
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
