import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Guarda o token de aviso deste aparelho na ficha do usuário (sem duplicar). */
export const registrarTokenPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => {
    if (typeof d?.token !== "string" || d.token.length < 20 || d.token.length > 4096) {
      throw new Error("Token inválido");
    }
    return { token: d.token };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("dados_usuario")
      .select("push_tokens")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Não consegui salvar o aviso.");

    const atuais = Array.isArray(row?.push_tokens) ? (row.push_tokens as unknown as string[]) : [];
    const tokens = [...new Set([...atuais.filter((t) => typeof t === "string"), data.token])];

    const q = row
      ? context.supabase
          .from("dados_usuario")
          .update({ push_tokens: tokens as never, atualizado_em: new Date().toISOString() })
          .eq("user_id", context.userId)
      : context.supabase
          .from("dados_usuario")
          .insert({ user_id: context.userId, contas: [] as never, dividas: [] as never, receitas: [] as never, push_tokens: tokens as never });
    const { error: e2 } = await q;
    if (e2) throw new Error("Não consegui salvar o aviso.");
    return { ok: true };
  });
