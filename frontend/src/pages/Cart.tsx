import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import type { Location } from "react-router-dom"
import Navbar from "../components/Navbar"
import "../theme.css"
import "./Cart.css"
import { useCart } from "../hooks"
import { customizationSummary, hasUnavailableCartItems } from "../services"
import type { CartItem, GuestCartItem, ItemCustomization } from "../types/cart"
import { applyApiImageFallback, resolveProductImageUrl } from "../utils/imageFallback"
import { formatEuro } from "../utils/money"
import { productMediaUrl } from "../utils/productMedia"
import { useTranslation } from "react-i18next"

function isCartItem(item: CartItem | GuestCartItem): item is CartItem {
  return "name" in item
}

function cartImage(src?: string | null) {
  return resolveProductImageUrl(src)
}

interface CartProps {
  overlay?: boolean
}

type CartRouteState = {
  backgroundLocation?: Location
  from?: string
}

function locationPath(location?: Location) {
  if (!location) return null
  return `${location.pathname}${location.search}${location.hash}`
}

function Cart({ overlay = false }: CartProps) {
  const { t } = useTranslation("storefront")
  const [updatingItem, setUpdatingItem] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as CartRouteState | null
  const { cart, loading, error, clearError, removeItem, updateQuantity } = useCart()

  const closeTarget = routeState?.from ?? locationPath(routeState?.backgroundLocation) ?? "/menu"

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const closeCart = () => {
    navigate(closeTarget, { replace: Boolean(routeState?.from || routeState?.backgroundLocation) })
  }

  const handleRemoveItem = async (
    productId: number,
    lineKey: string,
    cartLogId?: number,
    customization?: ItemCustomization | null,
  ) => {
    try {
      setUpdatingItem(lineKey)
      await removeItem(productId, cartLogId, customization)
    } catch (err) {
      console.error("Erro ao remover item:", err)
    } finally {
      setUpdatingItem(null)
    }
  }

  const handleUpdateQuantity = async (
    productId: number,
    lineKey: string,
    newQuantity: number,
    cartLogId?: number,
    customization?: ItemCustomization | null,
  ) => {
    if (newQuantity < 1) {
      await handleRemoveItem(productId, lineKey, cartLogId, customization)
      return
    }

    try {
      setUpdatingItem(lineKey)
      await updateQuantity(productId, newQuantity, cartLogId, customization)
    } catch (err) {
      console.error("Erro ao atualizar quantidade:", err)
    } finally {
      setUpdatingItem(null)
    }
  }

  const items = cart?.items ?? []
  const total = Number(cart?.total ?? 0)
  const showInitialLoading = loading && !cart
  const hasUnavailableItems = hasUnavailableCartItems(items)

  return (
    <section className={`cart-page${overlay ? " cart-page-overlay" : " site-page"}`}>
      {!overlay && <Navbar />}
      <button className="cart-drawer-backdrop" type="button" aria-label={t("cart.close")} onClick={closeCart} />

      <aside className="cart-drawer" role="dialog" aria-label={t("cart.dialogLabel")}>
        <header className="cart-drawer-header">
          <div>
            <p>{t("cart.eyebrow")}</p>
            <h1>{t("cart.title")}</h1>
          </div>
          <button type="button" className="cart-close" onClick={closeCart} aria-label={t("cart.close")}>
            x
          </button>
        </header>

        {error && (
          <div className="cart-alert" role="alert">
            <span>{error}</span>
            <button type="button" onClick={clearError}>{t("cart.dismissError")}</button>
          </div>
        )}

        <div className="cart-drawer-body">
          {showInitialLoading ? (
            <div className="cart-state">{t("cart.loading")}</div>
          ) : items.length === 0 ? (
            <div className="cart-empty">
              <h2>{t("cart.emptyTitle")}</h2>
              <p>{t("cart.emptyText")}</p>
              <Link to="/menu" className="bonefree-button">{t("cart.viewMenu")}</Link>
            </div>
          ) : (
            <div className="cart-items">
              {items.map((item) => {
                const itemData = isCartItem(item)
                  ? {
                      id: item.productId,
                      name: item.name,
                      price: Number(item.price),
                      quantity: item.quantity,
                      image: productMediaUrl(item.media, "thumb"),
                      available: item.available,
                      unavailableReason: item.unavailableReason,
                      cartLogId: item.cartProductId,
                      customization: item.customization,
                      subtotal: Number(item.subtotal),
                    }
                  : {
                      id: item.productId,
                      name: t("cart.fallbackProduct"),
                      price: 0,
                      quantity: item.quantity,
                      image: null,
                      available: true,
                      unavailableReason: null,
                      cartLogId: undefined,
                      customization: item.customization,
                      subtotal: 0,
                    }
                const customizationLines = customizationSummary(itemData.customization)
                const customizationKey = customizationLines.join("|") || "plain"
                const lineKey = `${itemData.id}-${itemData.cartLogId ?? customizationKey}`
                const isUpdating = updatingItem === lineKey
                const canIncrease = itemData.quantity < 99

                return (
                  <article key={lineKey} className="cart-item">
                    <img
                      src={cartImage(itemData.image)}
                      alt={itemData.name}
                      onError={(event) => {
                        applyApiImageFallback(event.currentTarget)
                      }}
                    />

                    <div className="cart-item-main">
                      <div className="cart-item-top">
                        <div>
                          <h2>{itemData.name}</h2>
                          <p>{formatEuro(itemData.price)} {t("cart.each")}</p>
                          {!itemData.available && (
                            <p className="cart-item-unavailable">
                              {itemData.unavailableReason || t("cart.unavailable")}
                            </p>
                          )}
                          {customizationLines.length > 0 && (
                            <div className="cart-customizations
                            ">
                              {customizationLines.map(line => <span className="rounded-3 "  key={line}>{line}</span>)}
                            </div>
                          )}
                        </div>
                        <strong>{formatEuro(itemData.subtotal)}</strong>
                      </div>

                      <div className="cart-item-actions">
                        <div className="cart-quantity" aria-label={t("cart.quantityOf", { name: itemData.name })}>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(
                              itemData.id,
                              lineKey,
                              itemData.quantity - 1,
                              itemData.cartLogId,
                              itemData.customization,
                            )}
                            disabled={isUpdating}
                            aria-label={t("cart.decrease")}
                          >
                            -
                          </button>
                          <span aria-live="polite">
                            {isUpdating ? (
                              <span className="cart-quantity-loading" aria-label={t("cart.updating")} />
                            ) : (
                              itemData.quantity
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(
                              itemData.id,
                              lineKey,
                              itemData.quantity + 1,
                              itemData.cartLogId,
                              itemData.customization,
                            )}
                            disabled={isUpdating || !canIncrease}
                            aria-label={t("cart.increase")}
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          className="cart-remove"
                          onClick={() => handleRemoveItem(
                            itemData.id,
                            lineKey,
                            itemData.cartLogId,
                            itemData.customization,
                          )}
                          disabled={isUpdating}
                        >
                          {t("cart.remove")}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <footer className="cart-drawer-footer">
          <div className="cart-price-breakdown">
            <div className="cart-total-row">
              <span>{t("cart.subtotal")}</span>
              <strong>{formatEuro(total)}</strong>
            </div>
            <p className="cart-footer-note">{t("cart.fees")}</p>
          </div>
          {hasUnavailableItems && (
            <p className="cart-footer-note">{t("cart.removeUnavailable")}</p>
          )}
          <Link
            aria-disabled={items.length === 0 || hasUnavailableItems}
            className={`bonefree-button cart-checkout ${items.length === 0 || hasUnavailableItems ? "disabled" : ""}`}
            onClick={(event) => {
              if (items.length === 0 || hasUnavailableItems) event.preventDefault()
            }}
            to="/checkout"
          >
            {t("cart.checkout")}
          </Link>
        </footer>
      </aside>
    </section>
  )
}

export default Cart
