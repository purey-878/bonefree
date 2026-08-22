import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CakeSlice, Check, ChevronDown, CupSoda, Flame, Salad, Sandwich, Search, SlidersHorizontal, Soup, X } from "lucide-react";
import { useRef } from "react";

import Navbar from "../components/Navbar";
import { ProductCard, ProductCardSkeleton } from "../components/ui";
import "./Menu.css";
import "../theme.css";
import { cartService, getPublicLoyaltyCouponSettings, productService } from "../services";
import type { Product } from "../types/product";
import {
  defaultLoyaltyCouponSettings,
  loyaltyCouponDetail,
  loyaltyCouponHeadline,
} from "../utils/loyaltyCoupon";
import { applyApiImageFallback, resolveProductImageUrl } from "../utils/imageFallback";
import { formatEuro } from "../utils/money";
import { primaryProductMediaUrl } from "../utils/productMedia";

interface CategoryCount {
  name: string;
  count: number;
}

type SortOption = "default" | "price-asc" | "price-desc" | "name-asc";
type SpecialFilter = "all" | "gluten-free" | "alcohol";

const sortLabels: Record<SortOption, string> = {
  default: "Destaques",
  "price-asc": "Preço: baixo a alto",
  "price-desc": "Preço: alto a baixo",
  "name-asc": "Nome A-Z",
};

const LOYALTY_BANNER_DISMISSED_KEY = "bonefree-loyalty-banner-dismissed";
const MENU_FILTERS_STORAGE_KEY = "bonefree-menu-filters";
const PRICE_STEP = 0.01;

interface SavedMenuFilters {
  searchTerm: string;
  selectedCategory: string;
  priceRange: [number, number];
  sortBy: SortOption;
  specialFilter: SpecialFilter;
}

interface InitialMenuFilters extends SavedMenuFilters {
  hasSavedFilters: boolean;
}

const defaultMenuFilters: SavedMenuFilters = {
  searchTerm: "",
  selectedCategory: "",
  priceRange: [0, 1000],
  sortBy: "default",
  specialFilter: "all",
};

function isSortOption(value: unknown): value is SortOption {
  return typeof value === "string" && value in sortLabels;
}

function isSpecialFilter(value: unknown): value is SpecialFilter {
  return value === "all" || value === "gluten-free" || value === "alcohol";
}

function readSavedMenuFilters(): InitialMenuFilters {
  try {
    const raw = window.sessionStorage.getItem(MENU_FILTERS_STORAGE_KEY);
    if (!raw) return { ...defaultMenuFilters, hasSavedFilters: false };

    const parsed = JSON.parse(raw) as Partial<SavedMenuFilters>;
    const legacyParsed = parsed as Partial<SavedMenuFilters> & {
      dietaryFilter?: string;
      drinkFilter?: string;
    };
    const range = Array.isArray(parsed.priceRange) ? parsed.priceRange : defaultMenuFilters.priceRange;
    const min = Number(range[0]);
    const max = Number(range[1]);
    const legacySpecialFilter: SpecialFilter =
      legacyParsed.dietaryFilter === "gluten-free"
        ? "gluten-free"
        : legacyParsed.drinkFilter === "alcohol"
          ? "alcohol"
          : "all";

    return {
      searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : "",
      selectedCategory: typeof parsed.selectedCategory === "string" ? parsed.selectedCategory : "",
      priceRange: [
        Number.isFinite(min) ? Math.max(0, min) : 0,
        Number.isFinite(max) ? Math.max(0, max) : defaultMenuFilters.priceRange[1],
      ],
      sortBy: isSortOption(parsed.sortBy) ? parsed.sortBy : "default",
      specialFilter: isSpecialFilter(parsed.specialFilter) ? parsed.specialFilter : legacySpecialFilter,
      hasSavedFilters: true,
    };
  } catch {
    return { ...defaultMenuFilters, hasSavedFilters: false };
  }
}

function hasTag(product: Product, needle: string) {
  return (product.tags ?? []).some((tag) => tag.toLowerCase().includes(needle));
}

