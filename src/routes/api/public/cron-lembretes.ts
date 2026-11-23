import { createFileRoute } from "@tanstack/react-router";
import { agendaDe, diasAte, lembretesDe, normalizarContas, normalizarDividas } from "@/lib/finance";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Data de "hoje" no horário de Brasília (UTC-3), para o lembrete bater com o dia do usuário. */
function hojeBrasil() {
  return new Date(Date.now() - 3 * 3_600_000);
}

function mesDe(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Aceita a chamada do agendador da Vercel (Authorization: Bearer $CRON_SECRET).
 * LOVABLE_CRON_SECRET continua valendo para quem ainda roda no Lovable.
 */
async function autenticar(request: Request): Promise<Response | null> {
  const segredos = [process.env["CRON_SECRET"], process.env["LOVABLE_CRON_SECRET"]].filter((s): s is string => !!s);
  if (!segredos.length) return new Response("Server configuration error", { status: 500 });
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  const ok = segredos.some((s) => timingSafeEqual(digest(token), digest(s)));
  return ok ? null : new Response("Unauthorized", { status: 401 });
}

async function rodar() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { enviarAviso } = await import("@/lib/fcm.server");
  const { data: linhas, error } = await supabaseAdmin
    .from("dados_usuario")
    .select("user_id, contas, dividas, push_tokens");
  if (error) throw new Error(`Falha ao ler dados: ${error.message}`);

  const hoje = hojeBrasil();
  const mes = mesDe(hoje);
  let enviados = 0;
  let removidos = 0;

  for (const linha of linhas ?? []) {
    const tokens = (Array.isArray(linha.push_tokens) ? linha.push_tokens : []).filter(
      (t): t is string => typeof t === "string",
    );
    if (!tokens.length) continue;

    const contas = normalizarContas(linha.contas, mes);
    const dividas = normalizarDividas(linha.dividas, mes);
    const pendentes = lembretesDe(agendaDe(contas, dividas, mes), hoje);
    if (!pendentes.length) continue;

    const total = pendentes.reduce((s, p) => s + p.valor, 0);
    const nomes = pendentes.slice(0, 3).map((p) => p.nome).join(", ");
    const titulo = pendentes.some((p) => diasAte(p.data, hoje) < 0)
      ? "Em Dia — tem conta pedindo atenção"
      : "Em Dia — contas de hoje";
    const corpo = `${pendentes.length} ${pendentes.length === 1 ? "pagamento em aberto" : "pagamentos em aberto"} (${brl(total)}): ${nomes}${pendentes.length > 3 ? "…" : ""}`;

    const vivos: string[] = [];
    for (const token of tokens) {
      try {
        const r = await enviarAviso(token, titulo, corpo);
        if (r.ok) {
          enviados++;
          vivos.push(token);
        } else {
          console.error(`FCM falhou [${r.status}]: ${r.corpoErro}`);
          if (!r.apagar) vivos.push(token);
          else removidos++;
        }
      } catch (e) {
        console.error("FCM erro", e);
        vivos.push(token);
      }
    }
    if (vivos.length !== tokens.length) {
      await supabaseAdmin
        .from("dados_usuario")
        .update({ push_tokens: vivos as never })
        .eq("user_id", linha.user_id);
    }
  }

  return { ok: true, enviados, removidos, usuarios: linhas?.length ?? 0 };
}

export const Route = createFileRoute("/api/public/cron-lembretes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const negado = await autenticar(request);
        if (negado) return negado;
        return Response.json(await rodar());
      },
      POST: async ({ request }) => {
        const negado = await autenticar(request);
        if (negado) return negado;
        return Response.json(await rodar());
      },
    },
  },
});
