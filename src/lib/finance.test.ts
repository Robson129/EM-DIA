import { describe, it, expect } from "vitest";
import { agendaDe, diasAte, diasDeVencimento, lembretesDe, planejar, resumoDe, urgenciaDe } from "./finance";

describe("planejar", () => {
  it("paga contas antes das dívidas e semanal conta 4x no mês", () => {
    const r = planejar(
      [{ id: "a", nome: "Feira", valor: 100, dia: 5, freq: "semanal", pagas: 0 }],
      [{ id: "d", nome: "Cartão", saldo: 1000, parcela: 200, freq: "mensal" }],
      500,
    );
    expect(r.itens[0]?.alocado).toBe(400);
    expect(r.itens[1]?.alocado).toBe(100);
    expect(r.sobra).toBe(0);
  });
  it("sobra vai para adiantar a menor dívida", () => {
    const r = planejar([], [
      { id: "g", nome: "Grande", saldo: 5000, parcela: 100, freq: "mensal" },
      { id: "p", nome: "Pequena", saldo: 300, parcela: 100, freq: "quinzenal" },
    ], 1000);
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
    const p = agendaDe([{ id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: 0 }], [], "2026-11");
    expect(p).toHaveLength(1);
    expect(urgenciaDe(p[0]!.data, hoje)).toBe("atrasada");
    expect(diasAte(p[0]!.data, hoje)).toBe(-18);
  });

  it("marca como paga só a quantidade de parcelas já pagas", () => {
    const p = agendaDe([{ id: "f", nome: "Feira", valor: 100, dia: 3, freq: "semanal", pagas: 2 }], [], "2026-11");
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
      { id: "z", nome: "Aluguel", valor: 800, dia: 20, freq: "mensal", pagas: 0 },
      { id: "a", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: 0 },
    ], [], "2026-11");
    expect(p.map((x) => x.nome)).toEqual(["Luz", "Aluguel"]);
  });
});

describe("lembretesDe", () => {
  const hoje = new Date(2026, 10, 23); // 23/11/2026

  it("avisa só o que vence hoje ou já passou e ainda não foi pago", () => {
    const p = agendaDe([
      { id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: 0 },
      { id: "a", nome: "Aluguel", valor: 800, dia: 23, freq: "mensal", pagas: 0 },
      { id: "i", nome: "Internet", valor: 100, dia: 28, freq: "mensal", pagas: 0 },
      { id: "g", nome: "Gás", valor: 90, dia: 5, freq: "mensal", pagas: 1 },
    ], [], "2026-11");
    expect(lembretesDe(p, hoje).map((x) => x.nome)).toEqual(["Luz", "Aluguel"]);
  });

  it("não avisa nada quando está tudo pago ou no futuro", () => {
    const p = agendaDe([{ id: "i", nome: "Internet", valor: 100, dia: 28, freq: "mensal", pagas: 0 }], [], "2026-11");
    expect(lembretesDe(p, hoje)).toHaveLength(0);
  });
});

describe("resumoDe", () => {
  it("mostra quanto falta quando o recebido não cobre o que está em aberto", () => {
    const p = agendaDe([
      { id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: 0 },
      { id: "a", nome: "Aluguel", valor: 800, dia: 10, freq: "mensal", pagas: 1 },
    ], [], "2026-11");
    const r = resumoDe(p, 2000);
    expect(r.aPagar).toBe(180);
    expect(r.jaPago).toBe(800);
    expect(r.dinheiro).toBe(1200);
    expect(r.falta).toBe(0);
    expect(r.sobra).toBe(1020);
  });

  it("mostra a falta quando sobra menos do que o em aberto", () => {
    const p = agendaDe([{ id: "l", nome: "Luz", valor: 180, dia: 5, freq: "mensal", pagas: 0 }], [], "2026-11");
    const r = resumoDe(p, 100);
    expect(r.falta).toBe(80);
    expect(r.sobra).toBe(0);
  });
});
