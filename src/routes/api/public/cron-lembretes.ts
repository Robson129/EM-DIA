import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { agendaDe, diasAte, lembretesDe, type Conta, type Divida } from "@/lib/finance";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Data de "hoje" no horário de Brasília (UTC-3), para o lembrete bater com o dia do usuário. */
function hojeBrasil() {
  return new Date(Date.now() - 3 * 3_600_000);
}

function mesDe(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function enviarAviso(token: string, titulo: string, corpo: string) {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const connectionApiKey = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!LOVABLE_API_KEY || !connectionApiKey) {
    throw new Error("Chaves do aviso não configuradas");
  }
  const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": connectionApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: titulo, body: corpo },
        data: { path: "/" },
      },
    }),
  });
  if (!res.ok) {
    const corpoErro = await res.text();
    // 404 UNREGISTERED / 400 INVALID_ARGUMENT: token velho, apagar em vez de tentar de novo.
    return { ok: false as const, apagar: res.status === 404 || res.status === 400, status: res.status, corpoErro };
  }
  return { ok: true as const };
}

async function rodar() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

    const contas = (linha.contas ?? []) as unknown as Conta[];
    const dividas = (linha.dividas ?? []) as unknown as Divida[];
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
        const negado = await authenticateCronRequest(request);
        if (negado) return negado;
        return Response.json(await rodar());
      },
      POST: async ({ request }) => {
        const negado = await authenticateCronRequest(request);
        if (negado) return negado;
        return Response.json(await rodar());
      },
    },
  },
});
