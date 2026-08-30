import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CakeSlice, Check, ChevronDown, CupSoda, Flame, Salad, Sandwich, Search, SlidersHorizontal, Soup, X } from "lucide-react";
import { useRef } from "react";

import Navbar from "../components/Navbar";
import { Pagination, ProductCard, ProductCardSkeleton } from "../components/ui";

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
import { useTranslation } from "react-i18next";
import { resolvedLocale } from "../i18n";
import {
  organizationSessionStorage,
  organizationStorage,
} from '../core/storage/organizationStorage'

interface CategoryCount {
  id: number;
  name: string;
  count: number;
}

type SortOption = "default" | "price-asc" | "price-desc" | "name-asc";
type SpecialFilter = "all" | "gluten-free" | "alcohol";

const sortLabelKeys: Record<SortOption, string> = {
  default: "menu.sort.default",
  "price-asc": "menu.sort.priceAsc",
  "price-desc": "menu.sort.priceDesc",
  "name-asc": "menu.sort.nameAsc",
};

const LOYALTY_BANNER_DISMISSED_KEY = "loyalty_banner_dismissed";
const MENU_FILTERS_STORAGE_KEY = "menu_filters";
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
  return typeof value === "string" && value in sortLabelKeys;
}

function isSpecialFilter(value: unknown): value is SpecialFilter {
  return value === "all" || value === "gluten-free" || value === "alcohol";
}

function readSavedMenuFilters(): InitialMenuFilters {
  try {
    const raw = organizationSessionStorage.getItem(MENU_FILTERS_STORAGE_KEY);
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
  return Number(calories).toLocaleString(resolvedLocale(), { maximumFractionDigits: 0 });
}

function clampPrice(value: number, maxPrice: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.min(Math.max(value, 0), maxPrice).toFixed(2));
}