function sortMenuCategories(categories: CategoryCount[]) {
  const sorted = [...categories].sort((a, b) => b.count - a.count);
  const entradasIndex = sorted.findIndex((cat) => cat.name.toLowerCase() === "entradas");
  const tacosIndex = sorted.findIndex((cat) => cat.name.toLowerCase() === "tacos");

  if (entradasIndex === -1 || tacosIndex === -1) return sorted;

  const [tacos] = sorted.splice(tacosIndex, 1);
  const nextEntradasIndex = sorted.findIndex((cat) => cat.name.toLowerCase() === "entradas");
  sorted.splice(nextEntradasIndex + 1, 0, tacos);

  return sorted;
}

function formatMenuCalories(calories: number | null | undefined) {
  if (calories == null || !Number.isFinite(Number(calories))) return null;
  return Number(calories).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function clampPrice(value: number, maxPrice: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.min(Math.max(value, 0), maxPrice).toFixed(2));
}

function isDrinkProduct(product: Product) {
  const category = product.category.toLowerCase();
  return (
    category.includes("drink") ||
    category.includes("bebida") ||
    category.includes("beverage") ||
    category.includes("juice") ||
    category.includes("sumo") ||
    category.includes("cocktail") ||
    category.includes("beer") ||
    category.includes("wine")
  );
}

