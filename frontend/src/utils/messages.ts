export type ApiErrorField = {
  field?: string;
  code?: string;
  message?: string;
  params?: Record<string, unknown>;
};

const EXACT_MESSAGE_TRANSLATIONS: Record<string, string> = {
  "Failed to load cart": "Não foi possível carregar o carrinho.",
  "Failed to add item": "Não foi possível adicionar o item.",
  "Failed to remove item": "Não foi possível remover o item.",
  "Failed to update quantity": "Não foi possível atualizar a quantidade.",
  "Failed to clear cart": "Não foi possível limpar o carrinho.",
  "Failed to fetch products": "Não foi possível carregar os produtos.",
  "Failed to get cart": "Não foi possível carregar o carrinho.",
  "Failed to add customized item": "Não foi possível adicionar o item personalizado.",
  "Failed to update item": "Não foi possível atualizar o item.",
  "Failed to merge cart": "Não foi possível sincronizar o carrinho.",
  "Failed to place order": "Não foi possível efetuar o pedido.",
  "Failed to download receipt": "Não foi possível descarregar o recibo.",
  "Failed to fetch order history": "Não foi possível carregar o histórico de pedidos.",
  "Failed to cancel order": "Não foi possível cancelar o pedido.",
  "Failed to fetch coupons": "Não foi possível carregar os cupões.",
  "Failed to validate coupon": "Não foi possível validar o cupão.",
  "Unable to add this item.": "Não foi possível adicionar este item.",
  "Item added to cart.": "Item adicionado ao carrinho.",
  "Please fix the highlighted fields.": "Corrija os campos assinalados.",
  "Product updated successfully.": "Produto atualizado com sucesso.",
  "Product added successfully.": "Produto adicionado com sucesso.",
  "Unable to save product. Please try again.": "Não foi possível guardar o produto. Tente novamente.",
  "Product deleted successfully.": "Produto eliminado com sucesso.",
  "Unable to delete product. Please try again.": "Não foi possível eliminar o produto.",
  "Product restored successfully.": "Produto restaurado com sucesso.",
  "Unable to restore product.": "Não foi possível restaurar o produto.",
  "Existing ingredient selected.": "Ingrediente existente selecionado.",
  "Ingredient created and selected.": "Ingrediente criado e selecionado.",
  "Category updated successfully.": "Categoria atualizada com sucesso.",
  "Category created successfully.": "Categoria criada com sucesso.",
  "Unable to save category.": "Não foi possível guardar a categoria.",
  "Category deactivated successfully.": "Categoria desativada com sucesso.",
  "Unable to deactivate category.": "Não foi possível desativar a categoria.",
  "Category activated successfully.": "Categoria ativada com sucesso.",
  "Unable to activate category.": "Não foi possível ativar a categoria.",
  "Ingredient updated successfully.": "Ingrediente atualizado com sucesso.",
  "Ingredient created successfully.": "Ingrediente criado com sucesso.",
  "Unable to save ingredient.": "Não foi possível guardar o ingrediente.",
  "Ingredient deactivated successfully.": "Ingrediente desativado com sucesso.",
  "Unable to deactivate ingredient.": "Não foi possível desativar o ingrediente.",
  "Ingredient activated successfully.": "Ingrediente ativado com sucesso.",
  "Unable to activate ingredient.": "Não foi possível ativar o ingrediente.",
  "Order status updated successfully.": "Estado do pedido atualizado com sucesso.",
  "Unable to update order status.": "Não foi possível atualizar o estado do pedido.",
  "Order marked as paid.": "Pedido marcado como pago.",
  "Unable to mark order as paid.": "Não foi possível marcar o pedido como pago.",
  "Customer updated successfully.": "Cliente atualizado com sucesso.",
  "Customer created successfully.": "Cliente criado com sucesso.",
  "Unable to save customer.": "Não foi possível guardar o cliente.",
  "Customer deactivated successfully.": "Cliente desativado com sucesso.",
  "Unable to deactivate customer.": "Não foi possível desativar o cliente.",
  "Customer reactivated successfully.": "Cliente reativado com sucesso.",
  "Unable to reactivate customer.": "Não foi possível reativar o cliente.",
  "Staff admin updated successfully.": "Administrador atualizado com sucesso.",
  "Staff admin created successfully.": "Administrador criado com sucesso.",
  "Unable to save staff admin.": "Não foi possível guardar o administrador.",
  "Site settings saved successfully.": "Definições do site guardadas com sucesso.",
  "Unable to save site settings.": "Não foi possível guardar as definições do site.",
  "Staff admin deactivated successfully.": "Administrador desativado com sucesso.",
  "Unable to deactivate staff admin.": "Não foi possível desativar o administrador.",
  "Staff admin reactivated successfully.": "Administrador reativado com sucesso.",
  "Unable to reactivate staff admin.": "Não foi possível reativar o administrador.",
  "Reply text cannot be empty.": "O texto da resposta não pode estar vazio.",
  "Review reply updated successfully.": "Resposta à avaliação atualizada com sucesso.",
  "Review reply posted successfully.": "Resposta à avaliação publicada com sucesso.",
  "Unable to save review reply.": "Não foi possível guardar a resposta à avaliação.",
  "Review reply deleted successfully.": "Resposta à avaliação eliminada.",
  "Unable to delete review reply.": "Não foi possível eliminar a resposta à avaliação.",
  "Admin session not loaded.": "Sessão de administrador não carregada.",
  "Review reaction removed.": "Reação à avaliação removida.",
  "Review reaction updated.": "Reação à avaliação atualizada.",
  "Unable to update review reaction.": "Não foi possível atualizar a reação à avaliação.",
  "Choose a purchased item to review.": "Escolha um item comprado para avaliar.",
  "You already reviewed this product. Edit your existing review instead.": "Já avaliou este produto. Edite a sua avaliação existente.",
};

