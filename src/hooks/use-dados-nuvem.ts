import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Conta, Divida, Receita } from "@/lib/finance";

interface Dados { contas: Conta[]; dividas: Divida[]; receitas: Receita[] }
const VAZIO: Dados = { contas: [], dividas: [], receitas: [] };

function lerLocal(): Dados {
  const ler = <T,>(k: string): T[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]") as T[]; } catch { return []; } };
  return { contas: ler<Conta>("emdia-contas"), dividas: ler<Divida>("emdia-dividas"), receitas: ler<Receita>("emdia-receitas") };
}

/** Contas, dívidas e recebimentos do usuário, guardados online. Na primeira vez, traz o que estava neste aparelho. */
export function useDadosNuvem(userId: string) {
  const [dados, setDados] = useState<Dados>(VAZIO);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from("dados_usuario").select("contas,dividas,receitas").eq("user_id", userId).maybeSingle();
      if (!vivo) return;
      if (error) { setErro("Não consegui carregar seus dados."); return; }
      if (data) {
        setDados({ contas: data.contas as unknown as Conta[], dividas: data.dividas as unknown as Divida[], receitas: data.receitas as unknown as Receita[] });
      } else {
        const local = lerLocal();
        await supabase.from("dados_usuario").insert({ user_id: userId, contas: local.contas as never, dividas: local.dividas as never, receitas: local.receitas as never });
        if (vivo) setDados(local);
      }
      if (vivo) setCarregado(true);
    })();
    return () => { vivo = false; };
  }, [userId]);

  function salvar(novo: Dados) {
    setDados(novo);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await supabase.from("dados_usuario").update({
        contas: novo.contas as never, dividas: novo.dividas as never, receitas: novo.receitas as never, atualizado_em: new Date().toISOString(),
      }).eq("user_id", userId);
      setErro(error ? "Não consegui salvar. Verifique a internet." : null);
    }, 400);
  }

  const ref = useRef(dados);
  ref.current = dados;
  return {
    ...dados, carregado, erro,
    setContas: (contas: Conta[]) => salvar({ ...ref.current, contas }),
    setDividas: (dividas: Divida[]) => salvar({ ...ref.current, dividas }),
    setReceitas: (receitas: Receita[]) => salvar({ ...ref.current, receitas }),
  };
}
