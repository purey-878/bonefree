/**
 * Product Service
 * Handles all product-related API calls
 */

import { API_BASE, authHeaders } from "./api";
import { translateUserMessage } from "../utils/messages";
import type {
  Product,
  ProductAvailabilitySuggestions,
  ProductReview,
  ProductReviewEligibility,
  ProductReviewPayload,
  ProductReviewStats,
} from "../types/product";
import type { ProductCustomizationDetails, ProductCustomizationOptions } from "../types/cart";

interface AvailabilitySuggestionOptions {
  quantity?: number;
  stockThreshold?: number;
  limit?: number;
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(translateUserMessage(data.detail || fallback));
  } catch {
    return new Error(translateUserMessage(fallback));
  }
}

export const productService = {
  /**
   * Fetch all products from the API
   */
  async getAll(): Promise<Product[]> {
    const response = await fetch(`${API_BASE}/products/`);
    if (!response.ok) {
      throw new Error("Não foi possível carregar os produtos.");
    }
    return response.json();
  },

  /**
   * Fetch a single product by ID
   */
  async getById(id: string | number): Promise<Product> {
    const response = await fetch(`${API_BASE}/products/${id}`);
    if (!response.ok) {
      throw new Error(`Produto ${id} não encontrado.`);
    }
    return response.json();
  },

  /**
   * Fetch stock-out replacement items and available similar dishes.
   */
  async getAvailabilitySuggestions(
    id: string | number,
    options: AvailabilitySuggestionOptions = {},
  ): Promise<ProductAvailabilitySuggestions> {
    const params = new URLSearchParams();
    if (options.quantity !== undefined) params.set("quantity", String(options.quantity));
    if (options.stockThreshold !== undefined) params.set("stock_threshold", String(options.stockThreshold));
    if (options.limit !== undefined) params.set("limit", String(options.limit));

    const query = params.toString();
    const response = await fetch(
      `${API_BASE}/products/${id}/availability-suggestions${query ? `?${query}` : ""}`,
    );
    if (!response.ok) {
      throw new Error(`Não foi possível carregar sugestões para o produto ${id}.`);
    }
    return response.json();
  },

  /**
   * Fetch item-level customization choices for a product.
   */
  async getCustomizationOptions(id: string | number): Promise<ProductCustomizationOptions> {
    const response = await fetch(`${API_BASE}/products/${id}/customization-options`);
    if (!response.ok) {
      throw new Error(`Não foi possível carregar as opções de personalização do produto ${id}.`);
    }
    return response.json();
  },

  async getCustomizationDetails(id: string | number): Promise<ProductCustomizationDetails> {
    const response = await fetch(`${API_BASE}/produtos/${id}/customizacao`);
    if (!response.ok) {
      throw new Error(`Não foi possível carregar os detalhes de personalização do produto ${id}.`);
    }
    return response.json();
  },

  async getReviews(id: string | number): Promise<ProductReview[]> {
    const response = await fetch(`${API_BASE}/products/${id}/reviews`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw await parseError(response, "Não foi possível carregar as avaliações.");
    }
    return response.json();
  },

  async getReviewStats(id: string | number): Promise<ProductReviewStats> {
    const response = await fetch(`${API_BASE}/products/${id}/reviews/stats`);
    if (!response.ok) {
      throw await parseError(response, "Não foi possível carregar as estatísticas das avaliações.");
    }
    return response.json();
  },

  async getReviewEligibility(id: string | number): Promise<ProductReviewEligibility> {
    const response = await fetch(`${API_BASE}/products/${id}/reviews/eligibility`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw await parseError(response, "Não foi possível verificar a elegibilidade da avaliação.");
    }
    return response.json();
  },

  async createReview(id: string | number, payload: ProductReviewPayload): Promise<ProductReview> {
    const response = await fetch(`${API_BASE}/products/${id}/reviews`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw await parseError(response, "Não foi possível criar a avaliação.");
    }
    return response.json();
  },

  async updateReview(reviewId: number, payload: ProductReviewPayload): Promise<ProductReview> {
    const response = await fetch(`${API_BASE}/reviews/${reviewId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw await parseError(response, "Não foi possível atualizar a avaliação.");
    }
    return response.json();
  },

  async deleteReview(reviewId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/reviews/${reviewId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw await parseError(response, "Não foi possível apagar a avaliação.");
    }
  },
};
