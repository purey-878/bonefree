# Encerramento e devolução de dados

Este documento descreve a operação técnica do encerramento de organizações. Não substitui aconselhamento jurídico. O DPA, o contrato, a matriz de retenção e as obrigações fiscais devem ser validados por advogado ou DPO em Portugal.

## Prazos configuráveis

O ciclo usa dois valores positivos, ambos com padrão de 30 dias:

```env
CANCELLATION_NOTICE_DAYS=30
DATA_ACCESS_WINDOW_DAYS=30
```

`access_expires_at` é a única data persistida que governa o ciclo. O estado é calculado em cada pedido:

- antes de `access_expires_at`: funcionamento normal;
- de `access_expires_at` até `access_expires_at + DATA_ACCESS_WINDOW_DAYS`: acesso restrito aos dados;
- depois da segunda data: domínio não suportado e marcado como `detached` no relatório de hospedagem.

O bloqueio não depende do worker. O worker envia notificações, prepara cópias e remove ficheiros expirados.

## Um único frontend e o mesmo domínio

Na pasta `frontend`, execute somente:

```bash
npm run build
```

O artefacto `dist/` atende todos os hostnames aceites pela allowlist. Organizações operacionais recebem a loja e o painel normal. Organizações no período restrito recebem uma página pública de encerramento; `/admin/login` e `/admin/dashboard` permanecem disponíveis somente para o owner com palavra-passe e OTP.

Não existe um domínio de portal, finalidade especial de domínio ou segundo build. O login usa `window.location.hostname`; a API confere o `Origin`, o domínio verificado, o tenant e o prazo.

Gere a fonte de verdade para a hospedagem com:

```bash
cd backend
python -m scripts.manage_organizations hosting-plan --format json
```

Hostnames com estado `detached` devem ser removidos manualmente da allowlist, do certificado ou da configuração do provedor. Enquanto permanecerem cadastrados no host estático, o HTML pode começar a carregar antes de a API devolver `404`.

## Iniciar o encerramento

Quando a organização comunicar o cancelamento:

```bash
python -m scripts.manage_organizations organization cancel-access --slug bonefree
```

O comando define `access_expires_at` usando `CANCELLATION_NOTICE_DAYS`, envia o aviso inicial e é idempotente. Executá-lo novamente não altera a data.

Para substituir deliberadamente uma data existente:

```bash
python -m scripts.manage_organizations organization cancel-access --slug bonefree --replace --confirm bonefree
```

Para congelamento imediato por fraude, segurança ou incumprimento grave:

```bash
python -m scripts.manage_organizations organization freeze-now --slug bonefree --confirm bonefree
```

O congelamento imediato revoga sessões operacionais. Mesmo sem o worker, todas as dependências operacionais consultam o prazo e bloqueiam loja, contas, pedidos e CRUD administrativo.

## Período restrito

Durante a segunda janela:

- todas as rotas públicas mostram que o site já não está disponível;
- somente o owner entra em `/admin/login` com e-mail, palavra-passe e OTP;
- clientes ficam disponíveis apenas para consulta e exportação individual;
- “Dados e privacidade” permite cópias de clientes, pedidos, catálogo, imagens ou de toda a organização;
- downloads exigem a sessão restrita, ficam fora de `/uploads` e usam `Cache-Control: private, no-store`;
- o owner pode cancelar uma preparação ou eliminar uma cópia pronta; o ZIP privado e qualquer ficheiro temporário são removidos, mas o limite de 24 horas continua válido;
- o DNS deve continuar apontado até o owner terminar os downloads.

O worker recomendado é:

```bash
python -m scripts.process_data_exports --watch --all
```

Os e-mails nunca contêm ficheiros anexados.

## Restaurar e eliminar

Uma organização ainda não eliminada pode voltar ao funcionamento normal:

```bash
python -m scripts.manage_organizations organization restore-access --slug bonefree
```

Depois do período restrito, consulte o plano de eliminação:

```bash
python -m scripts.manage_organizations organization purge-plan --slug bonefree
```

O purge exige o fim da janela, cópia integral concluída e notificações registadas. Depois da revisão:

```bash
python -m scripts.manage_organizations organization purge --slug bonefree --confirm bonefree
```

Após `purged_at`, a organização não pode ser restaurada. A remoção definitiva do hostname no provedor continua sendo uma ação manual enquanto não existir integração com a API de hospedagem.
