import {
  cartAddCustomizedItem,
  cartAddItem,
  cartClearCart,
  cartGetCart,
  cartMergeCart,
  cartRemoveItem,
  cartUpdateItem,
} from '../api/generated';
import type {
  AddItemSchema,
  CustomizedCartItemRequest as CustomizedCartItemDto,
  MergeCartSchema,
} from '../api/generated';
import { apiData, customerApiClient, getStoredToken } from '../api/clients';
import { toDomain, toDto } from '../api/mappers';
import type { Product } from '../types/product';
import type { Cart, CartItem, CustomizedCartItemRequest, GuestCartItem, ItemCustomization, MergeResult } from '../types/cart';
import { productService } from './productService';
import i18n from '../i18n';
import { organizationStorage } from '../core/storage/organizationStorage';

const GUEST_CART_KEY = 'guest_cart';
const LEGACY_CART_KEY = 'cart';

const customizationLabelKeys: Record<string, string> = {
  remove: 'remove', add: 'add', preferences: 'preferences', note: 'note',
};

const customizationValueKeys: Record<string, string> = {
  'extra sauce': 'extraSauce', 'extra vegan cheese': 'extraVeganCheese', 'extra pickles': 'extraPickles',
  'extra jalapenos': 'extraJalapenos', 'extra jalapeños': 'extraJalapenos', 'extra salad': 'extraSalad',
  'extra crispy onions': 'extraCrispyOnions', 'light sauce': 'lightSauce', 'sauce on the side': 'sauceOnSide',
  'extra spicy': 'extraSpicy', 'no spice': 'noSpice', 'cut in half': 'cutInHalf', pickles: 'pickles',
  onion: 'onion', tomato: 'tomato', lettuce: 'lettuce', sauce: 'sauce', slaw: 'slaw', coriander: 'coriander',
  spice: 'spice', berries: 'berries', seeds: 'seeds', syrup: 'syrup',
};

export function dispatchCartUpdate(): void {
  try {
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { timestamp: Date.now() } }));
  } catch (error) {
    console.error('Error dispatching cart update:', error);
  }
}

function isCartItem(item: CartItem | GuestCartItem): item is CartItem {
  return 'name' in item;
}

export function hasUnavailableCartItems(items: Array<CartItem | GuestCartItem>): boolean {
  return items.some((item) => isCartItem(item) && !item.available);
}

export function emptyCustomization(): ItemCustomization {
  return {
    remove: [], add: [], preferences: [], note: null,
    removedIngredients: [], extras: [], substitutions: [], finalUnitPrice: null,
  };
}

function uniqueList(values: string[] = []): string[] {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueNumbers(values: number[] = []): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0))).sort((a, b) => a - b);
}

export function normalizeCustomization(customization?: ItemCustomization | null): ItemCustomization | null {
  if (!customization) return null;
  const normalized: ItemCustomization = {
    remove: uniqueList(customization.remove ?? []),
    add: uniqueList(customization.add ?? []),
    preferences: uniqueList(customization.preferences ?? []),
    note: customization.note?.trim() || null,
    removedIngredients: uniqueNumbers(customization.removedIngredients),
    extras: (customization.extras ?? [])
      .filter((item) => item.optionId > 0 && item.quantity > 0)
      .map((item) => ({ optionId: item.optionId, quantity: item.quantity })),
    substitutions: (customization.substitutions ?? [])
      .filter((item) => item.originalIngredientId > 0 && item.newIngredientId > 0)
      .map((item) => ({
        originalIngredientId: item.originalIngredientId,
        newIngredientId: item.newIngredientId,
      })),
    finalUnitPrice: customization.finalUnitPrice ?? null,
  };
  return hasCustomization(normalized) ? normalized : null;
}

export function hasCustomization(customization?: ItemCustomization | null): boolean {
  if (!customization) return false;
  return Boolean(
    customization.remove?.length || customization.add?.length || customization.preferences?.length
    || customization.note?.trim() || customization.removedIngredients?.length
    || customization.extras?.length || customization.substitutions?.length,
  );
}

export function customizationSummary(customization?: ItemCustomization | null): string[] {
  const normalized = normalizeCustomization(customization);
  if (!normalized) return [];
  const translated = (values: string[]) => values
    .map((value) => {
      const key = customizationValueKeys[value.trim().toLowerCase()];
      return key ? i18n.t(`customization.values.${key}`, { ns: 'storefront' }) : value;
    }).join(', ');
  const label = (key: keyof typeof customizationLabelKeys) => i18n.t(`customization.labels.${customizationLabelKeys[key]}`, { ns: 'storefront' });
  const lines: string[] = [];
  if (normalized.remove.length) lines.push(`${label('remove')}: ${translated(normalized.remove)}`);
  if (normalized.add.length) lines.push(`${label('add')}: ${translated(normalized.add)}`);
  if (normalized.preferences.length) lines.push(`${label('preferences')}: ${translated(normalized.preferences)}`);
  if (normalized.note) lines.push(`${label('note')}: ${normalized.note}`);
  return lines;
}

