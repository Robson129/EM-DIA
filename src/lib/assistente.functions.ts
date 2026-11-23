import { createServerFn } from "@tanstack/react-start";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Msg = { role: "user" | "assistant"; content: string };

export const perguntarAssistente = createServerFn({ method: "POST" })
  // Só quem está logado usa o assistente: sem isso, qualquer um gastaria os créditos de IA.
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contexto: string; mensagens: Msg[] }) => {
    if (typeof d?.contexto !== "string" || !Array.isArray(d.mensagens)) throw new Error("Dados inválidos");
    return { contexto: d.contexto.slice(0, 8000), mensagens: d.mensagens.slice(-12).map((m) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: String(m.content).slice(0, 2000) })) };
  })
  .handler(async ({ data }) => {
    try {
      const r = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions:
          "Você é o assistente financeiro do app Em Dia. Fale português do Brasil, simples, direto e acolhedor. " +
          "Ajude a pessoa a pagar as contas em dia e regularizar dívidas com o dinheiro que ela recebeu. " +
          "Priorize: contas atrasadas e essenciais (moradia, luz, água, comida), depois parcelas de dívidas, depois adiantar a dívida de maior juros ou menor saldo. " +
          "Use os valores reais abaixo, cite nomes e valores em R$, dê passos práticos e curtos. Se faltar dinheiro, sugira o que negociar.\n\nSituação atual:\n" + data.contexto,
        input: data.mensagens,
      });
      const texto = r.output
        .flatMap((o) => (o.type === "message" ? o.content : []))
        .map((c) => (c.type === "output_text" ? c.text : ""))
        .join("")
        .trim();
      return { texto: texto || "Não consegui responder agora." };
    } catch (e) {
      if (e instanceof GatewayError) {
        console.error("assistente", e.code, e.ids);
        if (e.httpStatus === 429) return { texto: "Muita gente perguntando agora. Tente de novo em instantes." };
        if (e.httpStatus === 402) return { texto: "O assistente está sem créditos no momento." };
        return { texto: "O assistente não conseguiu responder. Tente de novo." };
      }
      throw e;
    }
  });
