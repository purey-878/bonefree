import { API_BASE, authHeaders, getToken } from "./api";
import type { Product } from "../types/product";
import type { Cart, CartItem, CustomizedCartItemRequest, GuestCartItem, ItemCustomization, MergeResult } from "../types/cart";
import { translateUserMessage } from "../utils/messages";

const GUEST_CART_KEY = "guest_cart";

const customizationLabelTranslations: Record<string, string> = {
  remove: "Remover",
  add: "Adicionar",
  preferences: "Preferências",
  note: "Nota",
};

const customizationValueTranslations: Record<string, string> = {
  "extra sauce": "Molho extra",
  "extra vegan cheese": "Queijo vegan extra",
  "extra pickles": "Pickles extra",
  "extra jalapenos": "Jalapeños extra",
  "extra jalapeños": "Jalapeños extra",
  "extra salad": "Salada extra",
  "extra crispy onions": "Cebola crocante extra",
  "light sauce": "Pouco molho",
  "sauce on the side": "Molho à parte",
  "extra spicy": "Mais picante",
  "no spice": "Sem picante",
  "cut in half": "Cortado ao meio",
  pickles: "Pickles",
  onion: "Cebola",
  tomato: "Tomate",
  lettuce: "Alface",
  sauce: "Molho",
  slaw: "Couve marinada",
  coriander: "Coentros",
  spice: "Picante",
  berries: "Frutos vermelhos",
  seeds: "Sementes",
  syrup: "Calda",
};

/**
 * Dispatch custom event to notify app of cart updates
 */
export function dispatchCartUpdate(): void {
  const event = new CustomEvent('cartUpdated', { detail: { timestamp: Date.now() } });
  window.dispatchEvent(event);
}

function isCartItem(item: CartItem | GuestCartItem): item is CartItem {
  return "nome" in item;
}

export function emptyCustomization(): ItemCustomization {
  return {
    remove: [],
    add: [],
    preferences: [],
    note: null,
    ingredientes_removidos: [],
    extras: [],
    substituicoes: [],
    preco_unitario_final: null,
  };
}

export function normalizeCustomization(customization?: ItemCustomization | null): ItemCustomization | null {
  if (!customization) return null;

  const normalized: ItemCustomization = {
    remove: uniqueList(customization.remove ?? []),
    add: uniqueList(customization.add ?? []),
    preferences: uniqueList(customization.preferences ?? []),
    note: customization.note?.trim() || null,
    ingredientes_removidos: uniqueNumbers(customization.ingredientes_removidos),
    extras: (customization.extras ?? [])
      .filter((item) => item.id_opcao > 0 && item.quantidade > 0)
      .map((item) => ({ id_opcao: item.id_opcao, quantidade: item.quantidade })),
    substituicoes: (customization.substituicoes ?? [])
      .filter((item) => item.id_ingrediente_original > 0 && item.id_ingrediente_novo > 0)
      .map((item) => ({
        id_ingrediente_original: item.id_ingrediente_original,
        id_ingrediente_novo: item.id_ingrediente_novo,
      })),
    preco_unitario_final: customization.preco_unitario_final ?? null,
  };

  return hasCustomization(normalized) ? normalized : null;
}

export function hasCustomization(customization?: ItemCustomization | null): boolean {
  if (!customization) return false;
  return (
    (customization.remove?.length ?? 0) > 0 ||
    (customization.add?.length ?? 0) > 0 ||
    (customization.preferences?.length ?? 0) > 0 ||
    Boolean(customization.note?.trim()) ||
    Boolean(customization.ingredientes_removidos?.length) ||
    Boolean(customization.extras?.length) ||
    Boolean(customization.substituicoes?.length)
  );
}

export function customizationSummary(customization?: ItemCustomization | null): string[] {
  const normalized = normalizeCustomization(customization);
  if (!normalized) return [];

  const lines: string[] = [];
  if (normalized.remove.length) lines.push(`${customizationLabelTranslations.remove}: ${translatedChoices(normalized.remove)}`);
  if (normalized.add.length) lines.push(`${customizationLabelTranslations.add}: ${translatedChoices(normalized.add)}`);
  if (normalized.preferences.length) lines.push(`${customizationLabelTranslations.preferences}: ${translatedChoices(normalized.preferences)}`);
  if (normalized.note) lines.push(`${customizationLabelTranslations.note}: ${normalized.note}`);
  return lines;
}

function customizationKey(customization?: ItemCustomization | null): string {
  const normalized = normalizeCustomization(customization);
  return normalized ? JSON.stringify(normalized) : "";
}

