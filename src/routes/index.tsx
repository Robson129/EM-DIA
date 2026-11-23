import { Assistente } from "@/components/Assistente";
import { Entrar } from "@/components/Entrar";
import { supabase } from "@/integrations/supabase/client";
import { useDadosNuvem } from "@/hooks/use-dados-nuvem";
import { enablePush } from "@/lib/push";
import { registrarTokenPush } from "@/lib/push.functions";
import type { Session } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FREQ_LABEL,
  agendaDe,
  dataLocalISO,
  desfazerUltimo,
  diasAte,
  marcarPago,
  mesDe,
  pagasNoMes,
  pagosNoMes,
  planejar,
  resumoDe,
  urgenciaDe,
  vezDe,
  vezDoItem,
  type Conta,
  type Divida,
  type Freq,
  type Pagamento,
} from "@/lib/finance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Em Dia — o que pagar primeiro este mês" },
      { name: "description", content: "Cadastre contas e dívidas, lance o que recebeu e veja na hora o que precisa pagar, o que atrasou e quanto falta." },
      { property: "og:title", content: "Em Dia — o que pagar primeiro" },
      { property: "og:description", content: "Um plano simples para pagar contas em dia e quitar dívidas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));
const mesAtual = () => mesDe(new Date());
const dia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function rotuloMes(mes: string) {
  const partes = mes.split("-");
  const d = new Date(Number(partes[0] ?? 1970), Number(partes[1] ?? 1) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const btn = "rounded-lg bg-linear-to-br from-primary to-primary-glow px-4 py-2 text-sm font-semibold text-primary-foreground shadow-viva transition hover:opacity-90";
const btnSm = "rounded-lg bg-linear-to-br from-primary to-primary-glow px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-viva transition hover:opacity-90 disabled:opacity-40";

function Card({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {right ? <span className="text-xs text-muted-foreground">{right}</span> : null}
      </div>
      {children}
    </section>
  );
}

function FreqSelect({ value, onChange }: { value: Freq; onChange: (f: Freq) => void }) {
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value as Freq)}>
      {(Object.keys(FREQ_LABEL) as Freq[]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
    </select>
  );
}

function Pill({ p, hoje }: { p: Pagamento; hoje: Date | null }) {
  if (p.pago) return <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-success">pago</span>;
  if (!hoje) return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">—</span>;
  const n = diasAte(p.data, hoje);
  if (n < 0) return <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-destructive-foreground">atrasada</span>;
  if (n === 0) return <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-foreground">vence hoje</span>;
  return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">em {n} {n === 1 ? "dia" : "dias"}</span>;
}

function Linha({ p, hoje, vez, onPagar }: { p: Pagamento; hoje: Date | null; vez: boolean; onPagar: (p: Pagamento) => void }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${p.pago ? "border-success/30 bg-success/8" : "border-border bg-background"}`}>
      <Pill p={p} hoje={hoje} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${p.pago ? "text-muted-foreground line-through" : ""}`}>{p.nome}</p>
        <p className="text-xs text-muted-foreground">
          {p.tipo === "conta" ? "conta" : "parcela de dívida"} · {dia(p.data)} · {brl(p.valor)}
        </p>
      </div>
      {vez ? <button className={btnSm} onClick={() => onPagar(p)}>Paguei</button> : null}
    </li>
  );
}

