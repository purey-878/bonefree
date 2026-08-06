/**
 * User/Auth Types
 */

export interface InvoiceAddress {
  id_endereco?: number;
  cliente_id?: number;
  morada?: string | null;
  codigo_postal?: string | null;
  cidade?: string | null;
}

export interface User {
  id_cliente: number;
  email: string;
  nome: string | null;
  apelido: string | null;
  telefone?: string | null;
  nif?: string | null;
  endereco_fatura?: InvoiceAddress | null;
  notificacao_preferida?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  nome: string;
  apelido: string;
  telefone?: string;
  nif?: string;
}

export interface ProfileUpdateRequest {
  nome?: string | null;
  apelido?: string | null;
  email?: string;
  telefone?: string | null;
  nif?: string | null;
  endereco_fatura?: InvoiceAddress | null;
  notificacao_preferida?: string;
}
