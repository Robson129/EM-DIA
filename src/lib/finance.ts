export type Freq = "semanal" | "quinzenal" | "mensal";
export const FREQ_POR_MES: Record<Freq, number> = { semanal: 4, quinzenal: 2, mensal: 1 };
export const FREQ_LABEL: Record<Freq, string> = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal" };

/** Mês no formato "AAAA-MM". */
export type Mes = string;

export interface Conta {
  id: string;
  nome: string;
  valor: number;
  dia: number;
  freq: Freq;
  /** Quantas parcelas já foram pagas em cada mês. Cada mês começa do zero. */
  pagas: Record<Mes, number>;
}

export interface Divida {
  id: string;
  nome: string;
  /** Quanto ainda se deve hoje (já descontados todos os pagamentos). */
  saldo: number;
  parcela: number;
  freq: Freq;
  dia?: number;
  /** Valores pagos em cada mês, na ordem em que foram pagos. */
  pagos?: Record<Mes, number[]>;
}

export interface Receita { id: string; descricao: string; valor: number; data: string }

export interface ItemPlano { id: string; nome: string; tipo: "conta" | "divida" | "extra"; necessario: number; alocado: number }

const centavos = (n: number) => Math.round(n * 100) / 100;
const soma = (xs: number[]) => centavos(xs.reduce((s, x) => s + x, 0));

export function custoMensal(valor: number, freq: Freq) {
  return valor * FREQ_POR_MES[freq];
}

