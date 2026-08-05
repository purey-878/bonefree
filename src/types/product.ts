/**
 * Product Types
 */

export interface Product {
  id: number;
  id_display: string;
  category: string;
  name: string;
  description: string | null;
  image: string | null;
  images?: string[];
  price: number;
  original_price?: number | null;
  discount_percent?: number;
  stock: number;
  sold?: number;
  total_calorias?: number | null;
  customizavel: boolean;
  tags?: string[];
  gluten_free?: boolean;
  contains_alcohol?: boolean;
  highlighted?: boolean;
  available?: boolean;
  unavailable_reason?: string | null;
  unavailable_due_to_inactive_base?: boolean;
  ingredientes?: ProductIngredientNutrition[];
}

export interface ProductIngredientNutrition {
  id_ingrediente: number;
  nome: string;
  tipo: string;
  status?: number;
  quantidade?: string | null;
  calorias_por_grama?: number | null;
  calorias: number;
}

export interface ProductSuggestion {
  id_produto: number;
  id_produto_display: string;
  nome: string;
  categoria: string;
  preco: number | null;
  stock: number;
  score: number;
  reason: string;
}

export interface ProductAvailabilitySuggestions {
  id_produto: number;
  id_produto_display: string;
  nome: string;
  requested_quantity: number;
  stock_threshold: number;
  available: boolean;
  availability_reason: string;
  substitutes: ProductSuggestion[];
  similar_dishes: ProductSuggestion[];
}

export type ReviewStatus = "pendente" | "aprovado" | "rejeitado";

export interface ProductReview {
  id_review: number;
  id_produto: number;
  id_produto_display: string;
  id_cliente: number;
  id_encomenda_produto: number | null;
  cliente_nome: string | null;
  rating: number;
  titulo: string | null;
  comentario: string | null;
  status: ReviewStatus;
  data_criacao: string;
  data_atualizacao: string;
  is_owner: boolean;
  reply?: {
    id_reply: number;
    id_review: number;
    id_admin: number;
    texto: string;
    created_at: string;
    updated_at: string;
  } | null;
  replies?: Array<{
    id_reply: number;
    id_review: number;
    id_admin: number;
    texto: string;
    created_at: string;
    updated_at: string;
  }>;
  reactions?: Array<{
    id_reaction: number;
    id_review: number;
    id_admin: number;
    tipo: "like" | "heart";
    created_at: string;
  }>;
}

export interface ProductReviewStats {
  id_produto: number;
  id_produto_display: string;
  rating_medio: number | null;
  total_reviews: number;
}

export interface ProductReviewEligibilityItem {
  id_encomenda_produto: number;
  id_encomenda: number;
  id_produto: number;
  id_produto_display: string;
  nome_produto: string;
  data_encomenda: string;
  existing_review: ProductReview | null;
}

export interface ProductReviewEligibility {
  eligible: boolean;
  authenticated: boolean;
  items: ProductReviewEligibilityItem[];
  existing_review?: ProductReview | null;
  message: string;
}

export interface ProductReviewPayload {
  id_encomenda_produto?: number;
  rating?: number;
  titulo?: string | null;
  comentario?: string | null;
}
