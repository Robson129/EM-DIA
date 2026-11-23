import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mesDe, normalizarContas, normalizarDividas, type Conta, type Divida, type Receita } from "@/lib/finance";

interface Dados { contas: Conta[]; dividas: Divida[]; receitas: Receita[] }
const VAZIO: Dados = { contas: [], dividas: [], receitas: [] };

function normalizar(raw: { contas: unknown; dividas: unknown; receitas: unknown }): Dados {
  const mes = mesDe(new Date());
  return {
    contas: normalizarContas(raw.contas, mes),
    dividas: normalizarDividas(raw.dividas, mes),
    receitas: Array.isArray(raw.receitas) ? (raw.receitas as Receita[]) : [],
  };
}

function lerLocal(): Dados {
  const ler = (k: string): unknown => { try { return JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { return []; } };
  return normalizar({ contas: ler("emdia-contas"), dividas: ler("emdia-dividas"), receitas: ler("emdia-receitas") });
}

/** Contas, dívidas e recebimentos do usuário, guardados online. Na primeira vez, traz o que estava neste aparelho. */
export function useDadosNuvem(userId: string) {
  const [dados, setDados] = useState<Dados>(VAZIO);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef(dados);
  const pendente = useRef<Dados | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from("dados_usuario").select("contas,dividas,receitas").eq("user_id", userId).maybeSingle();
      if (!vivo) return;
      if (error) { setErro("Não consegui carregar seus dados."); return; }
      if (data) {
        setDados(normalizar(data));
      } else {
        const local = lerLocal();
        const { error: e2 } = await supabase.from("dados_usuario").insert({
          user_id: userId, contas: local.contas as never, dividas: local.dividas as never, receitas: local.receitas as never,
        });
        if (!vivo) return;
        // Sem a linha criada, nada do que a pessoa cadastrar seria salvo: melhor avisar e parar aqui.
        if (e2) { setErro("Não consegui preparar sua conta. Recarregue a página."); return; }
        setDados(local);
      }
      setCarregado(true);
    })();
    return () => { vivo = false; };
  }, [userId]);

  async function gravar(novo: Dados) {
    pendente.current = null;
    const { data, error } = await supabase.from("dados_usuario").update({
      contas: novo.contas as never, dividas: novo.dividas as never, receitas: novo.receitas as never, atualizado_em: new Date().toISOString(),
    }).eq("user_id", userId).select("user_id");
    setErro(error || !data?.length ? "Não consegui salvar. Verifique a internet." : null);
  }

  // Se a pessoa sair da aba logo depois de mexer, grava na hora em vez de esperar o intervalo.
  useEffect(() => {
    const agora = () => {
      if (document.visibilityState !== "hidden" || !pendente.current) return;
      if (timer.current) clearTimeout(timer.current);
      void gravar(pendente.current);
    };
    document.addEventListener("visibilitychange", agora);
    return () => document.removeEventListener("visibilitychange", agora);
    // gravar só depende de userId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function salvar(novo: Dados) {
    ref.current = novo;
    setDados(novo);
    pendente.current = novo;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void gravar(novo); }, 400);
  }

  ref.current = dados;
  return {
    ...dados, carregado, erro,
    setContas: (contas: Conta[]) => salvar({ ...ref.current, contas }),
    setDividas: (dividas: Divida[]) => salvar({ ...ref.current, dividas }),
    setReceitas: (receitas: Receita[]) => salvar({ ...ref.current, receitas }),
    setContasEDividas: (contas: Conta[], dividas: Divida[]) => salvar({ ...ref.current, contas, dividas }),
  };
}
