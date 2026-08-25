export type ApiErrorField = {
  field?: string;
  code?: string;
  message?: string;
  params?: Record<string, unknown>;
};

const EXACT_MESSAGE_TRANSLATIONS: Record<string, string> = {
  "Failed to load cart": "cartLoad",
  "Failed to add item": "cartAdd",
  "Failed to remove item": "cartRemove",
  "Failed to update quantity": "cartQuantity",
  "Failed to clear cart": "cartClear",
  "Failed to fetch products": "productsLoad",
  "Failed to get cart": "cartLoad",
  "Failed to add customized item": "customItemAdd",
  "Failed to update item": "itemUpdate",
  "Failed to merge cart": "cartMerge",
  "Failed to place order": "orderPlace",
  "Failed to download receipt": "receiptDownload",
  "Failed to fetch order history": "orderHistoryLoad",
  "Failed to cancel order": "orderCancel",
  "Failed to fetch coupons": "couponsLoad",
  "Failed to validate coupon": "couponValidate",
  "Unable to add this item.": "itemAdd",
  "Item added to cart.": "itemAdded",
  "Please fix the highlighted fields.": "fixFields",
  "Product updated successfully.": "productUpdated",
  "Product added successfully.": "productAdded",
  "Unable to save product. Please try again.": "productSave",
  "Product deleted successfully.": "productDeleted",
  "Unable to delete product. Please try again.": "productDelete",
  "Product restored successfully.": "productRestored",
  "Unable to restore product.": "productRestore",
  "Existing ingredient selected.": "ingredientSelected",
  "Ingredient created and selected.": "ingredientCreatedSelected",
  "Unable to create ingredient.": "ingredientCreate",
  "Category updated successfully.": "categoryUpdated",
  "Category created successfully.": "categoryCreated",
  "Unable to save category.": "categorySave",
  "Category deactivated successfully.": "categoryDeactivated",
  "Unable to deactivate category.": "categoryDeactivate",
  "Category activated successfully.": "categoryActivated",
  "Unable to activate category.": "categoryActivate",
  "Ingredient updated successfully.": "ingredientUpdated",
  "Ingredient created successfully.": "ingredientCreated",
  "Unable to save ingredient.": "ingredientSave",
  "Ingredient deactivated successfully.": "ingredientDeactivated",
  "Unable to deactivate ingredient.": "ingredientDeactivate",
  "Ingredient activated successfully.": "ingredientActivated",
  "Unable to activate ingredient.": "ingredientActivate",
  "Imagem removida com sucesso.": "imageRemoved",
  "Não foi possível remover a imagem.": "imageRemove",
  "Ingrediente disponível.": "ingredientAvailable",
  "Ingrediente indisponível.": "ingredientUnavailable",
  "Produto disponível.": "productAvailable",
  "Produto indisponível.": "productUnavailable",
  "Não foi possível alterar a disponibilidade do ingrediente": "ingredientAvailability",
  "Não foi possível alterar a disponibilidade do produto": "productAvailability",
  "Order status updated successfully.": "orderStatusUpdated",
  "Unable to update order status.": "orderStatusUpdate",
  "Order marked as paid.": "orderPaid",
  "Unable to mark order as paid.": "orderMarkPaid",
  "Customer updated successfully.": "customerUpdated",
  "Customer created successfully.": "customerCreated",
  "Unable to save customer.": "customerSave",
  "Customer deactivated successfully.": "customerDeactivated",
  "Unable to deactivate customer.": "customerDeactivate",
  "Customer reactivated successfully.": "customerReactivated",
  "Unable to reactivate customer.": "customerReactivate",
  "Staff admin updated successfully.": "adminUpdated",
  "Staff admin created successfully.": "adminCreated",
  "Unable to save staff admin.": "adminSave",
  "Site settings saved successfully.": "settingsSaved",
  "Unable to save site settings.": "settingsSave",
  "Definições do site guardadas com sucesso.": "settingsSaved",
  "Não foi possível guardar as definições do site.": "settingsSave",
  "Não foi possível carregar as definições do site.": "settingsLoad",
  "Staff admin deactivated successfully.": "adminDeactivated",
  "Unable to deactivate staff admin.": "adminDeactivate",
  "Staff admin reactivated successfully.": "adminReactivated",
  "Unable to reactivate staff admin.": "adminReactivate",
  "Reply text cannot be empty.": "replyEmpty",
  "O texto da resposta não pode estar vazio.": "replyEmpty",
  "A palavra-passe é obrigatória para um novo administrador": "adminPasswordRequired",
  "Review reply updated successfully.": "replyUpdated",
  "Review reply posted successfully.": "replyPosted",
  "Unable to save review reply.": "replySave",
  "Review reply deleted successfully.": "replyDeleted",
  "Unable to delete review reply.": "replyDelete",
  "Admin session not loaded.": "adminSession",
  "Admin session not loaded": "adminSession",
  "Review reaction removed.": "reactionRemoved",
  "Review reaction updated.": "reactionUpdated",
  "Unable to update review reaction.": "reactionUpdate",
  "Choose a purchased item to review.": "choosePurchased",
  "You already reviewed this product. Edit your existing review instead.": "alreadyReviewed",
};

