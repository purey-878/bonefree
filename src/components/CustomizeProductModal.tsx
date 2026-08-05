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
const substitutionTypes = ["SUBSTITUIR_MOLHO", "SUBSTITUIR_ACOMPANHAMENTO"] as const;

function optionPrice(option: CustomizationOption): number {
  return Number(option.preco_extra ?? 0);
}

function optionLabel(option: CustomizationOption): string {
  return option.nome.replace(/^Extra\s+/i, "").replace(/^Substituir por\s+/i, "");
}

function substitutionOptionsFor(
  ingredient: CustomizationIngredient,
  details: ProductCustomizationDetails,
) {
  if (ingredient.tipo === "MOLHO") return details.opcoes.SUBSTITUIR_MOLHO;
  if (ingredient.tipo === "ACOMPANHAMENTO") return details.opcoes.SUBSTITUIR_ACOMPANHAMENTO;
  return substitutionTypes.flatMap((tipo) => details.opcoes[tipo]);
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
          data.ingredientes
            .filter((ingredient) => ingredient.removivel && ingredient.tipo === "INGREDIENTES_NORMAIS")
            .map((ingredient) => ingredient.id_ingrediente),
        );
        setRemoved(new Set(
          (initialCustomization?.ingredientes_removidos ?? [])
            .filter((ingredientId) => removableIngredientIds.has(ingredientId)),
        ));
        setExtras(Object.fromEntries(
          (initialCustomization?.extras ?? [])
            .filter((item) => item.id_opcao > 0 && item.quantidade > 0)
            .map((item) => [item.id_opcao, item.quantidade]),
        ));
        setSubstitutions(Object.fromEntries(
          (initialCustomization?.substituicoes ?? []).flatMap((item) => {
            const option = substitutionTypes
              .flatMap((tipo) => data.opcoes[tipo])
              .find((candidate) => candidate.id_ingrediente === item.id_ingrediente_novo);

            return option ? [[item.id_ingrediente_original, option.id_opcao]] : [];
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
    () => details ? [...details.opcoes.EXTRA, ...details.opcoes.ADICIONAR] : [],
    [details],
  );

  const total = useMemo(() => {
    if (!details) return Number(product.price ?? 0) * quantity;

    const extrasTotal = extraOptions.reduce((sum, option) => {
      return sum + (extras[option.id_opcao] ?? 0) * addSurcharge;
    }, 0);

    const substitutionsTotal = Object.values(substitutions).reduce((sum, optionId) => {
      const option = substitutionTypes
        .flatMap((tipo) => details.opcoes[tipo])
        .find((item) => item.id_opcao === optionId);
      return sum + (option ? optionPrice(option) : 0);
    }, 0);

    return (Number(details.preco_base) + extrasTotal + substitutionsTotal) * quantity;
  }, [details, extraOptions, extras, product.price, quantity, substitutions]);

  const updateExtra = (option: CustomizationOption, delta: number) => {
    setExtras((current) => {
      const nextQuantity = Math.max(0, Math.min(option.max_quantidade, (current[option.id_opcao] ?? 0) + delta));
      const next = { ...current };
      if (nextQuantity === 0) {
        delete next[option.id_opcao];
      } else {
        next[option.id_opcao] = nextQuantity;
      }
      return next;
    });
  };

  const toggleIngredient = (ingredient: CustomizationIngredient) => {
    if (!ingredient.removivel || ingredient.tipo !== "INGREDIENTES_NORMAIS") return;

    setRemoved((current) => {
      const next = new Set(current);
      if (next.has(ingredient.id_ingrediente)) {
        next.delete(ingredient.id_ingrediente);
      } else {
        next.add(ingredient.id_ingrediente);
      }
      return next;
    });
  };

  const submit = async () => {
    if (!details || !details.customizavel) return;

    const selectedExtras = Object.entries(extras).map(([idOpcao, quantidade]) => ({
      id_opcao: Number(idOpcao),
      quantidade,
    }));

    const selectedSubstitutions = Object.entries(substitutions).flatMap(([originalId, optionId]) => {
      const option = substitutionTypes
        .flatMap((tipo) => details.opcoes[tipo])
        .find((item) => item.id_opcao === optionId);

      if (!option?.id_ingrediente) return [];
      return [{
        id_ingrediente_original: Number(originalId),
        id_ingrediente_novo: option.id_ingrediente,
      }];
    });

    try {
      setSubmitting(true);
      await cartService.addCustomizedItem({
        id_produto: product.id,
        quantidade: quantity,
        ingredientes_removidos: Array.from(removed).filter((ingredientId) => (
          details.ingredientes.some((ingredient) => (
            ingredient.id_ingrediente === ingredientId &&
            ingredient.removivel &&
            ingredient.tipo === "INGREDIENTES_NORMAIS"
          ))
        )),
        extras: selectedExtras,
        substituicoes: selectedSubstitutions,
        observacoes: notes.trim() || null,
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
                  {details.ingredientes.map((ingredient) => (
                    <label key={ingredient.id_ingrediente} className="customize-check">
                      <input
                        type="checkbox"
                        checked={!removed.has(ingredient.id_ingrediente)}
                        disabled={!ingredient.removivel || ingredient.tipo !== "INGREDIENTES_NORMAIS"}
                        onChange={() => toggleIngredient(ingredient)}
                      />
                      <span>{ingredient.nome}</span>
                    </label>
                  ))}
                </div>
              </section>

              {details.ingredientes_substituiveis.length > 0 && (
                <section className="customize-section">
                  <h3>Trocas</h3>
                  <div className="customize-list">
                    {details.ingredientes_substituiveis.map((ingredient) => {
                      const options = substitutionOptionsFor(ingredient, details);
                      if (options.length === 0) return null;

                      return (
                        <label key={ingredient.id_ingrediente} className="customize-select-row">
                          <span>{ingredient.nome}</span>
                          <CustomSelect
                            value={substitutions[ingredient.id_ingrediente] ?? ""}
                            onChange={(nextValue) => {
                              const optionId = Number(nextValue);
                              setSubstitutions((current) => {
                                const next = { ...current };
                                if (optionId) next[ingredient.id_ingrediente] = optionId;
                                else delete next[ingredient.id_ingrediente];
                                return next;
                              });
                            }}
                            options={[
                              { value: "", label: "Manter original" },
                              ...options.map((option) => ({
                                value: option.id_opcao,
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
                      <div key={option.id_opcao} className="customize-extra-row">
                        <div>
                          <strong>{optionLabel(option)}</strong>
                          <span>{formatEuro(addSurcharge)}</span>
                        </div>
                        <div className="customize-stepper">
                          <button type="button" onClick={() => updateExtra(option, -1)} disabled={!extras[option.id_opcao]} aria-label={`Diminuir ${option.nome}`}>
                            <Minus size={15} />
                          </button>
                          <span>{extras[option.id_opcao] ?? 0}</span>
                          <button type="button" onClick={() => updateExtra(option, 1)} disabled={(extras[option.id_opcao] ?? 0) >= option.max_quantidade} aria-label={`Aumentar ${option.nome}`}>
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
              <Button onClick={submit} isLoading={submitting} disabled={!details.customizavel}>
                {submitLabel}
              </Button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