function Menu() {
  const { t } = useTranslation("storefront");
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialFilters] = useState(() => {
    const saved = readSavedMenuFilters();
    const hasUrlParameters = searchParams.toString().length > 0;
    if (!hasUrlParameters) return saved;
    const minPrice = Number(searchParams.get("min_price"));
    const maxPrice = Number(searchParams.get("max_price"));
    const urlSort = searchParams.get("sort")?.replaceAll("_", "-");
    const urlSpecial = searchParams.get("special")?.replace("_", "-");
    return {
      searchTerm: searchParams.get("q") ?? "",
      selectedCategory: searchParams.get("category") ?? "",
      priceRange: [Number.isFinite(minPrice) ? minPrice : 0, Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : 1000] as [number, number],
      sortBy: isSortOption(urlSort) ? urlSort : "default",
      specialFilter: isSpecialFilter(urlSpecial) ? urlSpecial : "all",
      hasSavedFilters: false,
    };
  });
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [perPage, setPerPage] = useState(() => [10, 20, 50, 100].includes(Number(searchParams.get("per_page"))) ? Number(searchParams.get("per_page")) : 20);
  const [total, setTotal] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
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
      return organizationStorage.getItem(LOYALTY_BANNER_DISMISSED_KEY) !== "true";
    } catch {
      return true;
    }
  });

  const navigate = useNavigate();
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const initialFilterEffectRef = useRef(true);
  const hydratingUrlRef = useRef(false);
  const skipUrlWriteRef = useRef(false);
  const lastWrittenSearchRef = useRef(searchParams.toString());
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);

  const dismissLoyaltyBanner = () => {
    setShowLoyaltyBanner(false);
    try {
      organizationStorage.setItem(LOYALTY_BANNER_DISMISSED_KEY, "true");
    } catch {
      // Ignore storage errors; the in-session hide still works.
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    void Promise.all([
      productService.getPage({ page: 1, perPage: 4, sort: "popular" }).then((result) => setPopularProducts(result.items)),
      getPublicLoyaltyCouponSettings().then(setLoyaltyCouponSettings).catch(() => setLoyaltyCouponSettings(defaultLoyaltyCouponSettings)),
    ]);
  }, []);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    void productService.getPage({
      page,
      perPage,
      search: debouncedSearch.trim() || undefined,
      categoryId: Number(selectedCategory) || undefined,
      minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
      maxPrice: priceRange[1] < maxPrice ? priceRange[1] : undefined,
      special: specialFilter === "gluten-free" ? "gluten_free" : specialFilter,
      sort: sortBy.replaceAll("-", "_") as "default" | "price_asc" | "price_desc" | "name_asc",
    }).then((result) => {
      if (requestId !== requestIdRef.current) return;
      setProducts(result.items);
      setTotal(result.total);
      setCatalogTotal(result.facets.totalProducts);
      setTotalPages(result.totalPages);
      setCategories(sortMenuCategories(result.facets.categories.map((facet) => ({ name: facet.name, count: facet.count, id: facet.categoryId }))));
      if (selectedCategory && !Number(selectedCategory)) {
        const legacyCategory = result.facets.categories.find((facet) => facet.name === selectedCategory);
        if (legacyCategory) setSelectedCategory(String(legacyCategory.categoryId));
      }
      const nextMaxPrice = Number(result.facets.maxPrice || 0);
      setMaxPrice(nextMaxPrice);
      if (initialFilterEffectRef.current) {
        setPriceRange((current) => [clampPrice(current[0], nextMaxPrice), initialFilters.hasSavedFilters ? clampPrice(current[1], nextMaxPrice) : nextMaxPrice]);
      }
      if (result.totalPages === 0 && page !== 1) setPage(1);
      else if (result.totalPages > 0 && page > result.totalPages) setPage(result.totalPages);
    }).catch((error) => {
      if (requestId === requestIdRef.current) console.error("Error fetching products:", error);
    }).finally(() => {
      initialFilterEffectRef.current = false;
      if (requestId === requestIdRef.current) setLoading(false);
    });
  }, [debouncedSearch, initialFilters.hasSavedFilters, maxPrice, page, perPage, priceRange, selectedCategory, sortBy, specialFilter]);

  useEffect(() => {
    const currentSearch = searchParams.toString();
    if (currentSearch === lastWrittenSearchRef.current) return;
    lastWrittenSearchRef.current = currentSearch;
    hydratingUrlRef.current = true;
    skipUrlWriteRef.current = true;
    const nextSearch = searchParams.get("q") ?? "";
    const nextSort = searchParams.get("sort")?.replaceAll("_", "-");
    const nextSpecial = searchParams.get("special")?.replace("_", "-");
    const nextMinPrice = Number(searchParams.get("min_price"));
    const nextMaxPrice = Number(searchParams.get("max_price"));
    const nextPerPage = Number(searchParams.get("per_page"));
    setSearchTerm(nextSearch);
    setDebouncedSearch(nextSearch);
    setSelectedCategory(searchParams.get("category") ?? "");
    setPriceRange([
      Number.isFinite(nextMinPrice) ? clampPrice(nextMinPrice, maxPrice) : 0,
      Number.isFinite(nextMaxPrice) && nextMaxPrice > 0 ? clampPrice(nextMaxPrice, maxPrice) : maxPrice,
    ]);
    setSortBy(isSortOption(nextSort) ? nextSort : "default");
    setSpecialFilter(isSpecialFilter(nextSpecial) ? nextSpecial : "all");
    setPage(Math.max(1, Number(searchParams.get("page")) || 1));
    setPerPage([10, 20, 50, 100].includes(nextPerPage) ? nextPerPage : 20);
  }, [maxPrice, searchParams]);

  useEffect(() => {
    if (skipUrlWriteRef.current) {
      skipUrlWriteRef.current = false;
      return;
    }
    const next = new URLSearchParams();
    if (debouncedSearch.trim()) next.set("q", debouncedSearch.trim());
    if (selectedCategory) next.set("category", selectedCategory);
    if (priceRange[0] > 0) next.set("min_price", String(priceRange[0]));
    if (maxPrice > 0 && priceRange[1] < maxPrice) next.set("max_price", String(priceRange[1]));
    if (specialFilter !== "all") next.set("special", specialFilter.replace("-", "_"));
    if (sortBy !== "default") next.set("sort", sortBy.replaceAll("-", "_"));
    if (page !== 1) next.set("page", String(page));
    if (perPage !== 20) next.set("per_page", String(perPage));
    if (next.toString() !== searchParams.toString()) {
      lastWrittenSearchRef.current = next.toString();
      setSearchParams(next, { replace: true });
    }
  }, [debouncedSearch, maxPrice, page, perPage, priceRange, searchParams, selectedCategory, setSearchParams, sortBy, specialFilter]);

  useEffect(() => {
    if (initialFilterEffectRef.current) return;
    if (hydratingUrlRef.current) {
      hydratingUrlRef.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, priceRange, selectedCategory, sortBy, specialFilter]);

  useEffect(() => {
    try {
      organizationSessionStorage.setItem(
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
        setErrorMessage(product.unavailableReason || t("menu.unavailableNamed", { name: product.name }));
        setAddingToCart(null);
        return;
      }

      await cartService.addItem(product.id, 1);
      setSuccessMessage(t("menu.added"));

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : t("menu.addFailed");
      setErrorMessage(errorMsg);
      console.error("Erro ao adicionar ao carrinho:", err);
    } finally {
      setAddingToCart(null);
    }
  };

  const filteredProducts = products;

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
    setPage(1);
  };

  const selectCategory = (category: string) => {
    setSelectedCategory(category);
  };

  return (
    <>
      <Navbar />

      <section className="menu-page mt-5 ">

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
            aria-label={t("menu.close")}
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
            aria-label={t("menu.close")}
            className="toast-close"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
      )}

      <header className="menu-page-hero">
        <div>
          <p className="menu-eyebrow">{t("menu.eyebrow")}</p>
          <h1>{t("menu.title")}</h1>
        </div>
        <p>
          {t("menu.description")}
        </p>
      </header>

      {showLoyaltyBanner && loyaltyCouponSettings.enabled && (
        <section className="menu-loyalty-banner" aria-label={t("menu.loyaltyLabel")}>
          <div>
            <p className="menu-eyebrow">{t("menu.rewards")}</p>
            <h2>{loyaltyCouponHeadline(loyaltyCouponSettings)}</h2>
            <span>{loyaltyCouponDetail(loyaltyCouponSettings)}</span>
          </div>
          <div className="menu-loyalty-actions">
            <Link to="/profile" className="menu-loyalty-link">{t("menu.viewCoupons")}</Link>
            <button
              type="button"
              className="menu-loyalty-dismiss"
              onClick={dismissLoyaltyBanner}
              aria-label={t("menu.hideCoupon")}
            >
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        </section>
      )}

      {popularProducts.length > 0 && (
        <section className="menu-popular-strip" aria-label={t("menu.popularLabel")}>
          <div className="menu-section-heading">
            <div>
              <p className="menu-eyebrow">{t("menu.popular")}</p>
              <h2>{t("menu.houseChoices")}</h2>
            </div>
            <span>{t("menu.featured", { count: popularProducts.length })}</span>
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
            <span>{t("menu.showing")}</span>
              <strong className="fw-bold">{total}</strong>
            <span>{t("menu.dish", { count: total })}</span>
          </div>

        </div>

        <section className="menu-filter-bar" aria-label={t("menu.filtersLabel")}>
          <div className="menu-filter-top">
            <div className="menu-filter-group menu-filter-search">
              <label htmlFor="menu-search " className=" ">
                {t("menu.searchLabel")}
              </label>
              <div className="menu-search-field">
                <Search size={18} />
                <input
                  id="menu-search"
                  type="text"
                  placeholder={t("menu.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    aria-label={t("menu.clearSearch")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="menu-filter-group menu-filter-price">
              <label htmlFor="menu-price">{t("menu.maxPrice")}</label>
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
              <label>{t("menu.filter")}</label>
              <div className="menu-segmented-filter menu-segmented-filter-3" aria-label={t("menu.specialFilter")}>
                <button
                  type="button"
                  className={specialFilter === "all" ? "active" : ""}
                  onClick={() => setSpecialFilter("all")}
                >
                   <span className="fw-bold">{t("menu.all")}</span>
                </button>
                <button
                  type="button"
                  className={specialFilter === "gluten-free" ? "active" : ""}
                  onClick={() => setSpecialFilter("gluten-free")}
                >
                <span className="fw-bold">{t("menu.glutenFree")}</span>
                </button>
                <button
                  type="button"
                  className={specialFilter === "alcohol" ? "active" : ""}
                  onClick={() => setSpecialFilter("alcohol")}
                >
                  <span className="fw-bold">{t("menu.alcohol")}</span>
                </button>
              </div>
            </div>

            <div className={`menu-sort-control ${sortMenuOpen ? "open" : ""}`} ref={sortMenuRef}>
              <SlidersHorizontal size={17} />
              <span>{t("menu.sortLabel")}</span>
              <button
                type="button"
                className="menu-sort-trigger"
                aria-haspopup="listbox"
                aria-expanded={sortMenuOpen}
                onClick={() => setSortMenuOpen((current) => !current)}
              >
                <strong className="fw-bold">{t(sortLabelKeys[sortBy])}</strong>
                <ChevronDown size={16} strokeWidth={2.4} />
              </button>
              {sortMenuOpen && (
                <div className="menu-sort-dropdown" role="listbox" aria-label={t("menu.sortMenu")}>
                  {Object.entries(sortLabelKeys).map(([value, labelKey]) => {
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
                        <span>{t(labelKey)}</span>
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
              {t("menu.reset")}
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
          </div>

          <div className="menu-category-list fw-semibold" aria-label={t("menu.categories")}>
            <button
              type="button"
              className={selectedCategory === "" ? "active" : ""}
              onClick={() => selectCategory("")}
            >

              <span className=" fw-bold">{t("menu.all")}</span>
              <strong className="fw-bold">{catalogTotal}</strong>
            </button>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.id}
                className={selectedCategory === String(cat.id) ? "active f-bold" : ""}
                onClick={() => selectCategory(String(cat.id))}
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
                  <span>{t("menu.noResults")}</span>
                  <h2>{t("menu.noResultsTitle")}</h2>
                  <p>{t("menu.noResultsText")}</p>
                  <button type="button"  onClick={handleResetFilters}>
                    {t("menu.resetFilters")}
                  </button>
                </div>

              )}

            </main>
          </div>
          <Pagination page={page} perPage={perPage} total={total} totalPages={totalPages} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
        </div>
      </div>

      </section>
    </>
  );
}

export default Menu;
