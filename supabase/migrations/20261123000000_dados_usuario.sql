-- Banco do Em Dia: uma linha por usuário com contas, dívidas e recebimentos em jsonb.
create table public.dados_usuario (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  contas jsonb not null default '[]'::jsonb,
  dividas jsonb not null default '[]'::jsonb,
  receitas jsonb not null default '[]'::jsonb,
  push_tokens jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);

grant select, insert, update, delete on public.dados_usuario to authenticated;
grant all on public.dados_usuario to service_role;
revoke all on public.dados_usuario from anon;

alter table public.dados_usuario enable row level security;

create policy "ver os seus" on public.dados_usuario
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "criar os seus" on public.dados_usuario
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "editar os seus" on public.dados_usuario
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "apagar os seus" on public.dados_usuario
  for delete to authenticated using ((select auth.uid()) = user_id);
