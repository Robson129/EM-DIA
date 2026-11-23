import { useState } from "react";
import { perguntarAssistente } from "@/lib/assistente.functions";

type Msg = { role: "user" | "assistant"; content: string };
const SUGESTOES = ["O que eu pago primeiro?", "Não vai dar para pagar tudo, o que eu faço?", "Qual dívida eu quito antes?"];

export function Assistente({ contexto }: { contexto: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [txt, setTxt] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || carregando) return;
    const novas: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(novas); setTxt(""); setCarregando(true);
    try {
      const r = await perguntarAssistente({ data: { contexto, mensagens: novas } });
      setMsgs([...novas, { role: "assistant", content: r.texto }]);
    } catch {
      setMsgs([...novas, { role: "assistant", content: "Não consegui responder agora. Tente de novo." }]);
    } finally { setCarregando(false); }
  }

  return (
    <section className="mb-8 rounded-2xl border border-primary/30 bg-card p-5 shadow-lg">
      <h2 className="font-display text-2xl font-bold text-primary">✨ Assistente Em Dia</h2>
      <p className="mb-4 text-sm text-muted-foreground">Pergunte o que quiser sobre suas contas e dívidas. Ele vê o que você cadastrou.</p>
      <div className="mb-3 max-h-96 space-y-3 overflow-y-auto">
        {msgs.map((m, i) => (
          <div key={i} className={`whitespace-pre-wrap rounded-xl p-3 text-sm ${m.role === "user" ? "ml-auto max-w-[80%] bg-primary text-primary-foreground" : "max-w-[90%] bg-muted"}`}>{m.content}</div>
        ))}
        {carregando && <div className="max-w-[90%] rounded-xl bg-muted p-3 text-sm text-muted-foreground">Pensando…</div>}
      </div>
      {!msgs.length && (
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button key={s} onClick={() => enviar(s)} className="rounded-full border border-primary/40 px-3 py-1 text-sm text-primary hover:bg-primary/10">{s}</button>
          ))}
        </div>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void enviar(txt); }}>
        <input className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="Ex: recebi R$ 1.500, como divido?" value={txt} onChange={(e) => setTxt(e.target.value)} />
        <button disabled={carregando} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Enviar</button>
      </form>
    </section>
  );
}
