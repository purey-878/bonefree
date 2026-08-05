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
  "Unable to delete product. Please try again.": "Não foi possível eliminar o produto. Tente novamente.",
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
  "Order refunded successfully.": "Pedido reembolsado com sucesso.",
  "Unable to refund order.": "Não foi possível reembolsar o pedido.",
  "Refund export downloaded.": "Exportação dos reembolsos descarregada.",
  "Unable to export refunds.": "Não foi possível exportar os reembolsos.",
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
  "Review reply deleted successfully.": "Resposta à avaliação eliminada com sucesso.",
  "Unable to delete review reply.": "Não foi possível eliminar a resposta à avaliação.",
  "Admin session not loaded.": "Sessão de administrador não carregada.",
  "Review reaction removed.": "Reação à avaliação removida.",
  "Review reaction updated.": "Reação à avaliação atualizada.",
  "Unable to update review reaction.": "Não foi possível atualizar a reação à avaliação.",
  "Choose a purchased item to review.": "Escolha um item comprado para avaliar.",
  "You already reviewed this product. Edit your existing review instead.": "Já avaliou este produto. Edite a sua avaliação existente.",
}

export function translateUserMessage(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return trimmed

  const exact = EXACT_MESSAGE_TRANSLATIONS[trimmed]
  if (exact) return exact

  const failedAction = trimmed.match(/^Failed to (fetch|load|update|save|create|delete|deactivate|reactivate|restore|remove|upload|export|refund|mark)\s+(.+?)\.?$/i)
  if (failedAction?.[1] && failedAction?.[2]) {
    return `${failedActionPrefix(failedAction[1])} ${translatedResource(failedAction[2])}.`
  }

  const unableAction = trimmed.match(/^Unable to (save|delete|restore|deactivate|activate|update|mark|refund|export|reactivate)\s+(.+?)\.?$/i)
  if (unableAction?.[1] && unableAction?.[2]) {
    return `${unableActionPrefix(unableAction[1])} ${translatedResource(unableAction[2])}.`
  }

  const outOfStock = trimmed.match(/^(.+?)\s+is out of stock\.?$/i)
  if (outOfStock?.[1]) {
    return `${outOfStock[1]} está esgotado.`
  }

  const onlyHasStock = trimmed.match(/^(.+?)\s+only has\s+(\d+)\s+in stock\.?$/i)
  if (onlyHasStock?.[1] && onlyHasStock?.[2]) {
    return `${onlyHasStock[1]} só tem ${onlyHasStock[2]} em stock.`
  }

  const couldNotBeAdded = trimmed.match(/^(.+?)\s+could not be added\.?$/i)
  if (couldNotBeAdded?.[1]) {
    return `${couldNotBeAdded[1]} não pôde ser adicionado.`
  }

  const addedItems = trimmed.match(/^Added\s+(\d+)\s+items?\s+to cart\.?$/i)
  if (addedItems?.[1]) {
    const count = Number(addedItems[1])
    return `${count} ${count === 1 ? "item adicionado" : "itens adicionados"} ao carrinho.`
  }

  const addedQuantity = trimmed.match(/^Added\s+(\d+)x\s+(.+?)\s+to cart\.?$/i)
  if (addedQuantity?.[1] && addedQuantity?.[2]) {
    return `${addedQuantity[1]}x ${addedQuantity[2]} adicionado ao carrinho.`
  }

  return trimmed
}

function failedActionPrefix(action: string): string {
  const normalized = action.toLowerCase()
  if (normalized === "fetch" || normalized === "load") return "Não foi possível carregar"
  if (normalized === "update") return "Não foi possível atualizar"
  if (normalized === "save") return "Não foi possível guardar"
  if (normalized === "create") return "Não foi possível criar"
  if (normalized === "delete" || normalized === "remove") return "Não foi possível remover"
  if (normalized === "deactivate") return "Não foi possível desativar"
  if (normalized === "reactivate" || normalized === "restore") return "Não foi possível restaurar"
  if (normalized === "upload") return "Não foi possível carregar"
  if (normalized === "export") return "Não foi possível exportar"
  if (normalized === "refund") return "Não foi possível reembolsar"
  if (normalized === "mark") return "Não foi possível marcar"
  return "Não foi possível processar"
}

function unableActionPrefix(action: string): string {
  return failedActionPrefix(action)
}

function translatedResource(resource: string): string {
  const normalized = resource.trim().toLowerCase()
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
    refunds: "os reembolsos",
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
  }
  return resources[normalized] ?? resource
}