const ERROR_CODE_TRANSLATIONS: Record<string, string> = {
  bad_request: "badRequest",
  authentication_required: "authenticationRequired",
  permission_denied: "permissionDenied",
  not_found: "notFound",
  conflict: "conflict",
  http_error: "generic",
  validation_error: "validationError",
  internal_server_error: "internal",
  rate_limit_exceeded: "rateLimit",
  duplicate_email: "codes.duplicateEmail",
  duplicate_tax_id: "codes.duplicateTaxId",
  account_not_found: "codes.accountNotFound",
  invalid_credentials: "invalidCredentials",
  inactive_account: "codes.inactiveAccount",
  suspended_account: "codes.suspendedAccount",
  service_unavailable: "serviceUnavailable",
  invalid_password_reset_code: "codes.invalidResetCode",
  invalid_password_reset_token: "codes.invalidResetToken",
  product_not_found: "codes.productNotFound",
  category_not_found: "codes.categoryNotFound",
  ingredient_not_found: "codes.ingredientNotFound",
  order_not_found: "codes.orderNotFound",
  customer_not_found: "codes.customerNotFound",
  cart_item_not_found: "codes.cartItemNotFound",
  coupon_not_found: "codes.couponNotFound",
  invalid_coupon: "codes.invalidCoupon",
  coupon_expired: "codes.couponExpired",
  coupon_not_active: "codes.couponInactive",
  product_unavailable: "codes.productUnavailable",
  ingredient_unavailable: "codes.ingredientUnavailable",
};

const FIELD_LABELS: Record<string, string> = {
  email: "email", password: "password", new_password: "newPassword", confirmPassword: "passwordConfirmation",
  name: "name", nome: "name", last_name: "lastName", lastName: "lastName", phone: "phone", telefone: "phone",
  tax_id: "taxId", taxId: "taxId", reset_token: "resetToken", resetToken: "resetToken", code: "code",
  address: "address", postal_code: "postalCode", city: "city", quantity: "quantity",
  product_id: "product", productId: "product", category_id: "category", ingredient_id: "ingredient",
};

const FIELD_ERROR_TRANSLATIONS: Record<string, (label: string, params?: Record<string, unknown>) => string> = {
  required: (label) => i18n.t("field.required", { ns: "errors", label }),
  blank: (label) => i18n.t("field.blank", { ns: "errors", label }),
  too_short: (label, params) => i18n.t("field.tooShort", { ns: "errors", label, min: params?.min ?? "-" }),
  too_long: (label, params) => i18n.t("field.tooLong", { ns: "errors", label, max: params?.max ?? "-" }),
  invalid_choice: (label, params) => {
    const choices = Array.isArray(params?.choices) ? params.choices.join(", ") : params?.choices;
    return choices
      ? i18n.t("field.invalidChoiceWithValues", { ns: "errors", label, choices })
      : i18n.t("field.invalidChoice", { ns: "errors", label });
  },
  invalid_type: (label) => i18n.t("field.invalidType", { ns: "errors", label }),
  invalid: (label) => i18n.t("field.invalid", { ns: "errors", label }),
  username_invalid_characters: (label) => i18n.t("field.usernameCharacters", { ns: "errors", label }),
  username_punctuation_boundary: (label) => i18n.t("field.usernameBoundary", { ns: "errors", label }),
  username_repeated_punctuation: (label) => i18n.t("field.usernameRepeated", { ns: "errors", label }),
  person_name_invalid_characters: (label) => i18n.t("field.nameCharacters", { ns: "errors", label }),
  person_name_invalid_separators: (label) => i18n.t("field.nameSeparators", { ns: "errors", label }),
  person_name_trailing_separator: (label) => i18n.t("field.nameTrailing", { ns: "errors", label }),
};

