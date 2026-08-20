import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";

import { cartService, productService } from "../services";
import type {
  CustomizationIngredient,
  CustomizationOption,
  ItemCustomization,
  ProductCustomizationDetails,
} from "../types/cart";
import type { Product } from "../types/product";
import { Button, IconButton, Textarea } from "./ui";
import CustomSelect from "./ui/CustomSelect";
import { formatEuro } from "../utils/money";
import "./CustomizeProductModal.css";

interface CustomizeProductModalProps {
  initialCustomization?: ItemCustomization | null;
  initialQuantity?: number;
  product: Product;
  submitLabel?: string;
  onClose: () => void;
  onAdded: (productName: string) => void;
  onError: (message: string) => void;
}

type ExtraQuantities = Record<number, number>;
type SelectedSubstitutions = Record<number, number>;

const addSurcharge = 1;
const substitutionTypes = ["substitute_sauce", "substitute_side"] as const;

function optionPrice(option: CustomizationOption): number {
  return Number(option.extraPrice ?? 0);
}

function optionLabel(option: CustomizationOption): string {
  return option.name.replace(/^Extra\s+/i, "").replace(/^Substituir por\s+/i, "");
}

function substitutionOptionsFor(
  ingredient: CustomizationIngredient,
  details: ProductCustomizationDetails,
) {
  if (ingredient.type === "sauce") return details.options.substitute_sauce ?? [];
  if (ingredient.type === "side") return details.options.substitute_side ?? [];
  return substitutionTypes.flatMap((type) => details.options[type] ?? []);
}