function PainelPagar({
  contas, dividas, mes, hoje, renda, onPagar,
}: {
  contas: Conta[]; dividas: Divida[]; mes: string; hoje: Date | null; renda: number; onPagar: (p: Pagamento) => void;
}) {
  const pags = useMemo(() => agendaDe(contas, dividas, mes), [contas, dividas, mes]);
  const vez = useMemo(() => vezDe(pags), [pags]);
  const r = resumoDe(pags, renda);
  const alvo = r.pendente[0];
  const atrasadas = hoje ? r.pendente.filter((p) => urgenciaDe(p.data, hoje) === "atrasada") : [];
  const totalAtrasado = atrasadas.reduce((s, p) => s + p.valor, 0);
  const n = hoje && alvo ? diasAte(alvo.data, hoje) : 0;
  const rotuloAlvo = !hoje || !alvo
    ? ""
    : n < 0 ? `atrasou ${Math.abs(n)} ${Math.abs(n) === 1 ? "dia" : "dias"}`
    : n === 0 ? "vence hoje"
    : `em ${n} ${n === 1 ? "dia" : "dias"}`;

  return (
    <section className="mb-6 rounded-3xl border-2 border-primary/30 bg-card p-5 shadow-viva sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-bold">O que você precisa pagar</h2>
        <span className="text-sm text-muted-foreground">{rotuloMes(mes)}</span>
      </div>

      {!pags.length ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          Nada por aqui ainda. Cadastre suas contas e dívidas abaixo que a lista de pagamentos aparece sozinha.
        </p>
      ) : (
        <>
          {alvo ? (
            <div className={`rounded-2xl p-4 text-primary-foreground shadow-viva ${atrasadas.length ? "bg-linear-to-br from-destructive via-destructive to-primary" : "bg-linear-to-br from-primary via-primary to-primary-glow"}`}>
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">
                {atrasadas.length
                  ? `${atrasadas.length} ${atrasadas.length === 1 ? "pagamento atrasado" : "pagamentos atrasados"} · ${brl(totalAtrasado)}`
                  : "Pague agora"}
              </p>
              <p className="font-display text-3xl font-extrabold leading-tight">{alvo.nome}</p>
              <p className="text-sm opacity-90">
                {brl(alvo.valor)} · vence {dia(alvo.data)}
                {rotuloAlvo ? ` · ${rotuloAlvo}` : ""}
                {` · ainda ${brl(r.aPagar)} para pagar`}
              </p>
              <button
                className="mt-3 rounded-lg bg-primary-foreground/15 px-4 py-2 text-sm font-semibold text-primary-foreground ring-1 ring-primary-foreground/40 hover:bg-primary-foreground/25"
                onClick={() => onPagar(alvo)}
              >
                Já paguei {alvo.nome}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-success/12 p-4 text-success">
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">Situação</p>
              <p className="font-display text-2xl font-extrabold">Tudo pago neste mês ✓</p>
              <p className="text-sm opacity-90">Sobraram {brl(r.sobra)} para adiantar uma dívida.</p>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {([
              ["Recebido no mês", renda, "text-accent-2", "border-t-accent-2"],
              ["Já paguei", r.jaPago, "text-success", "border-t-success"],
              ["Ainda falta pagar", r.aPagar, "text-primary", "border-t-primary"],
              [r.falta > 0 ? "Falta para cobrir" : "Sobra livre", r.falta > 0 ? r.falta : r.sobra, r.falta > 0 ? "text-destructive" : "text-success", r.falta > 0 ? "border-t-destructive" : "border-t-success"],
            ] as [string, number, string, string][]).map(([l, v, cor, marca]) => (
              <div key={l} className={`rounded-xl border border-border border-t-4 bg-background p-3 ${marca}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</p>
                <p className={`font-display text-xl font-bold ${cor}`}>{brl(v)}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-destructive/45 bg-destructive/8 p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1 px-1">
                <h3 className="font-display text-lg font-bold text-destructive">Não pagos</h3>
                <span className="text-xs font-semibold text-muted-foreground">
                  {r.pendente.length} {r.pendente.length === 1 ? "pagamento" : "pagamentos"} · {brl(r.aPagar)}
                </span>
              </div>
              <ul className="space-y-2">
                {r.pendente.map((p) => (
                  <Linha key={p.id} p={p} hoje={hoje} vez={vez.get(p.refId) === p.id} onPagar={onPagar} />
                ))}
                {!r.pendente.length && (
                  <li className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                    Nada em aberto. Pode adiantar uma dívida com o que sobrou.
                  </li>
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-success/45 bg-success/8 p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1 px-1">
                <h3 className="font-display text-lg font-bold text-success">Pagos</h3>
                <span className="text-xs font-semibold text-muted-foreground">
                  {r.pago.length} {r.pago.length === 1 ? "pagamento" : "pagamentos"} · {brl(r.jaPago)}
                </span>
              </div>
              <ul className="space-y-2">
                {r.pago.map((p) => <Linha key={p.id} p={p} hoje={hoje} vez={false} onPagar={onPagar} />)}
                {!r.pago.length && (
                  <li className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                    Você ainda não marcou nenhum pagamento neste mês.
                  </li>
                )}
              </ul>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            A lista segue a ordem de vencimento. O botão aparece na parcela mais antiga de cada conta ou dívida.
          </p>
        </>
      )}
    </section>
  );
}

type EstadoAviso = "parado" | "ativando" | "ativo" | "nova-aba" | "negado" | "sem-config" | "sem-suporte" | "erro";

const MSG_AVISO: Record<Exclude<EstadoAviso, "parado" | "ativando" | "ativo">, string> = {
  "nova-aba": "Abra o app em uma aba própria (fora da pré-visualização) para ativar os avisos.",
  negado: "Seu navegador bloqueou os avisos. Libere nas configurações do site e tente de novo.",
  "sem-config": "Falta terminar a configuração do Firebase (a parte de web push).",
  "sem-suporte": "Este navegador não aceita avisos.",
  erro: "Não consegui ativar. Verifique a internet e tente de novo.",
};

function BotaoAvisos() {
  const [estado, setEstado] = useState<EstadoAviso>("parado");

  async function ativar() {
    setEstado("ativando");
    try {
      const r = await enablePush();
      if (r.status === "registered") {
        await registrarTokenPush({ data: { token: r.token } });
        setEstado("ativo");
      } else if (r.status === "open-in-new-tab") setEstado("nova-aba");
      else if (r.status === "denied") setEstado("negado");
      else if (r.status === "not-configured") setEstado("sem-config");
      else setEstado("sem-suporte");
    } catch {
      setEstado("erro");
    }
  }

  const msg = estado in MSG_AVISO ? MSG_AVISO[estado as keyof typeof MSG_AVISO] : null;
  return (
    <div className="text-right">
      <button
        className={btnSm}
        disabled={estado === "ativando" || estado === "ativo"}
        onClick={ativar}
      >
        {estado === "ativo" ? "🔔 Avisos ativos ✓" : estado === "ativando" ? "Ativando…" : "🔔 Ativar avisos"}
      </button>
      {msg ? <p className="mt-1 max-w-56 text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}

function Index() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    supabase.auth.getSession().then(({ data: d }) => setSessao(d.session));
    return () => data.subscription.unsubscribe();
  }, []);
  if (sessao === undefined) return <main className="p-10 text-center text-muted-foreground">Carregando…</main>;
  if (!sessao) return <Entrar />;
  return <Painel userId={sessao.user.id} email={sessao.user.email ?? ""} />;
}

function Painel({ userId, email }: { userId: string; email: string }) {
  const { contas, dividas, receitas, setContas, setDividas, setReceitas, setContasEDividas, carregado, erro } = useDadosNuvem(userId);
  const [mes, setMes] = useState(mesAtual);
  const [hoje, setHoje] = useState<Date | null>(null);

  useEffect(() => { setHoje(new Date()); }, []);

  const [c, setC] = useState({ nome: "", valor: "", dia: "10", freq: "mensal" as Freq });
  const [d, setD] = useState({ nome: "", saldo: "", parcela: "", dia: "10", freq: "mensal" as Freq });
  const [r, setR] = useState({ descricao: "", valor: "", data: dataLocalISO(new Date()) });

  const doMes = receitas.filter((x) => x.data.startsWith(mes));
  const renda = doMes.reduce((s, x) => s + x.valor, 0);
  const agenda = useMemo(() => agendaDe(contas, dividas, mes), [contas, dividas, mes]);
  const dinheiro = resumoDe(agenda, renda).dinheiro;
  const plano = useMemo(() => planejar(contas, dividas, dinheiro, mes), [contas, dividas, dinheiro, mes]);
  const totalDividas = dividas.reduce((s, x) => s + x.saldo, 0);

  const contextoIA = useMemo(() => {
    const ag = agenda;
    const res = resumoDe(ag, renda);
    const d = (x: Date) => x.toLocaleDateString("pt-BR");
    return [
      `Hoje: ${hoje ? d(hoje) : "?"}. Mês: ${mes}.`,
      `Recebido no mês: ${brl(renda)} (${doMes.map((x) => `${x.descricao} ${brl(x.valor)}`).join("; ") || "nada"}).`,
      `Total a pagar em aberto: ${brl(res.aPagar)}. Já pago: ${brl(res.jaPago)}.`,
      "Pagamentos do mês:",
      ...ag.map((p) => `- ${p.nome} (${p.tipo}) ${brl(p.valor)} vence ${d(p.data)} — ${p.pago ? "PAGO" : hoje && diasAte(p.data, hoje) < 0 ? "ATRASADO" : hoje && diasAte(p.data, hoje) === 0 ? "VENCE HOJE" : "em aberto"}`),
      "Dívidas:",
      ...dividas.map((x) => `- ${x.nome}: saldo ${brl(x.saldo)}, parcela ${brl(x.parcela)} ${x.freq}`),
    ].join("\n");
  }, [agenda, dividas, mes, renda, hoje, doMes]);

  function pagarAgora(p: Pagamento) {
    const r = marcarPago(contas, dividas, p);
    setContasEDividas(r.contas, r.dividas);
  }

  function desfazer(refId: string) {
    const r = desfazerUltimo(contas, dividas, refId, mes);
    setContasEDividas(r.contas, r.dividas);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="bg-linear-to-r from-primary via-primary-glow to-accent bg-clip-text font-display text-5xl font-extrabold text-transparent">Em Dia</h1>
          <p className="text-muted-foreground">Suas contas pagas no prazo, suas dívidas indo embora.</p>
        </div>
        <div className="flex items-end gap-3">
        <BotaoAvisos />
        <div className="text-right text-xs text-muted-foreground">{email}<br /><button className="text-primary underline" onClick={() => supabase.auth.signOut()}>Sair</button></div>
        <label className="text-sm">Mês
          <input type="month" className={input} value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
        </div>
      </header>
      {erro && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
      {!carregado && !erro && <p className="mb-4 text-sm text-muted-foreground">Carregando suas contas…</p>}

      <PainelPagar contas={contas} dividas={dividas} mes={mes} hoje={hoje} renda={renda} onPagar={pagarAgora} />

      <Assistente contexto={contextoIA} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="1. O que recebi">
          <form className="mb-4 grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); const v = parseFloat(r.valor); if (!v) return; setReceitas([...receitas, { id: uid(), descricao: r.descricao || "Recebimento", valor: v, data: r.data }]); setR({ ...r, descricao: "", valor: "" }); }}>
            <input className={input} placeholder="Ex: salário, freela" value={r.descricao} onChange={(e) => setR({ ...r, descricao: e.target.value })} />
            <input className={input} type="number" step="0.01" placeholder="Valor" value={r.valor} onChange={(e) => setR({ ...r, valor: e.target.value })} />
            <input className={input} type="date" value={r.data} onChange={(e) => setR({ ...r, data: e.target.value })} />
            <button className={btn}>Adicionar</button>
          </form>
          <ul className="divide-y divide-border text-sm">
            {doMes.map((x) => (
              <li key={x.id} className="flex justify-between py-2">
                <span>{x.descricao} <span className="text-muted-foreground">· {x.data.split("-").reverse().join("/")}</span></span>
                <span className="flex gap-3"><b>{brl(x.valor)}</b><button className="text-destructive" onClick={() => setReceitas(receitas.filter((y) => y.id !== x.id))}>×</button></span>
              </li>
            ))}
            {!doMes.length && <li className="py-2 text-muted-foreground">Nada lançado neste mês ainda.</li>}
          </ul>
        </Card>

        <Card title="Como o dinheiro se distribui" className="border-primary">
          <ul className="space-y-2 text-sm">
            {plano.itens.map((i) => {
              const ok = i.alocado >= i.necessario && i.necessario > 0;
              return (
                <li key={i.id} className="rounded-lg bg-muted p-3">
                  <div className="flex justify-between">
                    <span className="font-semibold">{i.tipo === "conta" ? "📄" : i.tipo === "divida" ? "💳" : "🚀"} {i.nome}</span>
                    <span>{brl(i.alocado)} <span className="text-muted-foreground">/ {brl(i.necessario)}</span></span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${ok ? "bg-linear-to-r from-success to-accent-2" : "bg-linear-to-r from-accent to-destructive"}`} style={{ width: `${i.necessario ? (i.alocado / i.necessario) * 100 : 100}%` }} />
                  </div>
                </li>
              );
            })}
            {!plano.itens.length && <li className="text-muted-foreground">Cadastre contas e dívidas para ver o plano.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Ordem: contas pelo vencimento → parcelas das dívidas → o que sobrar adianta a menor dívida.</p>
        </Card>

        <Card title="2. Minhas contas">
          <form className="mb-4 grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); const v = parseFloat(c.valor); if (!c.nome || !v) return; setContas([...contas, { id: uid(), nome: c.nome, valor: v, dia: parseInt(c.dia) || 1, freq: c.freq, pagas: {} }]); setC({ ...c, nome: "", valor: "" }); }}>
            <input className={input} placeholder="Ex: luz, aluguel" value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} />
            <input className={input} type="number" step="0.01" placeholder="Valor por pagamento" value={c.valor} onChange={(e) => setC({ ...c, valor: e.target.value })} />
            <input className={input} type="number" min={1} max={31} placeholder="Dia de vencimento" value={c.dia} onChange={(e) => setC({ ...c, dia: e.target.value })} />
            <FreqSelect value={c.freq} onChange={(f) => setC({ ...c, freq: f })} />
            <button className={`${btn} col-span-2`}>Adicionar conta</button>
          </form>
          <ul className="divide-y divide-border text-sm">
            {[...contas].sort((a, b) => a.dia - b.dia).map((x) => {
              const total = x.freq === "semanal" ? 4 : x.freq === "quinzenal" ? 2 : 1;
              const pagas = pagasNoMes(x, mes);
              const daVez = vezDoItem(agenda, x.id);
              return (
                <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-semibold">{x.nome}</p>
                    <p className="text-muted-foreground">{brl(x.valor)} · {FREQ_LABEL[x.freq]} · dia {x.dia} · pagas {pagas}/{total} no mês</p>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={!daVez} className="rounded-md bg-secondary px-2 py-1 disabled:opacity-40" onClick={() => daVez && pagarAgora(daVez)}>Paguei</button>
                    <button disabled={!pagas} className="rounded-md px-2 py-1 text-muted-foreground disabled:opacity-30" title="Desfazer o último pagamento deste mês" onClick={() => desfazer(x.id)}>↺</button>
                    <button className="text-destructive" onClick={() => setContas(contas.filter((y) => y.id !== x.id))}>×</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="3. Minhas dívidas" right={`resta ${brl(totalDividas)}`}>
          <form className="mb-4 grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); const s = parseFloat(d.saldo); if (!d.nome || !s) return; setDividas([...dividas, { id: uid(), nome: d.nome, saldo: s, parcela: parseFloat(d.parcela) || 0, freq: d.freq, dia: parseInt(d.dia) || 10, pagos: {} }]); setD({ ...d, nome: "", saldo: "", parcela: "" }); }}>
            <input className={input} placeholder="Ex: cartão, empréstimo" value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} />
            <input className={input} type="number" step="0.01" placeholder="Quanto devo" value={d.saldo} onChange={(e) => setD({ ...d, saldo: e.target.value })} />
            <input className={input} type="number" step="0.01" placeholder="Quanto pagar por vez" value={d.parcela} onChange={(e) => setD({ ...d, parcela: e.target.value })} />
            <input className={input} type="number" min={1} max={31} placeholder="Dia de vencimento" value={d.dia} onChange={(e) => setD({ ...d, dia: e.target.value })} />
            <FreqSelect value={d.freq} onChange={(f) => setD({ ...d, freq: f })} />
            <button className={`${btn} col-span-2`}>Adicionar dívida</button>
          </form>
          <ul className="divide-y divide-border text-sm">
            {dividas.map((x) => {
              const daVez = vezDoItem(agenda, x.id);
              const pagosMes = pagosNoMes(x, mes).length;
              return (
              <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-semibold">{x.nome} {x.saldo <= 0 && <span className="text-success">✓ Quitada</span>}</p>
                  <p className="text-muted-foreground">Resta {brl(x.saldo)} · {brl(x.parcela)} {FREQ_LABEL[x.freq].toLowerCase()} · dia {x.dia ?? 30}</p>
                </div>
                <div className="flex gap-2">
                  <button disabled={!daVez} className="rounded-md bg-secondary px-2 py-1 disabled:opacity-40" onClick={() => daVez && pagarAgora(daVez)}>Paguei parcela</button>
                  <button disabled={!pagosMes} className="rounded-md px-2 py-1 text-muted-foreground disabled:opacity-30" title="Desfazer o último pagamento deste mês" onClick={() => desfazer(x.id)}>↺</button>
                  <button className="text-destructive" onClick={() => setDividas(dividas.filter((y) => y.id !== x.id))}>×</button>
                </div>
              </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">Seus dados ficam salvos na sua conta e aparecem em qualquer aparelho em que você entrar.</p>
    </main>
  );
}