const ERROR_CODE_TRANSLATIONS: Record<string, string> = {
  bad_request: "O pedido é inválido.",
  authentication_required: "Tem de iniciar sessão para continuar.",
  permission_denied: "Não tem permissão para executar esta ação.",
  not_found: "O recurso pedido não foi encontrado.",
  conflict: "Não foi possível concluir a ação porque existe um conflito.",
  http_error: "Não foi possível concluir o pedido.",
  validation_error: "Corrija os campos assinalados.",
  internal_server_error: "Ocorreu um erro interno. Tente novamente mais tarde.",
  rate_limit_exceeded: "Demasiadas tentativas. Tente novamente mais tarde.",
  duplicate_email: "Este email já está associado a uma conta existente.",
  duplicate_tax_id: "Este NIF já está associado a uma conta existente.",
  account_not_found: "Não foi encontrada uma conta com estes dados.",
  invalid_credentials: "Email ou palavra-passe inválidos.",
  inactive_account: "Esta conta não está ativa.",
  suspended_account: "Esta conta está suspensa.",
  service_unavailable: "Serviço temporariamente indisponível. Tente novamente mais tarde.",
  invalid_password_reset_code: "O código de redefinição é inválido ou expirou.",
  invalid_password_reset_token: "A sessão de redefinição expirou. Peça um novo código.",
  product_not_found: "Produto não encontrado.",
  category_not_found: "Categoria não encontrada.",
  ingredient_not_found: "Ingrediente não encontrado.",
  order_not_found: "Pedido não encontrado.",
  customer_not_found: "Cliente não encontrado.",
  cart_item_not_found: "Item do carrinho não encontrado.",
  coupon_not_found: "Cupão não encontrado.",
  invalid_coupon: "O cupão é inválido.",
  coupon_expired: "O cupão expirou.",
  coupon_not_active: "O cupão não está ativo.",
  insufficient_stock: "Não existe stock suficiente.",
  out_of_stock: "Este item está esgotado.",
};

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  password: "Palavra-passe",
  new_password: "Nova palavra-passe",
  confirmPassword: "Confirmação da palavra-passe",
  name: "Nome",
  nome: "Nome",
  last_name: "Apelido",
  lastName: "Apelido",
  phone: "Telefone",
  telefone: "Telefone",
  tax_id: "NIF",
  taxId: "NIF",
  reset_token: "Token de redefinição",
  resetToken: "Token de redefinição",
  code: "Código",
  address: "Morada",
  postal_code: "Código postal",
  city: "Cidade",
  quantity: "Quantidade",
  product_id: "Produto",
  productId: "Produto",
  category_id: "Categoria",
  ingredient_id: "Ingrediente",
};

const FIELD_ERROR_TRANSLATIONS: Record<string, (label: string, params?: Record<string, unknown>) => string> = {
  required: (label) => `${label} é obrigatório.`,
  blank: (label) => `${label} não pode estar vazio.`,
  too_short: (label, params) => `${label} deve ter pelo menos ${params?.min ?? "o mínimo de"} caracteres.`,
  too_long: (label, params) => `${label} deve ter no máximo ${params?.max ?? "o máximo de"} caracteres.`,
  invalid_choice: (label, params) => {
    const choices = Array.isArray(params?.choices) ? params.choices.join(", ") : params?.choices;
    return choices ? `${label} deve ser um dos seguintes valores: ${choices}.` : `${label} tem um valor inválido.`;
  },
  invalid_type: (label) => `${label} tem um tipo inválido.`,
  invalid: (label) => `${label} é inválido.`,
  username_invalid_characters: (label) => `${label} só pode conter letras, números, pontos, hífenes e underscores.`,
  username_punctuation_boundary: (label) => `${label} não pode começar nem terminar com pontuação.`,
  username_repeated_punctuation: (label) => `${label} não pode conter pontuação repetida.`,
  person_name_invalid_characters: (label) => `${label} só pode conter letras, espaços, hífenes e apóstrofos.`,
  person_name_invalid_separators: (label) => `${label} não pode conter separadores no início nem separadores repetidos.`,
  person_name_trailing_separator: (label) => `${label} não pode terminar com um separador.`,
};

