/**
 * Cart/Carrinho Types
 */

export interface GuestCartItem {
  id_produto: number;
  quantidade: number;
  customizacao?: ItemCustomization | null;
}

export interface CustomizationExtraSelection {
  id_opcao: number;
  quantidade: number;
}

export interface CustomizationSubstitutionSelection {
  id_ingrediente_original: number;
  id_ingrediente_novo: number;
}

export interface ItemCustomization {
  remove: string[];
  add: string[];
  preferences: string[];
  note?: string | null;
  ingredientes_removidos?: number[];
  extras?: CustomizationExtraSelection[];
  substituicoes?: CustomizationSubstitutionSelection[];
  preco_unitario_final?: number | string | null;
}

export interface ProductCustomizationOptions {
  remove: string[];
  add: string[];
  preferences: string[];
}

export interface CustomizationIngredient {
  id_ingrediente: number;
  nome: string;
  tipo: string;
  removivel: boolean;
  substituivel: boolean;
  incluido_por_defeito: boolean;
}

export interface CustomizationOption {
  id_opcao: number;
  id_ingrediente: number | null;
  nome: string;
  tipo: "EXTRA" | "ADICIONAR" | "SUBSTITUIR_MOLHO" | "SUBSTITUIR_ACOMPANHAMENTO";
  preco_extra: number | string;
  max_quantidade: number;
}

export interface ProductCustomizationDetails {
  id_produto: number;
  id_produto_display: string;
  nome: string;
  customizavel: boolean;
  preco_base: number | string;
  ingredientes: CustomizationIngredient[];
  ingredientes_removiveis: CustomizationIngredient[];
  ingredientes_substituiveis: CustomizationIngredient[];
  opcoes: Record<CustomizationOption["tipo"], CustomizationOption[]>;
}

export interface CustomizedCartItemRequest {
  id_produto: number;
  quantidade: number;
  ingredientes_removidos: number[];
  extras: CustomizationExtraSelection[];
  substituicoes: CustomizationSubstitutionSelection[];
  observacoes?: string | null;
}

export interface CartItem {
  cart_log_id: number;
  id_produto: number;
  id_produto_display: string;
  nome: string;
  preco: number;
  quantidade: number;
  stock: number;
  caminho_imagem?: string;
  customizacao?: ItemCustomization | null;
  subtotal: number;
}

export interface Cart {
  id_carrinho: number | null;
  itens: CartItem[] | GuestCartItem[];
  total: number | null;
}

export interface MergeResult {
  merged: number[];
  capped: number[];
  skipped: number[];
  carrinho: Cart;
}