export function translateApiError(error?: string, fallback?: string): string {
  if (!error) return fallback ?? i18n.t("generic", { ns: "errors" });
  const key = ERROR_CODE_TRANSLATIONS[error];
  return key ? i18n.t(key, { ns: "errors" }) : translateUserMessage(error);
}

export function translateFieldError(fieldError: ApiErrorField): string {
  const field = fieldError.field ?? "field";
  const labelKey = FIELD_LABELS[field];
  const label = labelKey
    ? i18n.t(`fields.${labelKey}`, { ns: "common" })
    : field.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());
  const code = fieldError.code ?? "invalid";
  const translator = FIELD_ERROR_TRANSLATIONS[code];

  if (translator) {
    return translator(label, fieldError.params);
  }

  return fieldError.message ? translateUserMessage(fieldError.message) : i18n.t("field.invalid", { ns: "errors", label });
}

export function translateUserMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;

  const exact = EXACT_MESSAGE_TRANSLATIONS[trimmed];
  if (exact) return i18n.t(`messages.${exact}`, { ns: "errors" });

  const failedAction = trimmed.match(/^Failed to (fetch|load|update|save|create|delete|deactivate|reactivate|restore|remove|upload|export|mark)\s+(.+?)\.?$/i);
  if (failedAction?.[1] && failedAction?.[2]) {
    return failedActionMessage(failedAction[1], translatedResource(failedAction[2]));
  }

  const unableAction = trimmed.match(/^Unable to (save|delete|restore|deactivate|activate|update|mark|export|reactivate)\s+(.+?)\.?$/i);
  if (unableAction?.[1] && unableAction?.[2]) {
    return failedActionMessage(unableAction[1], translatedResource(unableAction[2]));
  }

  const couldNotBeAdded = trimmed.match(/^(.+?)\s+could not be added\.?$/i);
  if (couldNotBeAdded?.[1]) {
    return i18n.t("messages.couldNotAdd", { ns: "errors", item: couldNotBeAdded[1] });
  }

  const addedItems = trimmed.match(/^Added\s+(\d+)\s+items?\s+to cart\.?$/i);
  if (addedItems?.[1]) {
    const count = Number(addedItems[1]);
    return i18n.t("messages.itemsAdded", { ns: "errors", count });
  }

  const addedQuantity = trimmed.match(/^Added\s+(\d+)x\s+(.+?)\s+to cart\.?$/i);
  if (addedQuantity?.[1] && addedQuantity?.[2]) {
    return i18n.t("messages.quantityAdded", { ns: "errors", count: addedQuantity[1], item: addedQuantity[2] });
  }

  return trimmed;
}

function failedActionMessage(action: string, resource: string): string {
  const normalized = action.toLowerCase();
  const actionKey = normalized === "fetch" || normalized === "load" ? "load"
    : normalized === "delete" || normalized === "remove" ? "remove"
      : normalized === "reactivate" || normalized === "restore" ? "restore"
        : ["update", "save", "create", "deactivate", "upload", "export", "mark"].includes(normalized) ? normalized : "process";
  return i18n.t(`failedActions.${actionKey}`, { ns: "errors", resource });
}

function translatedResource(resource: string): string {
  const normalized = resource.trim().toLowerCase();
  const resources: Record<string, string> = {
    "dashboard analytics": "dashboardAnalytics", "current admin": "currentAdmin", products: "products", product: "product",
    "product analytics": "productAnalytics", ingredients: "ingredients", ingredient: "ingredient", orders: "orders",
    "staff orders": "staffOrders", "kitchen orders": "kitchenOrders", order: "order", customers: "customers", customer: "customer",
    "staff admins": "staffAdmins", "staff admin": "staffAdmin", categories: "categories", category: "category", image: "image",
    "unavailable products": "unavailableProducts", "popular products": "popularProducts", "sales performance": "salesPerformance",
    "analytics series": "analyticsSeries", reviews: "reviews", "review reply": "reviewReply", "review reaction": "reviewReaction",
    reaction: "reaction", dashboard: "dashboard", "analytics chart": "analyticsChart", "site settings": "siteSettings",
  };
  const key = resources[normalized];
  return key ? i18n.t(`resources.${key}`, { ns: "errors" }) : resource;
}
import i18n from "../i18n";