function Menu() {
  const [initialFilters] = useState(readSavedMenuFilters);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(initialFilters.searchTerm);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialFilters.selectedCategory);
  const [priceRange, setPriceRange] = useState<[number, number]>(initialFilters.priceRange);
  const [maxPrice, setMaxPrice] = useState(1000);
  const [sortBy, setSortBy] = useState<SortOption>(initialFilters.sortBy);
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>(initialFilters.specialFilter);
  const [addingToCart, setAddingToCart] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [loyaltyCouponSettings, setLoyaltyCouponSettings] = useState(defaultLoyaltyCouponSettings);
  const [showLoyaltyBanner, setShowLoyaltyBanner] = useState(() => {
    try {
      return window.localStorage.getItem(LOYALTY_BANNER_DISMISSED_KEY) !== "true";
    } catch {
      return true;
    }
  });

  const navigate = useNavigate();
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  const dismissLoyaltyBanner = () => {
    setShowLoyaltyBanner(false);
    try {
      window.localStorage.setItem(LOYALTY_BANNER_DISMISSED_KEY, "true");
    } catch {
      // Ignore storage errors; the in-session hide still works.
    }
  };

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const [productsData, couponSettings] = await Promise.all([
          productService.getAll(),
          getPublicLoyaltyCouponSettings().catch(() => defaultLoyaltyCouponSettings),
        ]);
        setProducts(productsData);
        setLoyaltyCouponSettings(couponSettings);

        const productPrices = productsData
          .map((product) => Number(product.price ?? 0))
          .filter((price) => Number.isFinite(price) && price > 0);
        const nextMaxPrice = productPrices.length
          ? Number(Math.max(...productPrices).toFixed(2))
          : 0;
        setMaxPrice(nextMaxPrice);
        setPriceRange((currentRange) => [
          initialFilters.hasSavedFilters ? clampPrice(currentRange[0], nextMaxPrice) : 0,
          initialFilters.hasSavedFilters ? clampPrice(currentRange[1], nextMaxPrice) : nextMaxPrice,
        ]);

        const categoryMap = new Map<string, number>();
        productsData.forEach((product) => {
          const count = categoryMap.get(product.category) || 0;
          categoryMap.set(product.category, count + 1);
        });

        const categoryCounts = Array.from(categoryMap, ([name, count]) => ({
          name,
          count,
        }));

        setCategories(sortMenuCategories(categoryCounts));
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [initialFilters.hasSavedFilters]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        MENU_FILTERS_STORAGE_KEY,
        JSON.stringify({ searchTerm, selectedCategory, priceRange, sortBy, specialFilter }),
      );
    } catch {
      // Os filtros continuam a funcionar nesta visita se o session storage não estiver disponível.
    }
  }, [priceRange, searchTerm, selectedCategory, sortBy, specialFilter]);

  useEffect(() => {
    if (!sortMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSortMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortMenuOpen]);

  const handleAddToCart = async (product: Product) => {
    try {
      setAddingToCart(product.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      if (!product.available) {
        setErrorMessage(product.unavailableReason || `${product.name} está atualmente indisponível.`);
        setAddingToCart(null);
        return;
      }

      await cartService.addItem(product.id, 1);
      setSuccessMessage("Adicionado ao carrinho");

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Não foi possível adicionar o item ao carrinho";
      setErrorMessage(errorMsg);
      console.error("Erro ao adicionar ao carrinho:", err);
    } finally {
      setAddingToCart(null);
    }
  };

  const filteredProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory =
        !selectedCategory || product.category === selectedCategory;
      const matchesPrice =
        (product.price || 0) >= priceRange[0] &&
        (product.price || 0) <= priceRange[1];
      const matchesSpecial =
        specialFilter === "all" ||
        (specialFilter === "gluten-free"
          ? Boolean(product.glutenFree)
          : isDrinkProduct(product) && Boolean(product.containsAlcohol));
      return matchesSearch && matchesCategory && matchesPrice && matchesSpecial;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "price-asc") return (a.price || 0) - (b.price || 0);
      if (sortBy === "price-desc") return (b.price || 0) - (a.price || 0);
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      const score = (product: Product) =>
        (product.highlighted ? 1000 : 0) +
        (hasTag(product, "popular") ? 600 : 0) +
        (hasTag(product, "new") ? 300 : 0) +
        Number(product.sold ?? 0);
      return score(b) - score(a);
    });
  }, [priceRange, products, searchTerm, selectedCategory, sortBy, specialFilter]);

  const popularProducts = useMemo(() => {
    const sortedProducts = [...products]
      .sort((a, b) => {
        const score = (product: Product) =>
          (product.highlighted ? 1000 : 0) +
          (hasTag(product, "popular") ? 700 : 0) +
          (Number(product.discountPercent ?? 0) > 0 ? 250 : 0) +
          Number(product.sold ?? 0);
        return score(b) - score(a);
      })
    const highlightedProducts = sortedProducts.filter((product) => product.highlighted);
    return highlightedProducts.length > 0 ? highlightedProducts : sortedProducts.slice(0, 4);
  }, [products]);

  const activeFilterCount =
    (searchTerm.trim() ? 1 : 0) +
    (selectedCategory ? 1 : 0) +
    (priceRange[0] > 0 || priceRange[1] < maxPrice ? 1 : 0) +
    (specialFilter !== "all" ? 1 : 0);

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("");
    setPriceRange([0, maxPrice]);
    setSortBy("default");
    setSpecialFilter("all");
  };

  const selectCategory = (category: string) => {
    setSelectedCategory(category);
  };

  return (
    <section className="menu-page mt-5 ">
      <Navbar />

      <div className="menu-floating-food-bg" aria-hidden="true">
        <span className="menu-food-float menu-food-float-salad"><Salad /></span>
        <span className="menu-food-float menu-food-float-soup"><Soup /></span>
        <span className="menu-food-float menu-food-float-sandwich"><Sandwich /></span>
        <span className="menu-food-float menu-food-float-drink"><CupSoda /></span>
        <span className="menu-food-float menu-food-float-cake"><CakeSlice /></span>
        <span className="menu-food-float menu-food-float-salad-2"><Salad /></span>
        <span className="menu-food-float menu-food-float-soup-2"><Soup /></span>
        <span className="menu-food-float menu-food-float-sandwich-2"><Sandwich /></span>
        <span className="menu-food-float menu-food-float-drink-2"><CupSoda /></span>
        <span className="menu-food-float menu-food-float-cake-2"><CakeSlice /></span>
      </div>

      {successMessage && (
        <div className="bonefree-toast" role="status">
          <span className="bonefree-toast-icon" aria-hidden="true">
            <Check size={15} strokeWidth={2.7} />
          </span>
          <span className="bonefree-toast-message">{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            aria-label="Fechar"
            className="toast-close"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bonefree-toast error" role="alert">
          <span className="bonefree-toast-icon" aria-hidden="true">!</span>
          <span className="bonefree-toast-message">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            aria-label="Fechar"
            className="toast-close"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
      )}

      <header className="menu-page-hero">
        <div>
          <p className="menu-eyebrow">Balcão de pedidos</p>
          <h1>Escolha, toque, aproveite.</h1>
        </div>
        <p>
          Veja primeiro os destaques e depois percorra o menu completo com
          categorias rápidas e etiquetas de oferta claras.
        </p>
      </header>

      {showLoyaltyBanner && loyaltyCouponSettings.enabled && (
        <section className="menu-loyalty-banner" aria-label="Cupão de fidelização BONEFREE">
          <div>
            <p className="menu-eyebrow">Recompensas BONEFREE</p>
            <h2>{loyaltyCouponHeadline(loyaltyCouponSettings)}</h2>
            <span>{loyaltyCouponDetail(loyaltyCouponSettings)}</span>
          </div>
          <div className="menu-loyalty-actions">
            <Link to="/profile" className="menu-loyalty-link">Ver cupões</Link>
            <button
              type="button"
              className="menu-loyalty-dismiss"
              onClick={dismissLoyaltyBanner}
              aria-label="Ocultar banner de cupão"
            >
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        </section>
      )}

      {popularProducts.length > 0 && (
        <section className="menu-popular-strip" aria-label="Itens mais populares">
          <div className="menu-section-heading">
            <div>
              <p className="menu-eyebrow">Mais populares</p>
              <h2>Escolhas da casa</h2>
            </div>
            <span>{popularProducts.length} em destaque</span>
          </div>
          <div className="menu-popular-grid">
            {popularProducts.map((product) => (
              <button
                className="menu-popular-card"
                key={product.id}
                type="button"
                onClick={() => navigate(`/product/${product.id}`)}
              >
                <span className="menu-popular-media">
                  <img
                    src={resolveProductImageUrl(primaryProductMediaUrl(product.media, "card"))}
                    alt=""
                    onError={(event) => applyApiImageFallback(event.currentTarget)}
                  />
                </span>
                <span className="menu-popular-content">
                  <span className="menu-popular-category">{product.category}</span>
                  <strong>{product.name}</strong>
                  <span className="menu-popular-meta">
                    {Number(product.discountPercent ?? 0) > 0 && product.originalPrice && (
                      <span className="menu-popular-original-price">
                        {formatEuro(product.originalPrice)}
                      </span>
                    )}
                    <span className="menu-popular-price">{formatEuro(product.price)}</span>
                    {formatMenuCalories(product.totalCalories) && (
                      <span className="menu-popular-calories">
                        <Flame size={13} aria-hidden="true" />
                        {formatMenuCalories(product.totalCalories)} kcal
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="menu-shell">
        <div className="menu-results-summary">
          <div>
            <span>A mostrar</span>
            <strong className="fw-bold">{filteredProducts.length}</strong>
            <span>{filteredProducts.length === 1 ? "prato" : "pratos"}</span>
          </div>

        </div>

        <section className="menu-filter-bar" aria-label="Filtros do menu">
          <div className="menu-filter-top">
            <div className="menu-filter-group menu-filter-search">
              <label htmlFor="menu-search " className=" ">
                Pesquisar no menu
              </label>
              <div className="menu-search-field">
                <Search size={18} />
                <input
                  id="menu-search"
                  type="text"
                  placeholder="Pesquisar pratos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    aria-label="Limpar pesquisa"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="menu-filter-group menu-filter-price">
              <label htmlFor="menu-price">Preço máximo</label>
              <div className="menu-price-control">
                <input
                  id="menu-price"
                  type="range"
                  min="0"
                  max={maxPrice}
                  step={PRICE_STEP}
                  value={clampPrice(priceRange[1], maxPrice)}
                  onChange={(e) =>
                    setPriceRange([priceRange[0], clampPrice(Number(e.target.value), maxPrice)])
                  }
                  className="menu-price-slider"
                />
                <strong className="fw-bold">{formatEuro(priceRange[1])}</strong>
              </div>
            </div>

            <div className="menu-filter-group">
              <label>Filtro</label>
              <div className="menu-segmented-filter menu-segmented-filter-3" aria-label="Filtro especial do menu">
                <button
                  type="button"
                  className={specialFilter === "all" ? "active" : ""}
                  onClick={() => setSpecialFilter("all")}
                >
                   <span className="fw-bold">Todos</span>
                </button>
                <button
                  type="button"
                  className={specialFilter === "gluten-free" ? "active" : ""}
                  onClick={() => setSpecialFilter("gluten-free")}
                >
                <span className="fw-bold">Sem glúten</span>
                </button>
                <button
                  type="button"
                  className={specialFilter === "alcohol" ? "active" : ""}
                  onClick={() => setSpecialFilter("alcohol")}
                >
                  <span className="fw-bold">Álcool</span>
                </button>
              </div>
            </div>

            <div className={`menu-sort-control ${sortMenuOpen ? "open" : ""}`} ref={sortMenuRef}>
              <SlidersHorizontal size={17} />
              <span>Ordenar</span>
              <button
                type="button"
                className="menu-sort-trigger"
                aria-haspopup="listbox"
                aria-expanded={sortMenuOpen}
                onClick={() => setSortMenuOpen((current) => !current)}
              >
                <strong className="fw-bold">{sortLabels[sortBy]}</strong>
                <ChevronDown size={16} strokeWidth={2.4} />
              </button>
              {sortMenuOpen && (
                <div className="menu-sort-dropdown" role="listbox" aria-label="Ordenar menu">
                  {Object.entries(sortLabels).map(([value, label]) => {
                    const option = value as SortOption;
                    const selected = option === sortBy;

                    return (
                      <button
                        key={value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={selected ? "selected fw-bold" : ""}
                        onClick={() => {
                          setSortBy(option);
                          setSortMenuOpen(false);
                        }}
                      >
                        <span>{label}</span>
                        {selected && <Check size={16} strokeWidth={2.4} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              className="menu-reset-button  fw-bold"
              type="button"
              onClick={handleResetFilters}
            >
              Repor
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
          </div>

          <div className="menu-category-list fw-semibold" aria-label="Categorias">
            <button
              type="button"
              className={selectedCategory === "" ? "active" : ""}
              onClick={() => selectCategory("")}
            >

              <span className=" fw-bold">Todos</span>
              <strong className="fw-bold">{products.length}</strong>
            </button>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.name}
                className={selectedCategory === cat.name ? "active f-bold" : ""}
                onClick={() => selectCategory(cat.name)}
              >
                <span className="fw-bold">{cat.name}</span>
                <strong>{cat.count}</strong>
              </button>
            ))}
          </div>
        </section>

        <div className="menu-content-column">
          <div className="menu-layout">
            <main className="menu-products-panel">
              {loading ? (
                <div className="products-grid">
                  {Array.from({ length: 6 }, (_, index) => (
                    <ProductCardSkeleton key={index} />
                  ))}

                </div>
              ) : filteredProducts.length > 0 ? (
                <div className="products-grid">
                  {filteredProducts.map((product, index) => (
                    <div
                      key={product.id}
                      className="menu-card-shell"
                      style={{
                        animationDelay: `${Math.min(index, 9) * 55}ms`,
                      }}
                    >
                      <ProductCard
                        product={product}
                        addingToCart={addingToCart === product.id}
                        currencySymbol="€"
                        onAddToCart={() => handleAddToCart(product)}
                        onSelect={() => navigate(`/product/${product.id}`)}
                        tone="light"
                      />


                    </div>
                  ))}
                </div>
              ) : (
                <div className="menu-empty-state">
                  <span>Sem resultados</span>
                  <h2>Nenhum prato encontrado</h2>
                  <p>Experimente outra category, termo de pesquisa ou intervalo de preço.</p>
                  <button type="button"  onClick={handleResetFilters}>
                    Repor filtros
                  </button>
                </div>

              )}

            </main>
          </div>
        </div>
      </div>

    </section>
  );
}

export default Menu;
