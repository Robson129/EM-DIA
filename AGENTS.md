## Hospedagem e serviços

Esta branch roda fora do Lovable: site na Vercel, banco e login na Supabase do próprio dono,
assistente na API da Anthropic e avisos direto no Firebase Cloud Messaging.

- **Banco.** O esquema fica em `supabase/migrations/`. Mudança de esquema = nova migração ali
  (nunca editar uma já aplicada). `src/integrations/supabase/types.ts` deve acompanhar o esquema.
- **Segredos.** Só nas variáveis de ambiente da Vercel, nunca no repositório:
  `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` (JSON inteiro da
  conta de serviço) e `CRON_SECRET`. O `.env` só tem valores públicos.
- **Assistente.** Chamadas de IA ficam no servidor (`src/lib/assistente.functions.ts`), exigem
  login e usam `ANTHROPIC_MODEL` (padrão `claude-sonnet-5-5`).
- **Avisos.** O cron da Vercel (`vercel.json`) chama `/api/public/cron-lembretes` uma vez por dia
  com `Authorization: Bearer $CRON_SECRET`; o envio fica em `src/lib/fcm.server.ts`.

## Rules

- The payment agenda in `src/lib/finance.ts` (`agendaDe`) is the single source of truth for "what to pay": any screen that answers that question must read from it, never recompute due dates on its own.
- Paid occurrences are tracked per month: `Conta.pagas` is a count per "YYYY-MM" and `Divida.pagos` is the list of amounts paid per "YYYY-MM" (`saldo` is always the current balance, already net of every payment). Pay and undo go through `marcarPago` / `desfazerUltimo` in `finance.ts`, which only accept the oldest unpaid occurrence of an item; never let the UI mark an arbitrary occurrence paid.
- Data saved by older versions (`pagas` as a plain number) is converted on load by `normalizarContas` / `normalizarDividas`; anything that reads `dados_usuario` (hook, cron) must pass it through them.
- User data (contas/dividas/receitas) lives in one jsonb row per user in public.dados_usuario via src/hooks/use-dados-nuvem.ts; it also imports old localStorage data on first login.
- Home-screen installation uses a manifest and PNG icons only; do not add app-shell caching without an explicit offline request, and keep the Firebase messaging worker separate to preserve notifications and preview freshness.