export function mesDe(d: Date): Mes {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Data de hoje (fuso local) no formato "AAAA-MM-DD", para campos <input type="date">. */
export function dataLocalISO(d: Date) {
  return `${mesDe(d)}-${String(d.getDate()).padStart(2, "0")}`;
}

export function pagasNoMes(c: Conta, mes: Mes) {
  return c.pagas?.[mes] ?? 0;
}

export function pagosNoMes(d: Divida, mes: Mes) {
  return d.pagos?.[mes] ?? [];
}

// ---------- Migração dos dados antigos ----------

/**
 * Versões antigas guardavam `pagas` como um número único, sem mês.
 * Esse número passa a valer para o mês informado (o mês em que o app foi aberto).
 */
export function normalizarContas(lista: unknown, mes: Mes): Conta[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((raw) => {
    const c = raw as Omit<Conta, "pagas"> & { pagas?: unknown };
    let pagas: Record<Mes, number> = {};
    if (typeof c.pagas === "number") pagas = c.pagas > 0 ? { [mes]: c.pagas } : {};
    else if (c.pagas && typeof c.pagas === "object") pagas = c.pagas as Record<Mes, number>;
    return { ...c, pagas };
  });
}

/** Mesmo caso das contas: `pagas` (número) vira a lista de valores pagos no mês informado. */
export function normalizarDividas(lista: unknown, mes: Mes): Divida[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((raw) => {
    const { pagas, ...d } = raw as Divida & { pagas?: unknown };
    if (d.pagos && typeof d.pagos === "object") return d;
    const n = typeof pagas === "number" ? pagas : 0;
    return { ...d, pagos: n > 0 ? { [mes]: Array.from({ length: n }, () => (d.parcela > 0 ? d.parcela : 0)) } : {} };
  });
}

// ---------- Agenda de vencimentos ----------

export interface Pagamento {
  id: string;
  refId: string;
  nome: string;
  tipo: "conta" | "divida";
  valor: number;
  dia: number;
  data: Date;
  pago: boolean;
}

export type Urgencia = "atrasada" | "hoje" | "depois";

const DIA_MS = 86_400_000;

function diaCivil(d: Date) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Quantos dias calendários separam hoje da data (negativo = já passou). */
export function diasAte(data: Date, hoje: Date) {
  return Math.round((diaCivil(data) - diaCivil(hoje)) / DIA_MS);
}

export function urgenciaDe(data: Date, hoje: Date): Urgencia {
  const n = diasAte(data, hoje);
  if (n < 0) return "atrasada";
  if (n === 0) return "hoje";
  return "depois";
}

function diasNoMes(ano: number, mesIdx: number) {
  return new Date(ano, mesIdx + 1, 0).getDate();
}

/**
 * Dias do mês em que algo vence. Sempre devolve FREQ_POR_MES[freq] datas,
 * encostadas no último dia do mês quando o dia pedido não cabe nele.
 */
export function diasDeVencimento(dia: number, freq: Freq, ano: number, mesIdx: number): number[] {
  const total = diasNoMes(ano, mesIdx);
  const base = Math.min(Math.max(1, Math.round(dia) || 1), total);
  const passos = freq === "semanal" ? [0, 7, 14, 21] : freq === "quinzenal" ? [0, 15] : [0];
  return passos.map((p) => Math.min(base + p, total));
}

/**
 * Saldo da dívida no começo do mês: o saldo de hoje mais tudo o que foi pago
 * daquele mês em diante.
 */
function saldoNoInicioDe(d: Divida, mes: Mes) {
  const pagosDali = Object.entries(d.pagos ?? {})
    .filter(([m]) => m >= mes)
    .flatMap(([, v]) => v);
  return centavos(d.saldo + soma(pagosDali));
}

/** Todas as parcelas do mês, em ordem de vencimento. */
export function agendaDe(contas: Conta[], dividas: Divida[], mes: Mes): Pagamento[] {
  const partes = mes.split("-");
  const ano = Number(partes[0] ?? 1970);
  const mesIdx = Number(partes[1] ?? 1) - 1;
  const out: Pagamento[] = [];

  for (const c of contas) {
    const pagas = pagasNoMes(c, mes);
    diasDeVencimento(c.dia, c.freq, ano, mesIdx).forEach((d, idx) => {
      out.push({
        id: `${c.id}#${idx}`, refId: c.id, nome: c.nome, tipo: "conta",
        valor: c.valor, dia: d, data: new Date(ano, mesIdx, d), pago: idx < pagas,
      });
    });
  }

  for (const d of dividas) {
    const dias = diasDeVencimento(d.dia ?? 30, d.freq, ano, mesIdx);
    const ultimoDia = dias[dias.length - 1] ?? 1;
    const pagos = pagosNoMes(d, mes);
    let resta = saldoNoInicioDe(d, mes);
    let idx = 0;
    const push = (valor: number, pago: boolean) => {
      const dd = dias[idx] ?? ultimoDia;
      out.push({
        id: `${d.id}#${idx}`, refId: d.id, nome: d.nome, tipo: "divida",
        valor, dia: dd, data: new Date(ano, mesIdx, dd), pago,
      });
      idx++;
    };

    // O que já foi pago no mês continua aparecendo, com o valor que foi pago de verdade.
    for (const v of pagos) {
      push(v, true);
      resta = centavos(resta - v);
    }
    // O resto das datas do mês, sem passar do que ainda se deve.
    while (idx < dias.length && resta > 0) {
      const v = centavos(Math.min(d.parcela > 0 ? d.parcela : resta, resta));
      push(v, false);
      resta = centavos(resta - v);
    }
  }

  return out.sort((a, b) => a.data.getTime() - b.data.getTime() || a.nome.localeCompare(b.nome));
}

/** A vez de cada conta/dívida: a parcela não paga mais antiga dela. */
export function vezDe(pags: Pagamento[]) {
  const vez = new Map<string, string>();
  for (const p of pags) if (!p.pago && !vez.has(p.refId)) vez.set(p.refId, p.id);
  return vez;
}

/** A parcela da vez de um item (conta ou dívida) no mês, ou undefined se não há nada em aberto. */
export function vezDoItem(pags: Pagamento[], refId: string) {
  const id = vezDe(pags).get(refId);
  return id ? pags.find((p) => p.id === id) : undefined;
}

/** Pagamentos não pagos que vencem hoje ou já passaram — é disso que o lembrete avisa. */
export function lembretesDe(pags: Pagamento[], hoje: Date) {
  return pags.filter((p) => !p.pago && diasAte(p.data, hoje) <= 0);
}

export function resumoDe(pags: Pagamento[], renda: number) {
  const pendente = pags.filter((p) => !p.pago);
  const pago = pags.filter((p) => p.pago);
  const aPagar = soma(pendente.map((p) => p.valor));
  const jaPago = soma(pago.map((p) => p.valor));
  const dinheiro = Math.max(0, centavos(renda - jaPago));
  return {
    aPagar,
    jaPago,
    dinheiro,
    falta: Math.max(0, centavos(aPagar - dinheiro)),
    sobra: Math.max(0, centavos(dinheiro - aPagar)),
    pendente,
    pago,
  };
}

// ---------- Ações ----------

/**
 * Marca como paga a parcela da vez. Só aceita a parcela não paga mais antiga do item
 * (regra do app); qualquer outra é ignorada.
 */
export function marcarPago(contas: Conta[], dividas: Divida[], p: Pagamento) {
  const mes = mesDe(p.data);
  const pags = agendaDe(
    contas.filter((c) => c.id === p.refId),
    dividas.filter((d) => d.id === p.refId),
    mes,
  );
  const vez = vezDoItem(pags, p.refId);
  if (!vez || vez.id !== p.id) return { contas, dividas };

  if (p.tipo === "conta") {
    return {
      contas: contas.map((c) => (c.id === p.refId ? { ...c, pagas: { ...c.pagas, [mes]: pagasNoMes(c, mes) + 1 } } : c)),
      dividas,
    };
  }
  return {
    contas,
    dividas: dividas.map((d) => (d.id === p.refId
      ? { ...d, saldo: Math.max(0, centavos(d.saldo - vez.valor)), pagos: { ...d.pagos, [mes]: [...pagosNoMes(d, mes), vez.valor] } }
      : d)),
  };
}

/** Desfaz o último pagamento marcado do item no mês (para corrigir um clique errado). */
export function desfazerUltimo(contas: Conta[], dividas: Divida[], refId: string, mes: Mes) {
  return {
    contas: contas.map((c) => (c.id === refId && pagasNoMes(c, mes) > 0
      ? { ...c, pagas: { ...c.pagas, [mes]: pagasNoMes(c, mes) - 1 } }
      : c)),
    dividas: dividas.map((d) => {
      const pagos = pagosNoMes(d, mes);
      if (d.id !== refId || !pagos.length) return d;
      const ultimo = pagos[pagos.length - 1] ?? 0;
      return { ...d, saldo: centavos(d.saldo + ultimo), pagos: { ...d.pagos, [mes]: pagos.slice(0, -1) } };
    }),
  };
}

// ---------- Plano de distribuição ----------

/**
 * Distribui o dinheiro disponível sobre o que ainda está em aberto no mês (lido da agenda):
 * contas primeiro (por dia de vencimento), depois parcelas das dívidas, sobra vai para a menor dívida.
 */
export function planejar(contas: Conta[], dividas: Divida[], dinheiro: number, mes: Mes) {
  const pendentes = agendaDe(contas, dividas, mes).filter((p) => !p.pago);
  const emAberto = (id: string) => soma(pendentes.filter((p) => p.refId === id).map((p) => p.valor));

  let resto = dinheiro;
  const itens: ItemPlano[] = [];
  for (const c of [...contas].sort((a, b) => a.dia - b.dia)) {
    const necessario = emAberto(c.id);
    const alocado = Math.min(resto, necessario);
    resto = centavos(resto - alocado);
    itens.push({ id: c.id, nome: c.nome, tipo: "conta", necessario, alocado });
  }
  const ativas = dividas.filter((d) => d.saldo > 0).sort((a, b) => a.saldo - b.saldo);
  const saldos = new Map(ativas.map((d) => [d.id, d.saldo]));
  for (const d of ativas) {
    const necessario = emAberto(d.id);
    const alocado = Math.min(resto, necessario);
    resto = centavos(resto - alocado);
    saldos.set(d.id, centavos(d.saldo - alocado));
    itens.push({ id: d.id, nome: d.nome, tipo: "divida", necessario, alocado });
  }
  for (const d of ativas) {
    const s = saldos.get(d.id) ?? 0;
    if (resto <= 0 || s <= 0) continue;
    const extra = Math.min(resto, s);
    resto = centavos(resto - extra);
    itens.push({ id: d.id + "-x", nome: `Adiantar ${d.nome}`, tipo: "extra", necessario: s, alocado: extra });
  }
  return { itens, sobra: resto };
}
