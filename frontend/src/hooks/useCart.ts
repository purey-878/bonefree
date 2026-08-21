/**
 * useCart Hook
 * Custom hook for managing cart state and operations
 */

import { useState, useEffect, useCallback } from "react";
import { cartService } from "../services";
import type { Cart, ItemCustomization } from "../types/cart";
import { translateUserMessage } from "../utils/messages";

export function useCart() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load cart from API or localStorage
   */
  const loadCart = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const cartData = await cartService.getCart();
      setCart(cartData);
    } catch (err) {
      const errorMsg = translateUserMessage(err instanceof Error ? err.message : "Failed to load cart");
      setError(errorMsg);
      console.error("Error loading cart:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  /**
   * Add item to cart
   */
  const addItem = useCallback(async (
    productId: number,
    quantity: number = 1,
    customization?: ItemCustomization | null,
  ) => {
    try {
      setError(null);
      await cartService.addItem(productId, quantity, customization);
      await loadCart(true);
    } catch (err) {
      const errorMsg = translateUserMessage(err instanceof Error ? err.message : "Failed to add item");
      setError(errorMsg);
      console.error("Error adding to cart:", err);
      throw err;
    }
  }, [loadCart]);

  /**
   * Remove item from cart
   */
  const removeItem = useCallback(async (
    productId: number,
    cartLogId?: number,
    customization?: ItemCustomization | null,
  ) => {
    try {
      setError(null);
      await cartService.removeItem(productId, cartLogId, customization);
      await loadCart(true);
    } catch (err) {
      const errorMsg = translateUserMessage(err instanceof Error ? err.message : "Failed to remove item");
      setError(errorMsg);
      console.error("Error removing item:", err);
      throw err;
    }
  }, [loadCart]);

  /**
   * Update item quantity
   */
  const updateQuantity = useCallback(async (
    productId: number,
    quantity: number,
    cartLogId?: number,
    customization?: ItemCustomization | null,
  ) => {
    if (quantity < 1) {
      await removeItem(productId, cartLogId, customization);
      return;
    }

    try {
      setError(null);
      await cartService.updateItem(productId, quantity, cartLogId, customization);
      await loadCart(true);
    } catch (err) {
      const errorMsg = translateUserMessage(err instanceof Error ? err.message : "Failed to update quantity");
      setError(errorMsg);
      console.error("Error updating quantity:", err);
      throw err;
    }
  }, [loadCart, removeItem]);

  const clearCart = useCallback(async () => {
    try {
      setError(null);
      await cartService.clearCart();
      await loadCart(true);
    } catch (err) {
      const errorMsg = translateUserMessage(err instanceof Error ? err.message : "Failed to clear cart");
      setError(errorMsg);
      console.error("Error clearing cart:", err);
      throw err;
    }
  }, [loadCart]);

  /**
   * Clear all errors
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Subscribe to cart updates
   */
  useEffect(() => {
    loadCart();

    const handleCartUpdate = () => {
      loadCart();
    };

    window.addEventListener('cartUpdated', handleCartUpdate);
    return () => window.removeEventListener('cartUpdated', handleCartUpdate);
  }, [loadCart]);

  return {
    cart,
    loading,
    error,
    loadCart,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    clearError,
    itemCount: cart?.items?.length ?? 0,
    total: cart?.total ?? 0,
  };
}
