import { describe, it, expect } from "vitest";
import {
  agendaDe, desfazerUltimo, diasAte, diasDeVencimento, lembretesDe, marcarPago, normalizarContas, normalizarDividas,
  planejar, resumoDe, urgenciaDe, vezDoItem, type Conta, type Divida,
} from "./finance";

describe("planejar", () => {
  it("paga contas antes das dívidas e semanal conta 4x no mês", () => {
    const r = planejar(
      [{ id: "a", nome: "Feira", valor: 100, dia: 5, freq: "semanal", pagas: {} }],
      [{ id: "d", nome: "Cartão", saldo: 1000, parcela: 200, freq: "mensal" }],
      500,
      "2026-11",
    );
    expect(r.itens[0]?.alocado).toBe(400);
    expect(r.itens[1]?.alocado).toBe(100);
    expect(r.sobra).toBe(0);
  });
  it("sobra vai para adiantar a menor dívida", () => {
    const r = planejar([], [
      { id: "g", nome: "Grande", saldo: 5000, parcela: 100, freq: "mensal" },
      { id: "p", nome: "Pequena", saldo: 300, parcela: 100, freq: "quinzenal" },
    ], 1000, "2026-11");
    const extra = r.itens.find((i) => i.id === "p-x");
    expect(extra?.alocado).toBe(100);
  });
});

describe("diasDeVencimento", () => {
  it("espelha a frequência nos dias do mês", () => {
    expect(diasDeVencimento(10, "mensal", 2026, 10)).toEqual([10]);
    expect(diasDeVencimento(10, "quinzenal", 2026, 10)).toEqual([10, 25]);
    expect(diasDeVencimento(10, "semanal", 2026, 10)).toEqual([10, 17, 24, 30]);
    expect(diasDeVencimento(10, "semanal", 2026, 11)).toEqual([10, 17, 24, 31]);
  });
  it("não cria dia fora do mês", () => {
    expect(diasDeVencimento(31, "mensal", 2026, 1)).toEqual([28]);
  });
});

describe("agendaDe", () => {
  const hoje = new Date(2026, 10, 23); // 23/11/2026

  it("coloca vencimento antes de hoje como atrasado", () => {
    const p = agendaDe([{ id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: {} }], [], "2026-11");
    expect(p).toHaveLength(1);
    expect(urgenciaDe(p[0]!.data, hoje)).toBe("atrasada");
    expect(diasAte(p[0]!.data, hoje)).toBe(-18);
  });

  it("marca como paga só a quantidade de parcelas já pagas", () => {
    const p = agendaDe([{ id: "f", nome: "Feira", valor: 100, dia: 3, freq: "semanal", pagas: { "2026-11": 2 } }], [], "2026-11");
    expect(p.map((x) => x.pago)).toEqual([true, true, false, false]);
  });

  it("dívida deve no máximo o saldo que resta, mesmo com várias parcelas no mês", () => {
    const p = agendaDe([], [{ id: "c", nome: "Cartão", saldo: 100, parcela: 200, freq: "quinzenal", dia: 5 }], "2026-11");
    expect(p).toHaveLength(1);
    expect(p[0]?.valor).toBe(100);
  });

  it("dívida quitada sai da agenda", () => {
    const p = agendaDe([], [{ id: "c", nome: "Cartão", saldo: 0, parcela: 200, freq: "mensal" }], "2026-11");
    expect(p).toHaveLength(0);
  });

  it("ordena por data de vencimento", () => {
    const p = agendaDe([
      { id: "z", nome: "Aluguel", valor: 800, dia: 20, freq: "mensal", pagas: {} },
      { id: "a", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: {} },
    ], [], "2026-11");
    expect(p.map((x) => x.nome)).toEqual(["Luz", "Aluguel"]);
  });
});

describe("lembretesDe", () => {
  const hoje = new Date(2026, 10, 23); // 23/11/2026

  it("avisa só o que vence hoje ou já passou e ainda não foi pago", () => {
    const p = agendaDe([
      { id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: {} },
      { id: "a", nome: "Aluguel", valor: 800, dia: 23, freq: "mensal", pagas: {} },
      { id: "i", nome: "Internet", valor: 100, dia: 28, freq: "mensal", pagas: {} },
      { id: "g", nome: "Gás", valor: 90, dia: 5, freq: "mensal", pagas: { "2026-11": 1 } },
    ], [], "2026-11");
    expect(lembretesDe(p, hoje).map((x) => x.nome)).toEqual(["Luz", "Aluguel"]);
  });

  it("não avisa nada quando está tudo pago ou no futuro", () => {
    const p = agendaDe([{ id: "i", nome: "Internet", valor: 100, dia: 28, freq: "mensal", pagas: {} }], [], "2026-11");
    expect(lembretesDe(p, hoje)).toHaveLength(0);
  });
});

