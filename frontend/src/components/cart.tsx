import { cartService } from "../services/cartService";

export {
  apiCartService,
  cartService,
  dispatchCartUpdate,
  guestCartService,
  isCartItem,
} from "../services/cartService";

export type {
  Cart as CarrinhoOut,
  CartItem as CarrinhoItemOut,
  GuestCartItem,
  MergeResult as MergeResultado,
} from "../types/cart";

export const getCart = cartService.getCart;
export const addToCart = cartService.addItem;
export const updateCart = cartService.updateItem;
export const removeFromCart = cartService.removeItem;
export const mergeGuestCartOnLogin = cartService.mergeGuestCartOnLogin;
