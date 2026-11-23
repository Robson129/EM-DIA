export type Freq = "semanal" | "quinzenal" | "mensal";
export const FREQ_POR_MES: Record<Freq, number> = { semanal: 4, quinzenal: 2, mensal: 1 };
export const FREQ_LABEL: Record<Freq, string> = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal" };

export interface Conta { id: string; nome: string; valor: number; dia: number; freq: Freq; pagas: number }
export interface Divida { id: string; nome: string; saldo: number; parcela: number; freq: Freq; dia?: number; pagas?: number }
export interface Receita { id: string; descricao: string; valor: number; data: string }

export interface ItemPlano { id: string; nome: string; tipo: "conta" | "divida" | "extra"; necessario: number; alocado: number }

export function custoMensal(valor: number, freq: Freq) {
  return valor * FREQ_POR_MES[freq];
}

/** Contas primeiro (por dia de vencimento), depois parcelas das dívidas, sobra vai para a menor dívida. */
export function planejar(contas: Conta[], dividas: Divida[], renda: number) {
  let resto = renda;
  const itens: ItemPlano[] = [];
  for (const c of [...contas].sort((a, b) => a.dia - b.dia)) {
    const necessario = Math.max(0, custoMensal(c.valor, c.freq) - c.pagas * c.valor);
    const alocado = Math.min(resto, necessario);
    resto -= alocado;
    itens.push({ id: c.id, nome: c.nome, tipo: "conta", necessario, alocado });
  }
  const ativas = dividas.filter((d) => d.saldo > 0).sort((a, b) => a.saldo - b.saldo);
  const saldos = new Map(ativas.map((d) => [d.id, d.saldo]));
  for (const d of ativas) {
    const necessario = Math.min(d.saldo, custoMensal(d.parcela, d.freq));
    const alocado = Math.min(resto, necessario);
    resto -= alocado;
    saldos.set(d.id, d.saldo - alocado);
    itens.push({ id: d.id, nome: d.nome, tipo: "divida", necessario, alocado });
  }
  for (const d of ativas) {
    const s = saldos.get(d.id) ?? 0;
    if (resto <= 0 || s <= 0) continue;
    const extra = Math.min(resto, s);
    resto -= extra;
    itens.push({ id: d.id + "-x", nome: `Adiantar ${d.nome}`, tipo: "extra", necessario: s, alocado: extra });
  }
  return { itens, sobra: resto };
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

/** Todas as parcelas do mês, em ordem de vencimento. */
export function agendaDe(contas: Conta[], dividas: Divida[], mes: string): Pagamento[] {
  const partes = mes.split("-");
  const ano = Number(partes[0] ?? 1970);
  const mesIdx = Number(partes[1] ?? 1) - 1;
  const out: Pagamento[] = [];

  for (const c of contas) {
    diasDeVencimento(c.dia, c.freq, ano, mesIdx).forEach((d, idx) => {
      out.push({
        id: `${c.id}#${idx}`, refId: c.id, nome: c.nome, tipo: "conta",
        valor: c.valor, dia: d, data: new Date(ano, mesIdx, d), pago: idx < c.pagas,
      });
    });
  }

  for (const d of dividas) {
    if (d.saldo <= 0) continue;
    let resta = d.saldo;
    let idx = 0;
    for (const dd of diasDeVencimento(d.dia ?? 30, d.freq, ano, mesIdx)) {
      const v = Math.min(d.parcela > 0 ? d.parcela : resta, resta);
      if (v <= 0) break;
      resta -= v;
      out.push({
        id: `${d.id}#${idx}`, refId: d.id, nome: d.nome, tipo: "divida",
        valor: v, dia: dd, data: new Date(ano, mesIdx, dd), pago: idx < (d.pagas ?? 0),
      });
      idx++;
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

/** Pagamentos não pagos que vencem hoje ou já passaram — é disso que o lembrete avisa. */
export function lembretesDe(pags: Pagamento[], hoje: Date) {
  return pags.filter((p) => !p.pago && diasAte(p.data, hoje) <= 0);
}

export function resumoDe(pags: Pagamento[], renda: number) {
  const pendente = pags.filter((p) => !p.pago);
  const pago = pags.filter((p) => p.pago);
  const aPagar = pendente.reduce((s, p) => s + p.valor, 0);
  const jaPago = pago.reduce((s, p) => s + p.valor, 0);
  const dinheiro = Math.max(0, renda - jaPago);
  return {
    aPagar,
    jaPago,
    dinheiro,
    falta: Math.max(0, aPagar - dinheiro),
    sobra: Math.max(0, dinheiro - aPagar),
    pendente,
    pago,
  };
}