function uniqueList(values: string[] = []): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function translatedChoice(value: string): string {
  return customizationValueTranslations[value.trim().toLowerCase()] ?? value;
}

function translatedChoices(values: string[]): string {
  return values.map(translatedChoice).join(", ");
}

function uniqueNumbers(values: number[] = []): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0))).sort((a, b) => a - b);
}

async function fetchProducts(): Promise<Product[]> {
  const response = await fetch(`${API_BASE}/products/`);

  if (!response.ok) {
    throw new Error("Não foi possível carregar os produtos.");
  }

  return response.json();
}

async function cartError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(translateUserMessage(data.detail || fallback));
  } catch {
    return new Error(translateUserMessage(fallback));
  }
}

/**
 * Guest Cart Logic (LocalStorage)
 */
export const guestCartService = {
  get(): GuestCartItem[] {
    const data = localStorage.getItem(GUEST_CART_KEY);
    return data ? JSON.parse(data) : [];
  },

  save(items: GuestCartItem[]): void {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    dispatchCartUpdate();
  },

  clear(): void {
    localStorage.removeItem(GUEST_CART_KEY);
    dispatchCartUpdate();
  },

  addItem(id_produto: number, quantidade: number = 1, stock?: number, customizacao?: ItemCustomization | null): GuestCartItem[] {
    const cart = this.get();
    const normalizedCustomization = normalizeCustomization(customizacao);
    const targetKey = customizationKey(normalizedCustomization);
    const existing = cart.find((i) => i.id_produto === id_produto && customizationKey(i.customizacao) === targetKey);

    if (existing) {
      const nova = existing.quantidade + quantidade;
      existing.quantidade = stock !== undefined ? Math.min(nova, stock) : nova;
    } else {
      cart.push({
        id_produto,
        quantidade: stock !== undefined ? Math.min(quantidade, stock) : quantidade,
        customizacao: normalizedCustomization,
      });
    }

    this.save(cart);
    return cart;
  },

  updateItem(id_produto: number, quantidade: number, stock?: number, customizacao?: ItemCustomization | null): GuestCartItem[] {
    let cart = this.get();
    const targetKey = customizationKey(customizacao);

    if (quantidade <= 0) {
      cart = cart.filter((i) => !(i.id_produto === id_produto && customizationKey(i.customizacao) === targetKey));
    } else {
      const item = cart.find((i) => i.id_produto === id_produto && customizationKey(i.customizacao) === targetKey);
      if (item) {
        item.quantidade = stock !== undefined ? Math.min(quantidade, stock) : quantidade;
      }
    }

    this.save(cart);
    return cart;
  },

  removeItem(id_produto: number, customizacao?: ItemCustomization | null): GuestCartItem[] {
    const targetKey = customizationKey(customizacao);
    const cart = this.get().filter((i) => !(i.id_produto === id_produto && customizationKey(i.customizacao) === targetKey));
    this.save(cart);
    return cart;
  },
};

/**
 * API Cart Logic
 */
