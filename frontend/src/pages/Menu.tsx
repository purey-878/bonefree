import { restoreMenuPriceRange } from "../utils/menuFilters";
import { resolvedLocale } from "../i18n";
import { CakeSlice, Check, ChevronDown, CupSoda, Salad, Sandwich, Search, SlidersHorizontal, Soup, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";

import { useTranslation } from "react-i18next";
import Navbar from "../components/Navbar";
import { ProductCard, ProductCardSkeleton } from "../components/ui";
import { useMenuFeed } from "../hooks/useMenuFeed";
import "../theme.css";
import { formatEuro } from "../utils/money";
import "../i18n/mealFinder"
import "./Menu.css";

interface CategoryCount {
  id: number;
  name: string;
  count: number;
}

type SortOption = "default" | "price-asc" | "price-desc" | "name-asc" | "calories-asc" | "calories-desc";
type SpecialFilter = "all" | "gluten-free" | "alcohol";

const sortLabelKeys: Record<SortOption, string> = {
  default: "menu.sort.default",
  "price-asc": "menu.sort.priceAsc",
  "price-desc": "menu.sort.priceDesc",
  "name-asc": "menu.sort.nameAsc",
  "calories-asc": "menu.sort.caloriesAsc",
  "calories-desc": "menu.sort.caloriesDesc",
};

const MENU_FILTERS_STORAGE_KEY = "bonefree-menu-filters";
const PRICE_STEP = 0.01;

interface SavedMenuFilters {
  searchTerm: string;
  selectedCategory: string;
  priceRange: [number, number];
  catalogMaxPrice?: number;
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
    const raw = window.sessionStorage.getItem(MENU_FILTERS_STORAGE_KEY);
    if (!raw) return { ...defaultMenuFilters, hasSavedFilters: false };

    const parsed = JSON.parse(raw) as Partial<SavedMenuFilters>;
    const legacyParsed = parsed as Partial<SavedMenuFilters> & {
      dietaryFilter?: string;
      drinkFilter?: string;
    };
    const legacySpecialFilter: SpecialFilter =
      legacyParsed.dietaryFilter === "gluten-free"
        ? "gluten-free"
        : legacyParsed.drinkFilter === "alcohol"
          ? "alcohol"
          : "all";

    return {
      catalogMaxPrice: typeof parsed.catalogMaxPrice === "number" ? parsed.catalogMaxPrice : undefined,
      searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : "",
      selectedCategory: typeof parsed.selectedCategory === "string" ? parsed.selectedCategory : "",
      priceRange: restoreMenuPriceRange(parsed.priceRange, parsed.catalogMaxPrice),
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

function clampPrice(value: number, maxPrice: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.min(Math.max(value, 0), maxPrice).toFixed(2));
}

function Menu() {
  const { t } = useTranslation("storefront");
  const locale = resolvedLocale();
  const navigationType = useNavigationType();
  const [pageLocale, setPageLocale] = useState(locale);
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
      catalogMaxPrice: undefined,
      searchTerm: searchParams.get("q") ?? "",
      selectedCategory: searchParams.get("category") ?? "",
      priceRange: [Number.isFinite(minPrice) ? minPrice : 0, Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : 1000] as [number, number],
      sortBy: isSortOption(urlSort) ? urlSort : "default",
      specialFilter: isSpecialFilter(urlSpecial) ? urlSpecial : "all",
      hasSavedFilters: false,
    };
  });
  const [startPage, setStartPage] = useState(() => Math.max(1, Math.floor(Number(searchParams.get("page")) || 1)));
  const [perPage, setPerPage] = useState(() => [10, 16, 20, 50, 100].includes(Number(searchParams.get("per_page"))) ? Number(searchParams.get("per_page")) : 16);
  const [searchTerm, setSearchTerm] = useState(initialFilters.searchTerm);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialFilters.selectedCategory);
  const [priceRange, setPriceRange] = useState<[number, number]>(initialFilters.priceRange);
  const [maxPrice, setMaxPrice] = useState(initialFilters.catalogMaxPrice ?? 1000);
  const [sortBy, setSortBy] = useState<SortOption>(initialFilters.sortBy);
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>(initialFilters.specialFilter);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const navigate = useNavigate();
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryAnchorRef = useRef<HTMLDivElement | null>(null);
  const [categoriesPinned, setCategoriesPinned] = useState(false);
  const initialFilterEffectRef = useRef(true);
  const skipUrlWriteRef = useRef(false);
  const lastWrittenSearchRef = useRef(searchParams.toString());
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);

  useEffect(() => {
    if (!categoryAnchorRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setCategoriesPinned(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(categoryAnchorRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (pageLocale === locale) return;
    // Locale changes restart at page one, including old bookmarked page URLs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStartPage(1);
    setPageLocale(locale);
  }, [locale, pageLocale]);

  const { items: products, result, loading, error: errorMessage, hasMore, next: loadMore, sentinel: setSentinel } = useMenuFeed({
    page: pageLocale === locale ? startPage : 1, perPage, locale,
    search: debouncedSearch.trim() || undefined,
    categoryId: Number(selectedCategory) || undefined,
    minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
    maxPrice: priceRange[1] < maxPrice ? priceRange[1] : undefined,
    special: specialFilter === "gluten-free" ? "gluten_free" : specialFilter,
    sort: sortBy.replaceAll("-", "_") as "default" | "price_asc" | "price_desc" | "name_asc" | "calories_asc" | "calories_desc",
  }, navigationType === "POP");
  const total = result?.total ?? 0;
  const catalogTotal = result?.facets.totalProducts ?? 0;
  const categories = sortMenuCategories(result?.facets.categories.map(facet => ({ name: facet.name, count: facet.count, id: facet.categoryId })) ?? []);

  useEffect(() => {
    if (!result) return;
    const nextMaxPrice = Number(result.facets.maxPrice || 0);
    // Facets are server-derived; avoid changing equivalent filter values.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaxPrice(nextMaxPrice);
    if (initialFilterEffectRef.current) {
      initialFilterEffectRef.current = false;
      setPriceRange(current => {
        const next: [number, number] = [clampPrice(current[0], nextMaxPrice), clampPrice(current[1], nextMaxPrice)];
        return current[0] === next[0] && current[1] === next[1] ? current : next;
      });
    }
    if (selectedCategory && !Number(selectedCategory)) {
      const legacy = result.facets.categories.find(facet => facet.name === selectedCategory);
      if (legacy) setSelectedCategory(String(legacy.categoryId));
    }
  }, [result, selectedCategory]);

  useEffect(() => {
    const currentSearch = searchParams.toString();
    if (currentSearch === lastWrittenSearchRef.current) return;
    lastWrittenSearchRef.current = currentSearch;
    skipUrlWriteRef.current = true;
    const nextSearch = searchParams.get("q") ?? "";
    const nextSort = searchParams.get("sort")?.replaceAll("_", "-");
    const nextSpecial = searchParams.get("special")?.replace("_", "-");
    const nextMinPrice = Number(searchParams.get("min_price"));
    const nextMaxPrice = Number(searchParams.get("max_price"));
    const nextPerPage = Number(searchParams.get("per_page"));
    // Browser back/forward changes are an external source of filter state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchTerm(nextSearch);
    setDebouncedSearch(nextSearch);
    setSelectedCategory(searchParams.get("category") ?? "");
    setPriceRange([
      Number.isFinite(nextMinPrice) ? clampPrice(nextMinPrice, maxPrice) : 0,
      Number.isFinite(nextMaxPrice) && nextMaxPrice > 0 ? clampPrice(nextMaxPrice, maxPrice) : maxPrice,
    ]);
    setSortBy(isSortOption(nextSort) ? nextSort : "default");
    setSpecialFilter(isSpecialFilter(nextSpecial) ? nextSpecial : "all");
    setStartPage(Math.max(1, Math.floor(Number(searchParams.get("page")) || 1)));
    setPerPage([10, 16, 20, 50, 100].includes(nextPerPage) ? nextPerPage : 16);
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
    if (startPage !== 1) next.set("page", String(startPage));
    if (perPage !== 16) next.set("per_page", String(perPage));
    if (next.toString() !== searchParams.toString()) {
      lastWrittenSearchRef.current = next.toString();
      setSearchParams(next, { replace: true });
    }
  }, [debouncedSearch, maxPrice, startPage, perPage, priceRange, searchParams, selectedCategory, setSearchParams, sortBy, specialFilter]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        MENU_FILTERS_STORAGE_KEY,
        JSON.stringify({ searchTerm, selectedCategory, priceRange, catalogMaxPrice: maxPrice, sortBy, specialFilter }),
      );
    } catch {
      // Os filtros continuam a funcionar nesta visita se o session storage não estiver disponível.
    }
  }, [maxPrice, priceRange, searchTerm, selectedCategory, sortBy, specialFilter]);

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
    setStartPage(1);
  };

  const selectCategory = (category: string) => {
    setSelectedCategory(category);
    setStartPage(1);
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
          <span className="menu-food-float menu-food-float-salad-3"><Salad /></span>
          <span className="menu-food-float menu-food-float-soup-3"><Soup /></span>
          <span className="menu-food-float menu-food-float-sandwich-3"><Sandwich /></span>
          <span className="menu-food-float menu-food-float-drink-3"><CupSoda /></span>
        </div>

        <header className="menu-page-hero">
          <div>
            <p className="menu-eyebrow">{t("menu.eyebrow")}</p>
            <h1><span className="menu-title-desktop">{t("menu.title")}</span><span className="menu-title-mobile">{t("menu.eyebrow")}</span></h1>
            <p className="menu-mobile-description">{t("menu.shortDescription")}</p>
            <Link to="/reservations" className="menu-reservation-link">{t("home.reserveTable")}</Link>
          </div>
          <Link to="/meal-finder" className="menu-paulo-callout">
            <svg className="menu-paulo-character" viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
              <path d="M43 20C42 10 49 5 59 7C58 17 51 22 43 20Z" fill="#7baf4b" stroke="#164c39" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M39 22C34 13 28 13 24 14" stroke="#164c39" strokeWidth="3" strokeLinecap="round" />
              <path d="M66 44C66 60 54 70 38 69L23 75L25 64C15 59 11 51 12 41C13 26 25 19 41 20C57 21 67 30 66 44Z" fill="#fff8df" stroke="#164c39" strokeWidth="3" strokeLinejoin="round" />
              <path d="M29 39V43M48 39V43" stroke="#164c39" strokeWidth="4" strokeLinecap="round" />
              <path d="M30 51C35 58 44 58 49 50" stroke="#164c39" strokeWidth="3" strokeLinecap="round" />
              <circle cx="23" cy="48" r="4" fill="#e7aa7b" opacity=".65" /><circle cx="55" cy="48" r="4" fill="#e7aa7b" opacity=".65" />
              <path d="M70 19V27M66 23H74" stroke="#164c39" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span className="menu-paulo-prompt">{t("menu.finderPrompt")}</span>
            <span className="menu-paulo-action">{t("menu.finderAction")} <span aria-hidden="true">↗</span></span>
          </Link>
        </header>

        <div className="menu-shell">
          <div className="menu-results-summary">
            <div>
              <span>{t("menu.showing")}</span>
              <strong className="fw-bold">{total}</strong>
              <span>{t("menu.dish", { count: total })}</span>
            </div>

          </div>

          <div className="menu-sidebar">
          <section className="menu-filter-bar" aria-label={t("menu.filtersLabel")}>
            <div className="menu-filter-top">
              <div className="menu-filter-group menu-filter-search">
                <label htmlFor="menu-search" className="menu-search-label">
                  {t("menu.searchLabel")}
                </label>
                <div className="menu-search-field">
                  <Search size={18} />
                  <input
                    id="menu-search"
                    type="text"
                    placeholder={t("menu.searchPlaceholder")}
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setStartPage(1); }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => { setSearchTerm(""); setStartPage(1); }}
                      aria-label={t("menu.clearSearch")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              <button
                className="menu-mobile-filter-toggle"
                type="button"
                aria-label={t("menu.filtersLabel")}
                aria-expanded={mobileFiltersOpen}
                aria-controls="menu-advanced-filters"
                onClick={() => {
                  setMobileFiltersOpen((open) => !open);
                  setSortMenuOpen(false);
                }}
              >
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span>{t("menu.filter")}</span>
                {activeFilterCount > 0 && <strong>{activeFilterCount}</strong>}
              </button>

              <div id="menu-advanced-filters" className={`menu-advanced-filters ${mobileFiltersOpen ? "is-open" : ""}`}>
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
                        { setPriceRange([priceRange[0], clampPrice(Number(e.target.value), maxPrice)]); setStartPage(1); }
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
                      onClick={() => { setSpecialFilter("all"); setStartPage(1); }}
                    >
                      <span className="fw-bold">{t("menu.all")}</span>
                    </button>
                    <button
                      type="button"
                      className={specialFilter === "gluten-free" ? "active" : ""}
                      onClick={() => { setSpecialFilter("gluten-free"); setStartPage(1); }}
                    >
                      <span className="fw-bold">{t("menu.glutenFree")}</span>
                    </button>
                    <button
                      type="button"
                      className={specialFilter === "alcohol" ? "active" : ""}
                      onClick={() => { setSpecialFilter("alcohol"); setStartPage(1); }}
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
                              setStartPage(1);
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
            </div>

          </section>

            <div className="menu-category-anchor" ref={categoryAnchorRef} aria-hidden="true" />
            <div className={`menu-category-list fw-semibold${categoriesPinned ? " is-pinned" : ""}`} aria-label={t("menu.categories")}>
              <button
                type="button"
                aria-pressed={selectedCategory === ""}
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
                  aria-pressed={selectedCategory === String(cat.id)}
                  className={selectedCategory === String(cat.id) ? "active f-bold" : ""}
                  onClick={() => selectCategory(String(cat.id))}
                >
                  <span className="fw-bold">{cat.name}</span>
                  <strong>{cat.count}</strong>
                </button>
              ))}
            </div>

          </div>
          <div className="menu-content-column">
            <div className="menu-layout">
              <main className="menu-products-panel">
                {!result && !errorMessage ? (
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
                          className="menu-product-card"
                          product={product}
                          currencySymbol="€"
                          onSelect={() => navigate(`/product/${product.id}`)}
                          tone="light"
                        />

                      </div>
                    ))}
                  </div>
                ) : !errorMessage && result ? (
                  <div className="menu-empty-state">
                    <span>{t("menu.noResults")}</span>
                    <h2>{t("menu.noResultsTitle")}</h2>
                    <p>{t("menu.noResultsText")}</p>
                    <button type="button" onClick={handleResetFilters}>
                      {t("menu.resetFilters")}
                    </button>
                  </div>

                ) : null}

              </main>
            </div>
            <div className="menu-feed-status" ref={setSentinel}>
              <p role="status" aria-live="polite" aria-atomic="true">
                {loading ? t("menu.loadingMore") : result && total > 0 ? t(hasMore ? "menu.loadedCount" : "menu.endOfMenu", { count: products.length, total }) : ""}
              </p>
              {errorMessage ? <div role="alert">
                <p>{t("menu.loadError")}</p>
                <button type="button" onClick={loadMore}>{t("menu.retry")}</button>
              </div> : !loading && hasMore && result ? <button type="button" onClick={loadMore}>{t("menu.loadMore")}</button> : null}
            </div>
          </div>
        </div>

      </section>
    </>
  );
}

export default Menu;