function customizationKey(customization?: ItemCustomization | null): string {
  const normalized = normalizeCustomization(customization);
  return normalized ? JSON.stringify(normalized) : '';
}

function normalizeCart(value: unknown): Cart {
  const cart = toDomain<Cart>(value);
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const normalizedItems = items.map((item) => {
    if (!isCartItem(item)) return item;
    return {
      ...item,
      price: Number(item.price),
      subtotal: Number(item.subtotal),
      customization: normalizeCustomization(item.customization),
    };
  });
  const total = cart?.total == null
    ? normalizedItems.reduce((sum, item) => sum + (isCartItem(item) ? item.subtotal : 0), 0)
    : Number(cart.total);
  return { cartId: cart?.cartId ?? null, items: normalizedItems, total };
}

function readGuestItem(value: unknown): GuestCartItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const productId = Number(record.productId ?? record.id_produto);
  const quantity = Math.min(99, Number(record.quantity ?? record.quantidade));
  if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0) return null;
  const customization = (record.customization ?? record.personalizacao) as ItemCustomization | null | undefined;
  return { productId, quantity, customization: normalizeCustomization(customization) };
}

export const guestCartService = {
  get(): GuestCartItem[] {
    try {
      const parsed = JSON.parse(organizationStorage.getItem(GUEST_CART_KEY) || organizationStorage.getItem(LEGACY_CART_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(readGuestItem).filter((item): item is GuestCartItem => item !== null) : [];
    } catch (error) {
      console.error('Error reading guest cart:', error);
      return [];
    }
  },

  save(items: GuestCartItem[]): void {
    try {
      organizationStorage.setItem(GUEST_CART_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (error) {
      console.error('Error saving guest cart:', error);
    } finally {
      dispatchCartUpdate();
    }
  },

  clear(): void {
    try {
      organizationStorage.removeItem(GUEST_CART_KEY);
      organizationStorage.removeItem(LEGACY_CART_KEY);
    } finally {
      dispatchCartUpdate();
    }
  },

  addItem(productId: number, quantity = 1, customization?: ItemCustomization | null): GuestCartItem[] {
    const cart = this.get();
    const normalizedCustomization = normalizeCustomization(customization);
    const targetKey = customizationKey(normalizedCustomization);
    const existing = cart.find((item) => item.productId === productId && customizationKey(item.customization) === targetKey);
    const safeQuantity = Math.min(99, Math.max(1, Number(quantity) || 1));
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + safeQuantity);
    } else {
      cart.push({
        productId,
        quantity: safeQuantity,
        customization: normalizedCustomization,
      });
    }
    this.save(cart);
    return cart;
  },

  updateItem(productId: number, quantity: number, customization?: ItemCustomization | null): GuestCartItem[] {
    let cart = this.get();
    const targetKey = customizationKey(customization);
    if (quantity <= 0) {
      cart = cart.filter((item) => !(item.productId === productId && customizationKey(item.customization) === targetKey));
    } else {
      const item = cart.find((entry) => entry.productId === productId && customizationKey(entry.customization) === targetKey);
      if (item) item.quantity = Math.min(99, quantity);
    }
    this.save(cart);
    return cart;
  },

  removeItem(productId: number, customization?: ItemCustomization | null): GuestCartItem[] {
    const targetKey = customizationKey(customization);
    const cart = this.get().filter((item) => !(item.productId === productId && customizationKey(item.customization) === targetKey));
    this.save(cart);
    return cart;
  },
};

export const apiCartService = {
  async getCart(): Promise<Cart> {
    return normalizeCart(await apiData(cartGetCart({ client: customerApiClient, throwOnError: true })));
  },

  async addItem(productId: number, quantity = 1, customization?: ItemCustomization | null): Promise<Cart> {
    const body: AddItemSchema = toDto({ productId, quantity, customization: normalizeCustomization(customization) });
    const cart = normalizeCart(await apiData(cartAddItem({ body, client: customerApiClient, throwOnError: true })));
    dispatchCartUpdate();
    return cart;
  },

  async addCustomizedItem(body: CustomizedCartItemRequest): Promise<Cart> {
    const dto = toDto<CustomizedCartItemDto>(body);
    const cart = normalizeCart(await apiData(cartAddCustomizedItem({ body: dto, client: customerApiClient, throwOnError: true })));
    dispatchCartUpdate();
    return cart;
  },

  async updateItem(productId: number, quantity: number, cartProductId?: number): Promise<Cart> {
    const cart = normalizeCart(await apiData(cartUpdateItem({
      body: { product_id: productId, quantity, cart_product_id: cartProductId },
      client: customerApiClient,
      throwOnError: true,
    })));
    dispatchCartUpdate();
    return cart;
  },

  async removeItem(productId: number, cartProductId?: number): Promise<Cart> {
    const cart = normalizeCart(await apiData(cartRemoveItem({
      path: { product_id: String(productId) },
      query: { cart_product_id: cartProductId },
      client: customerApiClient,
      throwOnError: true,
    })));
    dispatchCartUpdate();
    return cart;
  },

  async mergeGuestCart(items: GuestCartItem[]): Promise<MergeResult> {
    const body = toDto<MergeCartSchema>({ items });
    return toDomain<MergeResult>(await apiData(cartMergeCart({ body, client: customerApiClient, throwOnError: true })));
  },

  async clearCart(): Promise<void> {
    await cartClearCart({ client: customerApiClient, throwOnError: true });
    dispatchCartUpdate();
  },
};

export const cartService = {
  async getCart(): Promise<Cart> {
    if (getStoredToken('token')) return apiCartService.getCart();
    const guestItems = guestCartService.get();
    if (!guestItems.length) return { cartId: null, items: [], total: 0 };
    try {
      const products = await productService.getAll();
      const productMap = new Map<number, Product>(products.map((product) => [product.id, product]));
      const items: CartItem[] = guestItems.flatMap((item) => {
        const product = productMap.get(item.productId);
        if (!product) return [];
        const unitPrice = Number(item.customization?.finalUnitPrice ?? product.price ?? 0);
        return [{
          cartProductId: 0,
          productId: item.productId,
          productDisplayId: product.idDisplay,
          name: product.name,
          price: unitPrice,
          quantity: item.quantity,
          available: product.available,
          unavailableReason: product.unavailableReason,
          media: product.media.find((media) => media.isPrimary) ?? product.media[0] ?? null,
          customization: normalizeCustomization(item.customization),
          subtotal: unitPrice * item.quantity,
        }];
      });
      return { cartId: null, items, total: items.reduce((sum, item) => sum + item.subtotal, 0) };
    } catch (error) {
      console.error('Error loading guest cart products:', error);
      return { cartId: null, items: guestItems, total: null };
    }
  },

  async addItem(productId: number, quantity = 1, customization?: ItemCustomization | null) {
    return getStoredToken('token')
      ? apiCartService.addItem(productId, quantity, customization)
      : guestCartService.addItem(productId, quantity, customization);
  },

  async addCustomizedItem(body: CustomizedCartItemRequest) {
    const validatedCart = await apiCartService.addCustomizedItem(body);
    if (getStoredToken('token')) return validatedCart;
    const validatedItem = validatedCart.items[0] as CartItem | undefined;
    return guestCartService.addItem(body.productId, body.quantity, validatedItem?.customization);
  },

  async updateItem(productId: number, quantity: number, cartProductId?: number, customization?: ItemCustomization | null) {
    return getStoredToken('token')
      ? apiCartService.updateItem(productId, quantity, cartProductId)
      : guestCartService.updateItem(productId, quantity, customization);
  },

  async removeItem(productId: number, cartProductId?: number, customization?: ItemCustomization | null) {
    return getStoredToken('token')
      ? apiCartService.removeItem(productId, cartProductId)
      : guestCartService.removeItem(productId, customization);
  },

  async clearCart(): Promise<void> {
    if (getStoredToken('token')) await apiCartService.clearCart();
    else guestCartService.clear();
  },

  finishCheckout(): void {
    if (!getStoredToken('token')) guestCartService.clear();
    else dispatchCartUpdate();
  },

  async mergeGuestCartOnLogin(): Promise<MergeResult> {
    const items = guestCartService.get();
    if (!items.length) return { merged: [], capped: [], skipped: [], cart: await apiCartService.getCart() };
    const result = await apiCartService.mergeGuestCart(items);
    guestCartService.clear();
    return result;
  },
};

export type { Cart, CartItem, CustomizedCartItemRequest, GuestCartItem, ItemCustomization, MergeResult };
export { isCartItem };