export function CustomizeProductModal({
  initialCustomization,
  initialQuantity = 1,
  product,
  submitLabel = "Adicionar ao carrinho",
  onAdded,
  onClose,
  onError,
}: CustomizeProductModalProps) {
  const [details, setDetails] = useState<ProductCustomizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [extras, setExtras] = useState<ExtraQuantities>({});
  const [substitutions, setSubstitutions] = useState<SelectedSubstitutions>({});
  const [notes, setNotes] = useState(initialCustomization?.note ?? "");
  const [quantity, setQuantity] = useState(Math.max(1, initialQuantity));

  useEffect(() => {
    let active = true;

    productService.getCustomizationDetails(product.id)
      .then((data) => {
        if (!active) return;
        setDetails(data);

        const removableIngredientIds = new Set(
          data.ingredients
            .filter((ingredient) => ingredient.removable && ingredient.type === "normal")
            .map((ingredient) => ingredient.ingredientId),
        );
        setRemoved(new Set(
          (initialCustomization?.removedIngredients ?? [])
            .filter((ingredientId) => removableIngredientIds.has(ingredientId)),
        ));
        setExtras(Object.fromEntries(
          (initialCustomization?.extras ?? [])
            .filter((item) => item.optionId > 0 && item.quantity > 0)
            .map((item) => [item.optionId, item.quantity]),
        ));
        setSubstitutions(Object.fromEntries(
          (initialCustomization?.substitutions ?? []).flatMap((item) => {
            const option = substitutionTypes
              .flatMap((type) => data.options[type] ?? [])
              .find((candidate) => candidate.ingredientId === item.newIngredientId);

            return option ? [[item.originalIngredientId, option.optionId]] : [];
          }),
        ));
        setNotes(initialCustomization?.note ?? "");
        setQuantity(Math.max(1, initialQuantity));
      })
      .catch((error) => {
        console.error(error);
        onError("Não foi possível carregar as opções de personalização.");
        onClose();
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialCustomization, initialQuantity, onClose, onError, product.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const extraOptions = useMemo(
    () => details ? [...(details.options.extra ?? []), ...(details.options.add ?? [])] : [],
    [details],
  );

  const total = useMemo(() => {
    if (!details) return Number(product.price ?? 0) * quantity;

    const extrasTotal = extraOptions.reduce((sum, option) => {
      return sum + (extras[option.optionId] ?? 0) * addSurcharge;
    }, 0);

    const substitutionsTotal = Object.values(substitutions).reduce((sum, optionId) => {
      const option = substitutionTypes
        .flatMap((type) => details.options[type] ?? [])
        .find((item) => item.optionId === optionId);
      return sum + (option ? optionPrice(option) : 0);
    }, 0);

    return (Number(details.basePrice) + extrasTotal + substitutionsTotal) * quantity;
  }, [details, extraOptions, extras, product.price, quantity, substitutions]);

  const updateExtra = (option: CustomizationOption, delta: number) => {
    setExtras((current) => {
      const nextQuantity = Math.max(0, Math.min(option.maxQuantity, (current[option.optionId] ?? 0) + delta));
      const next = { ...current };
      if (nextQuantity === 0) {
        delete next[option.optionId];
      } else {
        next[option.optionId] = nextQuantity;
      }
      return next;
    });
  };

  const toggleIngredient = (ingredient: CustomizationIngredient) => {
    if (!ingredient.removable || ingredient.type !== "normal") return;

    setRemoved((current) => {
      const next = new Set(current);
      if (next.has(ingredient.ingredientId)) {
        next.delete(ingredient.ingredientId);
      } else {
        next.add(ingredient.ingredientId);
      }
      return next;
    });
  };

  const submit = async () => {
    if (!details || !details.customizable) return;

    const selectedExtras = Object.entries(extras).map(([idOpcao, quantity]) => ({
      optionId: Number(idOpcao),
      quantity,
    }));

    const selectedSubstitutions = Object.entries(substitutions).flatMap(([originalId, optionId]) => {
      const option = substitutionTypes
        .flatMap((type) => details.options[type] ?? [])
        .find((item) => item.optionId === optionId);

      if (!option?.ingredientId) return [];
      return [{
        originalIngredientId: Number(originalId),
        newIngredientId: option.ingredientId,
      }];
    });

    try {
      setSubmitting(true);
      await cartService.addCustomizedItem({
        productId: product.id,
        quantity: quantity,
        removedIngredients: Array.from(removed).filter((ingredientId) => (
          details.ingredients.some((ingredient) => (
            ingredient.ingredientId === ingredientId &&
            ingredient.removable &&
            ingredient.type === "normal"
          ))
        )),
        extras: selectedExtras,
        substitutions: selectedSubstitutions,
        notes: notes.trim() || null,
      }, product.stock);
      onAdded(product.name);
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível adicionar o item personalizado.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="customize-modal" role="dialog" aria-modal="true" aria-label={`Personalizar ${product.name}`}>
      <button className="customize-backdrop" type="button" onClick={onClose} aria-label="Fechar personalização" />

      <section className="customize-panel">
        <header className="customize-header">
          <div>
            <p>Personalizar</p>
            <h2>{product.name}</h2>
          </div>
          <IconButton aria-label="Fechar" onClick={onClose} size="sm">
            <X size={17} />
          </IconButton>
        </header>

        {loading || !details ? (
          <div className="customize-loading">A carregar opções...</div>
        ) : (
          <>
            <div className="customize-body">
              <p className="customize-price-note">
                Adicionar um item custa mais 1,00 €. Remover ingredientes não reduz o preço.
              </p>
              <section className="customize-section">
                <h3>Ingredientes</h3>
                <div className="customize-list">
                  {details.ingredients.map((ingredient) => (
                    <label key={ingredient.ingredientId} className="customize-check">
                      <input
                        type="checkbox"
                        checked={!removed.has(ingredient.ingredientId)}
                        disabled={!ingredient.removable || ingredient.type !== "normal"}
                        onChange={() => toggleIngredient(ingredient)}
                      />
                      <span>{ingredient.name}</span>
                    </label>
                  ))}
                </div>
              </section>

              {details.substitutableIngredients.length > 0 && (
                <section className="customize-section">
                  <h3>Trocas</h3>
                  <div className="customize-list">
                    {details.substitutableIngredients.map((ingredient) => {
                      const options = substitutionOptionsFor(ingredient, details);
                      if (options.length === 0) return null;

                      return (
                        <label key={ingredient.ingredientId} className="customize-select-row">
                          <span>{ingredient.name}</span>
                          <CustomSelect
                            value={substitutions[ingredient.ingredientId] ?? ""}
                            onChange={(nextValue) => {
                              const optionId = Number(nextValue);
                              setSubstitutions((current) => {
                                const next = { ...current };
                                if (optionId) next[ingredient.ingredientId] = optionId;
                                else delete next[ingredient.ingredientId];
                                return next;
                              });
                            }}
                            options={[
                              { value: "", label: "Manter original" },
                              ...options.map((option) => ({
                                value: option.optionId,
                                label: `${optionLabel(option)}${optionPrice(option) > 0 ? ` (+${formatEuro(optionPrice(option))})` : ""}`,
                              })),
                            ]}
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>
              )}

              {extraOptions.length > 0 && (
                <section className="customize-section">
                  <h3>Extras</h3>
                  <div className="customize-list">
                    {extraOptions.map((option) => (
                      <div key={option.optionId} className="customize-extra-row">
                        <div>
                          <strong>{optionLabel(option)}</strong>
                          <span>{formatEuro(addSurcharge)}</span>
                        </div>
                        <div className="customize-stepper">
                          <button type="button" onClick={() => updateExtra(option, -1)} disabled={!extras[option.optionId]} aria-label={`Diminuir ${option.name}`}>
                            <Minus size={15} />
                          </button>
                          <span>{extras[option.optionId] ?? 0}</span>
                          <button type="button" onClick={() => updateExtra(option, 1)} disabled={(extras[option.optionId] ?? 0) >= option.maxQuantity} aria-label={`Aumentar ${option.name}`}>
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="customize-section">
                <h3>Notas</h3>
                <Textarea
                  maxLength={255}
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Mais crocante, nota de alergia ou pedido para a cozinha"
                />
              </section>
            </div>

            <footer className="customize-footer">
              <div>
                <span>Total</span>
                <strong>{formatEuro(total)}</strong>
              </div>
              <div className="customize-stepper customize-footer-stepper" aria-label={`Quantidade de ${product.name}`}>
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Diminuir quantidade">
                  <Minus size={15} />
                </button>
                <span>{quantity}</span>
                <button type="button" onClick={() => setQuantity((value) => Math.min(product.stock, value + 1))} disabled={quantity >= product.stock} aria-label="Aumentar quantidade">
                  <Plus size={15} />
                </button>
              </div>
              <Button onClick={submit} isLoading={submitting} disabled={!details.customizable}>
                {submitLabel}
              </Button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