export const apiCartService = {
  async getCart(): Promise<Cart> {
    const res = await fetch(`${API_BASE}/cart/`, { headers: authHeaders() });
    if (!res.ok) throw await cartError(res, "Failed to get cart");
    return res.json();
  },

  async addItem(id_produto: number, quantidade: number = 1, customizacao?: ItemCustomization | null): Promise<Cart> {
    const res = await fetch(`${API_BASE}/cart/add`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ id_produto, quantidade, customizacao: normalizeCustomization(customizacao) }),
    });
    if (!res.ok) {
      throw await cartError(res, "Failed to add item");
    }
    const result = await res.json();
    dispatchCartUpdate();
    return result;
  },

  async addCustomizedItem(body: CustomizedCartItemRequest): Promise<Cart> {
    const res = await fetch(`${API_BASE}/carrinho/itens/customizado`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw await cartError(res, "Failed to add customized item");
    }
    const result = await res.json();
    dispatchCartUpdate();
    return result;
  },

  async updateItem(id_produto: number, quantidade: number, cartLogId?: number): Promise<Cart> {
    const res = await fetch(`${API_BASE}/cart/update`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ id_produto, quantidade, cart_log_id: cartLogId }),
    });
    if (!res.ok) {
      throw await cartError(res, "Failed to update item");
    }
    const result = await res.json();
    dispatchCartUpdate();
    return result;
  },

  async removeItem(id_produto: number, cartLogId?: number): Promise<Cart> {
    const query = cartLogId !== undefined ? `?cart_log_id=${cartLogId}` : "";
    const res = await fetch(`${API_BASE}/cart/remove/${id_produto}${query}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw await cartError(res, "Failed to remove item");
    const result = await res.json();
    dispatchCartUpdate();
    return result;
  },

  async mergeGuestCart(items: GuestCartItem[]): Promise<MergeResult> {
    const res = await fetch(`${API_BASE}/cart/merge`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ itens: items }),
    });
    if (!res.ok) throw await cartError(res, "Failed to merge cart");
    return res.json();
  },

  async clearCart(): Promise<void> {
    const res = await fetch(`${API_BASE}/cart/clear`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw await cartError(res, "Failed to clear cart");
    dispatchCartUpdate();
  },
};

/**
 * Unified Cart Service (guest or logged-in)
 */
export const cartService = {
  async getCart(): Promise<Cart> {
    if (getToken()) {
      return apiCartService.getCart();
    }

    const guestItems = guestCartService.get();
    if (guestItems.length === 0) {
      return {
        id_carrinho: null,
        itens: [],
        total: 0,
      };
    }

    try {
      const products = await fetchProducts();
      const productMap = new Map(products.map((product) => [product.id, product]));
      const enrichedItems: CartItem[] = guestItems.flatMap((item) => {
        const product = productMap.get(item.id_produto);

        if (!product) {
          return [];
        }

        const unitPrice = Number(item.customizacao?.preco_unitario_final ?? product.price);

        return [{
          cart_log_id: 0,
          id_produto: item.id_produto,
          id_produto_display: product.id_display,
          nome: product.name,
          preco: unitPrice,
          quantidade: item.quantidade,
          stock: product.stock,
          caminho_imagem: product.image ?? undefined,
          customizacao: normalizeCustomization(item.customizacao),
          subtotal: unitPrice * item.quantidade,
        }];
      });

      return {
        id_carrinho: null,
        itens: enrichedItems,
        total: enrichedItems.reduce((sum, item) => sum + item.subtotal, 0),
      };
    } catch (error) {
      console.error("Error loading guest cart products:", error);
    }

    return {
      id_carrinho: null,
      itens: guestItems,
      total: null,
    };
  },

  async addItem(
    id_produto: number,
    quantidade: number = 1,
    stock?: number,
    customizacao?: ItemCustomization | null,
  ): Promise<Cart | GuestCartItem[]> {
    return getToken()
      ? apiCartService.addItem(id_produto, quantidade, customizacao)
      : guestCartService.addItem(id_produto, quantidade, stock, customizacao);
  },

  async addCustomizedItem(
    body: CustomizedCartItemRequest,
    stock?: number,
  ): Promise<Cart | GuestCartItem[]> {
    const validatedCart = await apiCartService.addCustomizedItem(body);
    if (getToken()) {
      return validatedCart;
    }

    const validatedItem = validatedCart.itens[0] as CartItem | undefined;
    return guestCartService.addItem(
      body.id_produto,
      body.quantidade,
      stock,
      validatedItem?.customizacao ?? null,
    );
  },

  async updateItem(
    id_produto: number,
    quantidade: number,
    stock?: number,
    cartLogId?: number,
    customizacao?: ItemCustomization | null,
  ): Promise<Cart | GuestCartItem[]> {
    return getToken()
      ? apiCartService.updateItem(id_produto, quantidade, cartLogId)
      : guestCartService.updateItem(id_produto, quantidade, stock, customizacao);
  },

  async removeItem(
    id_produto: number,
    cartLogId?: number,
    customizacao?: ItemCustomization | null,
  ): Promise<Cart | GuestCartItem[]> {
    return getToken()
      ? apiCartService.removeItem(id_produto, cartLogId)
      : guestCartService.removeItem(id_produto, customizacao);
  },

  async clearCart(): Promise<void> {
    if (getToken()) {
      await apiCartService.clearCart();
      return;
    }

    guestCartService.clear();
  },

  finishCheckout(): void {
    if (!getToken()) {
      guestCartService.clear();
      return;
    }

    dispatchCartUpdate();
  },

  async mergeGuestCartOnLogin(): Promise<MergeResult> {
    const guestItems = guestCartService.get();
    if (guestItems.length === 0) {
      const currentCart = await apiCartService.getCart();
      return { merged: [], capped: [], skipped: [], carrinho: currentCart };
    }
    const result = await apiCartService.mergeGuestCart(guestItems);
    guestCartService.clear();
    return result;
  },
};

export type { Cart, CartItem, CustomizedCartItemRequest, GuestCartItem, ItemCustomization, MergeResult };
export { isCartItem };
