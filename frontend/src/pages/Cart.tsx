import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import type { Location } from "react-router-dom"
import Navbar from "../components/Navbar"
import "../theme.css"
import "./Cart.css"
import { useCart } from "../hooks"
import { customizationSummary } from "../services"
import type { CartItem, GuestCartItem, ItemCustomization } from "../types/cart"
import { resolveProductImageUrl, useApiImageFallback } from "../utils/imageFallback"
import { formatEuro } from "../utils/money"

function isCartItem(item: CartItem | GuestCartItem): item is CartItem {
  return "nome" in item
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
    customizacao?: ItemCustomization | null,
  ) => {
    try {
      setUpdatingItem(lineKey)
      await removeItem(productId, cartLogId, customizacao)
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
    stock?: number,
    cartLogId?: number,
    customizacao?: ItemCustomization | null,
  ) => {
    if (newQuantity < 1) {
      await handleRemoveItem(productId, lineKey, cartLogId, customizacao)
      return
    }

    try {
      setUpdatingItem(lineKey)
      await updateQuantity(productId, newQuantity, stock, cartLogId, customizacao)
    } catch (err) {
      console.error("Erro ao atualizar quantidade:", err)
    } finally {
      setUpdatingItem(null)
    }
  }

  const items = cart?.itens ?? []
  const total = Number(cart?.total ?? 0)
  const showInitialLoading = loading && !cart

  return (
    <section className={`cart-page${overlay ? " cart-page-overlay" : " site-page"}`}>
      {!overlay && <Navbar />}
      <button className="cart-drawer-backdrop" type="button" aria-label="Fechar carrinho" onClick={closeCart} />

      <aside className="cart-drawer" role="dialog" aria-label="O seu pedido">
        <header className="cart-drawer-header">
          <div>
            <p>Carrinho</p>
            <h1>O seu pedido</h1>
          </div>
          <button type="button" className="cart-close" onClick={closeCart} aria-label="Fechar carrinho">
            x
          </button>
        </header>

        {error && (
          <div className="cart-alert" role="alert">
            <span>{error}</span>
            <button type="button" onClick={clearError}>Ignorar</button>
          </div>
        )}

        <div className="cart-drawer-body">
          {showInitialLoading ? (
            <div className="cart-state">A carregar carrinho...</div>
          ) : items.length === 0 ? (
            <div className="cart-empty">
              <h2>O carrinho está vazio</h2>
              <p>Adicione algo do menu e aparece aqui.</p>
              <Link to="/menu" className="bonefree-button">Ver menu</Link>
            </div>
          ) : (
            <div className="cart-items">
              {items.map((item) => {
                const itemData = isCartItem(item)
                  ? {
                      id: item.id_produto,
                      name: item.nome,
                      price: Number(item.preco),
                      quantity: item.quantidade,
                      image: item.caminho_imagem,
                      stock: item.stock,
                      cartLogId: item.cart_log_id,
                      customizacao: item.customizacao,
                      subtotal: Number(item.subtotal),
                    }
                  : {
                      id: item.id_produto,
                      name: "Produto",
                      price: 0,
                      quantity: item.quantidade,
                      image: null,
                      stock: 99,
                      cartLogId: undefined,
                      customizacao: item.customizacao,
                      subtotal: 0,
                    }
                const customizationLines = customizationSummary(itemData.customizacao)
                const customizationKey = customizationLines.join("|") || "plain"
                const lineKey = `${itemData.id}-${itemData.cartLogId ?? customizationKey}`
                const isUpdating = updatingItem === lineKey
                const canIncrease = itemData.stock <= 0 || itemData.quantity < itemData.stock

                return (
                  <article key={lineKey} className="cart-item">
                    <img
                      src={cartImage(itemData.image)}
                      alt={itemData.name}
                      onError={(event) => {
                        useApiImageFallback(event.currentTarget)
                      }}
                    />

                    <div className="cart-item-main">
                      <div className="cart-item-top">
                        <div>
                          <h2>{itemData.name}</h2>
                          <p>{formatEuro(itemData.price)} cada</p>
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
                        <div className="cart-quantity" aria-label={`Quantidade de ${itemData.name}`}>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(
                              itemData.id,
                              lineKey,
                              itemData.quantity - 1,
                              itemData.stock,
                              itemData.cartLogId,
                              itemData.customizacao,
                            )}
                            disabled={isUpdating}
                            aria-label="Diminuir quantidade"
                          >
                            -
                          </button>
                          <span aria-live="polite">
                            {isUpdating ? (
                              <span className="cart-quantity-loading" aria-label="A atualizar quantidade" />
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
                              itemData.stock,
                              itemData.cartLogId,
                              itemData.customizacao,
                            )}
                            disabled={isUpdating || !canIncrease}
                            aria-label="Aumentar quantidade"
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
                            itemData.customizacao,
                          )}
                          disabled={isUpdating}
                        >
                          Remover
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
              <span>Subtotal</span>
              <strong>{formatEuro(total)}</strong>
            </div>
            <p className="cart-footer-note">Taxas e serviço são confirmados no checkout.</p>
          </div>
          <Link className={`bonefree-button cart-checkout ${items.length === 0 ? "disabled" : ""}`} to="/checkout">
            Fazer pedido
          </Link>
        </footer>
      </aside>
    </section>
  )
}

export default Cart