describe("resumoDe", () => {
  it("mostra quanto falta quando o recebido não cobre o que está em aberto", () => {
    const p = agendaDe([
      { id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: {} },
      { id: "a", nome: "Aluguel", valor: 800, dia: 10, freq: "mensal", pagas: { "2026-11": 1 } },
    ], [], "2026-11");
    const r = resumoDe(p, 2000);
    expect(r.aPagar).toBe(180);
    expect(r.jaPago).toBe(800);
    expect(r.dinheiro).toBe(1200);
    expect(r.falta).toBe(0);
    expect(r.sobra).toBe(1020);
  });

  it("mostra a falta quando sobra menos do que o em aberto", () => {
    const p = agendaDe([{ id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: {} }], [], "2026-11");
    const r = resumoDe(p, 100);
    expect(r.falta).toBe(80);
    expect(r.sobra).toBe(0);
  });
});

describe("pagamento de dívidas", () => {
  const mes = "2026-11";
  const pagarDaVez = (contas: Conta[], dividas: Divida[], refId: string) => {
    const p = vezDoItem(agendaDe(contas, dividas, mes), refId);
    if (!p) throw new Error("nada em aberto");
    return marcarPago(contas, dividas, p);
  };

  it("depois de pagar uma parcela semanal, o que falta é o saldo que resta", () => {
    const d: Divida = { id: "c", nome: "Cartão", saldo: 250, parcela: 100, freq: "semanal", dia: 1 };
    const r = pagarDaVez([], [d], "c");
    expect(r.dividas[0]?.saldo).toBe(150);
    const res = resumoDe(agendaDe([], r.dividas, mes), 0);
    expect(res.jaPago).toBe(100);
    expect(res.aPagar).toBe(150);
    expect(agendaDe([], r.dividas, mes).map((p) => p.valor)).toEqual([100, 100, 50]);
  });

  it("a parcela paga aparece com o valor que foi pago de verdade", () => {
    const d: Divida = { id: "e", nome: "Empréstimo", saldo: 150, parcela: 100, freq: "mensal", dia: 1 };
    const r = pagarDaVez([], [d], "e");
    const ag = agendaDe([], r.dividas, mes);
    expect(ag).toHaveLength(1);
    expect(ag[0]).toMatchObject({ valor: 100, pago: true });
  });

  it("dívida quitada no mês continua na lista de pagos", () => {
    const d: Divida = { id: "e", nome: "Empréstimo", saldo: 80, parcela: 100, freq: "mensal", dia: 1 };
    const r = pagarDaVez([], [d], "e");
    expect(r.dividas[0]?.saldo).toBe(0);
    expect(resumoDe(agendaDe([], r.dividas, mes), 0).jaPago).toBe(80);
  });

  it("no mês seguinte a dívida volta a ter parcela em aberto", () => {
    const d: Divida = { id: "e", nome: "Empréstimo", saldo: 500, parcela: 100, freq: "mensal", dia: 1 };
    const r = pagarDaVez([], [d], "e");
    const dez = agendaDe([], r.dividas, "2026-12");
    expect(dez).toHaveLength(1);
    expect(dez[0]).toMatchObject({ valor: 100, pago: false });
  });

  it("desfazer devolve o valor ao saldo", () => {
    const d: Divida = { id: "e", nome: "Empréstimo", saldo: 500, parcela: 100, freq: "mensal", dia: 1 };
    const r = pagarDaVez([], [d], "e");
    const u = desfazerUltimo(r.contas, r.dividas, "e", mes);
    expect(u.dividas[0]?.saldo).toBe(500);
    expect(agendaDe([], u.dividas, mes)[0]?.pago).toBe(false);
  });

  it("ignora pedido para pagar uma parcela que não é a da vez", () => {
    const d: Divida = { id: "c", nome: "Cartão", saldo: 300, parcela: 100, freq: "semanal", dia: 1 };
    const segunda = agendaDe([], [d], mes)[1]!;
    const r = marcarPago([], [d], segunda);
    expect(r.dividas[0]?.saldo).toBe(300);
  });
});

describe("pagamentos de contas por mês", () => {
  it("o que foi pago num mês não conta como pago no mês seguinte", () => {
    const c: Conta = { id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: {} };
    const p = agendaDe([c], [], "2026-11")[0]!;
    const r = marcarPago([c], [], p);
    expect(agendaDe(r.contas, [], "2026-11")[0]?.pago).toBe(true);
    expect(agendaDe(r.contas, [], "2026-12")[0]?.pago).toBe(false);
  });
});

describe("migração dos dados antigos", () => {
  it("pagas numérico da conta passa a valer para o mês atual", () => {
    const [c] = normalizarContas([{ id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: 1 }], "2026-11");
    expect(c?.pagas).toEqual({ "2026-11": 1 });
  });

  it("pagas numérico da dívida vira a lista de parcelas pagas, sem mudar o saldo", () => {
    const [d] = normalizarDividas([{ id: "c", nome: "Cartão", saldo: 150, parcela: 100, freq: "semanal", dia: 1, pagas: 1 }], "2026-11");
    expect(d?.pagos).toEqual({ "2026-11": [100] });
    expect(d).not.toHaveProperty("pagas");
    expect(resumoDe(agendaDe([], [d!], "2026-11"), 0).aPagar).toBe(150);
  });

  it("dados já no formato novo passam sem mudança", () => {
    const novo = { id: "c", nome: "Cartão", saldo: 150, parcela: 100, freq: "mensal", pagos: { "2026-10": [100] } };
    expect(normalizarDividas([novo], "2026-11")).toEqual([novo]);
  });
});
