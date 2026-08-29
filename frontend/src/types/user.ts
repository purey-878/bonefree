export interface InvoiceAddress {
  addressId?: number;
  customerId?: number;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

export interface User {
  customerId: number;
  email: string;
  name: string | null;
  lastName: string | null;
  phone?: string | null;
  taxId?: string | null;
  billingAddress?: InvoiceAddress | null;
}

export interface LoginRequest { email: string; password: string; }

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  lastName: string;
  phone?: string;
  taxId?: string;
  acceptedTerms: boolean;
}

export interface ProfileUpdateRequest {
  name?: string | null;
  lastName?: string | null;
  email?: string;
  phone?: string | null;
  taxId?: string | null;
  billingAddress?: InvoiceAddress | null;
}
