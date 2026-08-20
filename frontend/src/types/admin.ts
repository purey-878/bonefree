export interface ProductImage {
  id_imagem: number;
  caminho_imagem: string;
}

export type IngredientType = "INGREDIENTES_NORMAIS" | "MOLHO" | "EXTRA" | "BEBIDA" | "BASE" | "ACOMPANHAMENTO";

export interface AdminIngredient {
  id_ingrediente: number;
  nome: string;
  tipo: IngredientType;
  status: number;
  calorias_por_grama?: number | null;
}
export interface AdminIngredientPayload {
  nome: string;
  tipo: IngredientType;
  status?: number;
  calorias_por_grama?: number | null;
}

export interface AdminProductIngredient {
  id_ingrediente?: number;
  nome?: string;
  tipo: IngredientType;
  incluido_por_defeito: boolean;
  removivel: boolean;
  substituivel: boolean;
  quantidade?: string | null;
  calorias_por_grama?: number | null;
}

export interface AdminProductPayload {
  id_produto?: number;
  nome: string;
  descricao_produto: string;
  preco: number;
  stock: number;
  id_categoria: number;
  customizavel: boolean;
  menu_tags: string;
  destaque: boolean;
  desconto_percentual: number;
  gluten_free: boolean;
  contains_alcohol: boolean;
  total_calorias?: number | null;
  ingredientes: AdminProductIngredient[];
}

export interface AdminProduct extends AdminProductPayload {
  id_produto: number;
  id_produto_display: string;
  id_categoria_display: string;
  vendido: number;
  status: number;
  deleted_at: string | null;
  imagens: ProductImage[];
}

export interface AdminOrderItem {
  id_produto: number;
  id_produto_display: string;
  nome: string;
  quantidade: number;
  preco: number;
  total: number;
  customizacao?: string | null;
  customizacao_resumo?: string[];
}

export interface AdminOrder {
  id_carrinho: number;
  id_cliente?: number;
  cliente_email?: string;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  data_criacao: string;
  estado: string;
  metodo_pagamento?: string;
  estado_pagamento?: string;
  total?: number;
  notas?: string | null;
  fulfillment_method?: "dine_in" | "pickup" | "takeaway" | string;
  table_number?: number | null;
  data_cancelamento?: string | null;
  origem_cancelamento?: string | null;
  refund_status?: string;
  refund_id?: number | null;
  refund_amount?: number | null;
  refund_reason?: string | null;
  refund_notes?: string | null;
  refund_processed_by?: string | null;
  refund_processed_by_role?: string | null;
  refund_date?: string | null;
  data_atualizacao?: string | null;
  total_items: number;
  items: AdminOrderItem[];
}

export type RefundReason =
  | "Customer changed mind"
  | "Wrong order served"
  | "Missing item"
  | "Food quality issue"
  | "Payment issue"
  | "Duplicate payment"
  | "Other";

export interface RefundPayload {
  amount: number;
  reason: RefundReason;
  notes: string;
}

export interface AdminRefund {
  id_reembolso: number;
  id_encomenda: number;
  refund_id: string;
  order_id: string;
  original_invoice_number: string;
  customer_name: string;
  customer_email: string;
  amount: number;
  reason: RefundReason;
  notes: string;
  processed_by: string;
  processed_by_role: string;
  date: string;
  status: string;
  refund_method: string;
}

export interface RefundFilters {
  date_from?: string;
  date_to?: string;
  staff_member?: string;
  reason?: string;
  refund_status?: string;
}

export interface ReviewReply {
  id_reply: number;
  id_review: number;
  id_admin: number;
  texto: string;
  created_at: string;
  updated_at: string;
}

export type ReactionType = "like" | "heart";

export interface ReviewReaction {
  id_reaction: number;
  id_review: number;
  id_admin: number;
  tipo: ReactionType;
  created_at: string;
}

export interface AdminReview {
  id_review: number;
  id_produto: number;
  id_produto_display: string;
  product_name?: string;
  id_cliente: number;
  id_encomenda_produto?: number | null;
  cliente_nome?: string | null;
  rating: number;
  titulo?: string | null;
  comentario?: string | null;
  status: "pendente" | "aprovado" | "rejeitado";
  data_criacao: string;
  data_atualizacao: string;
  is_owner: boolean;
  reply?: ReviewReply | null;
  replies?: ReviewReply[];
  reactions?: ReviewReaction[];
}

export interface DashboardProductMetric {
  id_produto: number;
  id_produto_display: string;
  nome: string;
  stock?: number;
  preco: number;
  categoria: string;
  vendido?: number;
}

export interface DashboardData {
  total_produtos: number;
  total_categorias: number;
  total_clientes: number;
  total_carrinhos: number;
  produtos_baixo_estoque: Array<DashboardProductMetric & { stock: number }>;
  produtos_populares: Array<DashboardProductMetric & { vendido: number }>;
  graficos_vendas: DashboardSalesGraphs;
}

export interface Category {
  id_categoria: number;
  id_categoria_display: string;
  nome_categoria: string;
  descricao_categoria?: string | null;
  status?: number | null;
}

export interface CategoryPayload {
  nome_categoria: string;
  descricao_categoria?: string;
}

export interface SalesDay {
  periodo: string;
  total_vendas: number;
  quantidade_vendida: number;
  numero_pedidos: number;
}

export interface DashboardSalesGraphs {
  por_hora: SalesDay[];
  por_dia: SalesDay[];
  por_mes: SalesDay[];
  por_ano: SalesDay[];
}

export interface SalesPerformance {
  total_vendas: number;
  quantidade_vendida: number;
  numero_pedidos: number;
  periodo: string;
  vendas_por_dia: SalesDay[];
}

export interface ProductAnalytics {
  id_produto: number;
  id_produto_display: string;
  total_vendas: number;
  quantidade_vendida: number;
  numero_pedidos: number;
  preco_atual: number;
  stock_atual: number;
  rating_medio: number | null;
  total_reviews: number;
  vendas_por_dia: SalesDay[];
}

export type AnalyticsMetric = "sales" | "orders" | "clients" | "products";
export type AnalyticsRange = "day" | "month" | "year" | "custom";

export interface AnalyticsSeriesPoint {
  periodo: string;
  label: string;
  valor: number;
  quantidade_vendida: number;
  numero_pedidos: number;
}

export interface AnalyticsSeries {
  metric: AnalyticsMetric;
  range: AnalyticsRange;
  start_date: string;
  end_date: string;
  total: number;
  points: AnalyticsSeriesPoint[];
}

export interface ProductFilters {
  name?: string;
  category?: string | number;
  min_price?: number;
  max_price?: number;
  destaque?: boolean;
  gluten_free?: boolean;
  contains_alcohol?: boolean;
}

export type AdminRole = "owner" | "manager" | "waiter" | "chef";

export interface CurrentAdmin {
  id_admin: number;
  nome: string;
  email: string;
  role: AdminRole;
  status: number;
}

export interface AdminUserPayload {
  nome: string;
  email: string;
  password?: string;
  role: AdminRole;
  status: number;
}

export interface AdminCustomer {
  id_cliente: number;
  nome: string | null;
  apelido: string | null;
  email: string;
  telefone: string | null;
  nif: string | null;
  morada: string | null;
  cidade: string | null;
  codigo_postal: string | null;
  notificacao_preferida: string | null;
  status: number | null;
  data_criacao: string | null;
}

export interface AdminCustomerPayload {
  nome: string;
  apelido?: string;
  email: string;
  password?: string;
  telefone?: string;
  nif?: string;
  morada?: string;
  cidade?: string;
  codigo_postal?: string;
  status?: number;
}
