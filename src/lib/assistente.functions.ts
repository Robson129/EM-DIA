import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Msg = { role: "user" | "assistant"; content: string };

const INSTRUCOES =
  "Você é o assistente financeiro do app Em Dia. Fale português do Brasil, simples, direto e acolhedor. " +
  "Ajude a pessoa a pagar as contas em dia e regularizar dívidas com o dinheiro que ela recebeu. " +
  "Priorize: contas atrasadas e essenciais (moradia, luz, água, comida), depois parcelas de dívidas, depois adiantar a dívida de maior juros ou menor saldo. " +
  "Use os valores reais abaixo, cite nomes e valores em R$, dê passos práticos e curtos. Se faltar dinheiro, sugira o que negociar.";

/** A API da Anthropic exige que a conversa comece pela pessoa e alterne os papéis. */
function conversa(mensagens: Msg[]) {
  const out: Msg[] = [];
  for (const m of mensagens) {
    if (!out.length && m.role !== "user") continue;
    const ultima = out[out.length - 1];
    if (ultima && ultima.role === m.role) ultima.content += "\n\n" + m.content;
    else out.push({ ...m });
  }
  return out;
}

export const perguntarAssistente = createServerFn({ method: "POST" })
  // Só quem está logado usa o assistente: sem isso, qualquer um gastaria os créditos de IA.
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contexto: string; mensagens: Msg[] }) => {
    if (typeof d?.contexto !== "string" || !Array.isArray(d.mensagens)) throw new Error("Dados inválidos");
    return { contexto: d.contexto.slice(0, 8000), mensagens: d.mensagens.slice(-12).map((m) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: String(m.content).slice(0, 2000) })) };
  })
  .handler(async ({ data }) => {
    const chave = process.env["ANTHROPIC_API_KEY"];
    if (!chave) {
      console.error("assistente: ANTHROPIC_API_KEY não configurada");
      return { texto: "O assistente ainda não foi configurado." };
    }
    const mensagens = conversa(data.mensagens);
    if (!mensagens.length) return { texto: "Pode perguntar!" };

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": chave,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env["ANTHROPIC_MODEL"] || "claude-sonnet-5-5",
          max_tokens: 1024,
          system: `${INSTRUCOES}\n\nSituação atual:\n${data.contexto}`,
          messages: mensagens,
        }),
      });
      if (!res.ok) {
        console.error("assistente", res.status, await res.text());
        if (res.status === 429 || res.status === 529) return { texto: "Muita gente perguntando agora. Tente de novo em instantes." };
        if (res.status === 401 || res.status === 403) return { texto: "O assistente está com a chave de acesso inválida." };
        return { texto: "O assistente não conseguiu responder. Tente de novo." };
      }
      const r = (await res.json()) as { content?: { type: string; text?: string }[] };
      const texto = (r.content ?? [])
        .map((c) => (c.type === "text" ? c.text ?? "" : ""))
        .join("")
        .trim();
      return { texto: texto || "Não consegui responder agora." };
    } catch (e) {
      console.error("assistente", e);
      return { texto: "O assistente não conseguiu responder. Tente de novo." };
    }
  });