export function translateApiError(error?: string, fallback = "Não foi possível concluir o pedido."): string {
  if (!error) return fallback;
  return ERROR_CODE_TRANSLATIONS[error] ?? translateUserMessage(error);
}

export function translateFieldError(fieldError: ApiErrorField): string {
  const field = fieldError.field ?? "field";
  const label = FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());
  const code = fieldError.code ?? "invalid";
  const translator = FIELD_ERROR_TRANSLATIONS[code];

  if (translator) {
    return translator(label, fieldError.params);
  }

  return fieldError.message ? translateUserMessage(fieldError.message) : `${label} é inválido.`;
}

export function translateUserMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;

  const exact = EXACT_MESSAGE_TRANSLATIONS[trimmed];
  if (exact) return exact;

  const failedAction = trimmed.match(/^Failed to (fetch|load|update|save|create|delete|deactivate|reactivate|restore|remove|upload|export|mark)\s+(.+?)\.?$/i);
  if (failedAction?.[1] && failedAction?.[2]) {
    return `${failedActionPrefix(failedAction[1])} ${translatedResource(failedAction[2])}.`;
  }

  const unableAction = trimmed.match(/^Unable to (save|delete|restore|deactivate|activate|update|mark|export|reactivate)\s+(.+?)\.?$/i);
  if (unableAction?.[1] && unableAction?.[2]) {
    return `${unableActionPrefix(unableAction[1])} ${translatedResource(unableAction[2])}.`;
  }

  const outOfStock = trimmed.match(/^(.+?)\s+is out of stock\.?$/i);
  if (outOfStock?.[1]) {
    return `${outOfStock[1]} está esgotado.`;
  }

  const onlyHasStock = trimmed.match(/^(.+?)\s+only has\s+(\d+)\s+in stock\.?$/i);
  if (onlyHasStock?.[1] && onlyHasStock?.[2]) {
    return `${onlyHasStock[1]} só tem ${onlyHasStock[2]} em stock.`;
  }

  const couldNotBeAdded = trimmed.match(/^(.+?)\s+could not be added\.?$/i);
  if (couldNotBeAdded?.[1]) {
    return `${couldNotBeAdded[1]} não pôde ser adicionado.`;
  }

  const addedItems = trimmed.match(/^Added\s+(\d+)\s+items?\s+to cart\.?$/i);
  if (addedItems?.[1]) {
    const count = Number(addedItems[1]);
    return `${count} ${count === 1 ? "item adicionado" : "itens adicionados"} ao carrinho.`;
  }

  const addedQuantity = trimmed.match(/^Added\s+(\d+)x\s+(.+?)\s+to cart\.?$/i);
  if (addedQuantity?.[1] && addedQuantity?.[2]) {
    return `${addedQuantity[1]}x ${addedQuantity[2]} adicionado ao carrinho.`;
  }

  return trimmed;
}

function failedActionPrefix(action: string): string {
  const normalized = action.toLowerCase();
  if (normalized === "fetch" || normalized === "load") return "Não foi possível carregar";
  if (normalized === "update") return "Não foi possível atualizar";
  if (normalized === "save") return "Não foi possível guardar";
  if (normalized === "create") return "Não foi possível criar";
  if (normalized === "delete" || normalized === "remove") return "Não foi possível remover";
  if (normalized === "deactivate") return "Não foi possível desativar";
  if (normalized === "reactivate" || normalized === "restore") return "Não foi possível restaurar";
  if (normalized === "upload") return "Não foi possível carregar";
  if (normalized === "export") return "Não foi possível exportar";
  if (normalized === "mark") return "Não foi possível marcar";
  return "Não foi possível processar";
}

function unableActionPrefix(action: string): string {
  return failedActionPrefix(action);
}

function translatedResource(resource: string): string {
  const normalized = resource.trim().toLowerCase();
  const resources: Record<string, string> = {
    "dashboard analytics": "as análises do painel",
    "current admin": "o administrador atual",
    products: "os produtos",
    product: "o produto",
    "product analytics": "as análises do produto",
    ingredients: "os ingredientes",
    ingredient: "o ingrediente",
    orders: "os pedidos",
    "staff orders": "os pedidos da equipa",
    "kitchen orders": "os pedidos da cozinha",
    order: "o pedido",
    customers: "os clientes",
    customer: "o cliente",
    "staff admins": "os administradores",
    "staff admin": "o administrador",
    categories: "as categorias",
    category: "a categoria",
    image: "a imagem",
    "low stock products": "os produtos com stock baixo",
    "popular products": "os produtos populares",
    "sales performance": "o desempenho de vendas",
    "analytics series": "a série de análises",
    reviews: "as avaliações",
    "review reply": "a resposta à avaliação",
    "review reaction": "a reação à avaliação",
    reaction: "a reação",
    dashboard: "o painel",
    "analytics chart": "o gráfico de análises",
    "site settings": "as definições do site",
  };
  return resources[normalized] ?? resource;
}
