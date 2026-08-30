# Matriz de acesso da equipa

As permissões administrativas seguem uma progressão cumulativa: **Chef → Waiter → Manager → Owner**. Cada papel inclui as capacidades dos papéis à sua esquerda, salvo as restrições operacionais indicadas nas notas.

<style>
table { width: 108ch; max-width: 100%; table-layout: fixed; border-collapse: collapse; }
th, td { white-space: nowrap; overflow-wrap: normal; }
th:first-child, td:first-child { width: 52ch; text-align: left; }
th:not(:first-child), td:not(:first-child) { width: 14ch; text-align: center; }
.matrix-group th { padding-top: 18px; text-align: left !important; }
.matrix-icon { width: 16px; height: 16px; vertical-align: middle; }
.access-notes { max-width: 108ch; }
@media print { table, .access-notes { width: 100%; font-size: 8px; } }
</style>

<svg width="0" height="0" aria-hidden="true" focusable="false">
  <symbol id="access-check" viewBox="0 0 16 16">
    <polyline points="3,8 7,12 13,4" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter" />
  </symbol>
  <symbol id="access-deny" viewBox="0 0 16 16">
    <line x1="4" y1="4" x2="12" y2="12" stroke="#dc2626" stroke-width="3" stroke-linecap="square" />
    <line x1="12" y1="4" x2="4" y2="12" stroke="#dc2626" stroke-width="3" stroke-linecap="square" />
  </symbol>
</svg>

<table>
  <thead>
    <tr><th>Ação</th><th>Chef</th><th>Waiter</th><th>Manager</th><th>Owner</th></tr>
  </thead>
  <tbody>
    <tr class="matrix-group"><th colspan="5">Todos os papéis da equipa</th></tr>
    <tr><td>Entrar na consola administrativa</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Consultar a vista Balcão</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Consultar a vista Cozinha</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Avançar Cozinha: confirmado → preparação → pronto</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Listar produtos ativos, inativos e eliminados</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Consultar detalhe e análises de produtos</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Listar ingredientes ativos e inativos</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Consultar categorias como metadados/filtros</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Alterar disponibilidade de produto existente</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Alterar disponibilidade de ingrediente existente</td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>

    <tr class="matrix-group"><th colspan="5">Waiter, Manager e Owner</th></tr>
    <tr><td>Confirmar pagamento ao balcão</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Cancelar pedido não pago elegível no Balcão</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Entregar pedido pago e pronto no Balcão</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>

    <tr class="matrix-group"><th colspan="5">Manager e Owner</th></tr>
    <tr><td>Aceder à vista Gestão de pedidos</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Forçar qualquer estado válido na Gestão</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Eliminar permanentemente pedido cancelado</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>CRUD de produtos e respetivas imagens</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>CRUD de ingredientes</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>CRUD de categorias</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Arquivar e restaurar catálogo</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>

    <tr class="matrix-group"><th colspan="5">Exclusivo do Owner</th></tr>
    <tr><td>Consultar dashboard e análises globais</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Gerir avaliações e respostas</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Gerir clientes</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Gerir membros da equipa e respetivos papéis</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
    <tr><td>Alterar definições, promoções, cupões e eventos</td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Não" role="img"><use href="#access-deny" /></svg></td><td><svg class="matrix-icon" aria-label="Sim" role="img"><use href="#access-check" /></svg></td></tr>
  </tbody>
</table>

## Notas operacionais

<div class="access-notes">

- **Balcão do Chef:** a vista, os filtros, artigos e detalhes ficam visíveis, mas todos os botões operacionais são omitidos.
- **Cozinha:** Chef e Waiter avançam apenas a sequência operacional <code>confirmed → in_preparation → ready</code>; Manager e Owner também dispõem do controlo irrestrito na vista Gestão.
- **Balcão do Waiter:** confirmar pagamento envia o pedido diretamente para <code>confirmed</code>; entrega exige pedido pago em <code>ready</code>; cancelamento continua limitado pelas regras de pedidos não pagos.
- **Gestão:** Manager e Owner podem escolher qualquer estado válido mesmo sem pagamento confirmado e podem eliminar permanentemente apenas pedidos já cancelados.
- **Disponibilidade:** marcar disponível/indisponível não altera o estado ativo, inativo ou eliminado do registro. Chef e Waiter não podem arquivar nem restaurar.
- **Ingredientes base:** tornar um ingrediente base indisponível pode tornar automaticamente indisponíveis os produtos que dependem dele.
- O backend é a autoridade da matriz. Ocultar botões no frontend não substitui <code>require_organization_role(...)</code>, a dependência da feature da organização, o escopo automático da sessão e as validações de transição.

</div>
