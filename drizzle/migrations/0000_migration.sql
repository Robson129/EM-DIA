CREATE TABLE public.dados_usuario (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  contas jsonb NOT NULL DEFAULT '[]'::jsonb,
  dividas jsonb NOT NULL DEFAULT '[]'::jsonb,
  receitas jsonb NOT NULL DEFAULT '[]'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dados_usuario TO authenticated;
GRANT ALL ON public.dados_usuario TO service_role;
ALTER TABLE public.dados_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver os seus" ON public.dados_usuario FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "criar os seus" ON public.dados_usuario FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "editar os seus" ON public.dados_usuario FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "apagar os seus" ON public.dados_usuario FOR DELETE TO authenticated USING (auth.uid() = user_id);