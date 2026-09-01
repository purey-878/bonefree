# Encerramento e conservação de dados

Este documento descreve a operação técnica do encerramento de organizações. Não substitui aconselhamento jurídico. O DPA, o contrato, a matriz de retenção e as obrigações fiscais devem ser validados por advogado ou DPO em Portugal.

## Prazo de encerramento

O prazo usa uma variável positiva, com padrão de 30 dias:

```env
CANCELLATION_NOTICE_DAYS=30
```

`access_expires_at` é a única data persistida que governa o acesso:

- sem prazo ou antes de `access_expires_at`: funcionamento normal;
- no instante de `access_expires_at` e depois: domínio não suportado e todo o acesso bloqueado;
- depois do purge manual: dados operacionais eliminados e `purged_at` preenchido.

O bloqueio é calculado em cada pedido e não depende do worker. O worker envia notificações, prepara cópias solicitadas e remove ficheiros temporários expirados.

## Iniciar ou cancelar o encerramento

Quando a organização comunicar o cancelamento:

```bash
python -m scripts.manage_organizations organization cancel-access --slug bonefree
```

O comando define `access_expires_at` usando `CANCELLATION_NOTICE_DAYS`, envia o aviso inicial e é idempotente. Até essa data, loja, contas, pedidos, painel e cópias dos dados continuam funcionando normalmente.

Para substituir deliberadamente uma data existente antes do vencimento:

```bash
python -m scripts.manage_organizations organization cancel-access --slug bonefree --replace --confirm bonefree
```

Para cancelar o encerramento antes do prazo:

```bash
python -m scripts.manage_organizations organization restore-access --slug bonefree
```

Depois do vencimento, a organização não pode ser restaurada.

## Cópias e notificações

Durante o funcionamento normal, o owner pode usar `/admin/dashboard?tab=privacy` para gerar cópias de clientes, pedidos, catálogo, imagens ou de toda a organização.

- Os ficheiros ficam numa área privada, fora de `/uploads`.
- Downloads exigem uma sessão owner válida e usam `Cache-Control: private, no-store`.
- Cada seleção respeita o limite de 24 horas.
- Cópias pendentes podem ser canceladas e cópias prontas podem ser eliminadas.
- Os e-mails nunca contêm ficheiros anexados.

O worker recomendado é:

```bash
python -m scripts.process_data_exports --watch --all
```

Ele envia o aviso inicial, os lembretes de sete dias e um dia e a confirmação final. O bloqueio continua ocorrendo no prazo mesmo que o worker não esteja em execução.

## Vencimento, hospedagem e purge

No vencimento, resolução de domínio, loja, login, registo, pedidos, painel, APIs e downloads retornam indisponível. Tokens antigos deixam de funcionar porque toda dependência de tenant valida `access_expires_at`.

Consulte os hostnames que devem ser removidos do provedor:

```bash
python -m scripts.manage_organizations hosting-plan --format json
```

Um hostname vencido aparece como `detached`. Removê-lo da allowlist, certificado ou configuração do provedor continua sendo uma ação manual. Enquanto o host estático ainda aceitar o hostname, o HTML pode começar a carregar, mas a API não revela nem fornece dados da organização.

Depois do prazo, consulte o plano de eliminação:

```bash
python -m scripts.manage_organizations organization purge-plan --slug bonefree
```

O purge não exige que o owner tenha gerado ou baixado uma cópia. Ele exige o fim do prazo e o registo dos avisos inicial e final. Depois da revisão:

```bash
python -m scripts.manage_organizations organization purge --slug bonefree --confirm bonefree
```

Após `purged_at`, a organização não pode ser restaurada.
