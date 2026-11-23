import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function Entrar() {
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true); setMsg(null);
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) setMsg("E-mail ou senha incorretos.");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: window.location.origin } });
      if (error) setMsg(error.message.includes("Password") ? "A senha precisa ter pelo menos 6 caracteres." : "Não consegui criar a conta. Confira o e-mail.");
      else if (!data.session) setMsg("Pronto! Enviamos um link para o seu e-mail. Clique nele para ativar a conta.");
    }
    setOcupado(false);
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setMsg("Não consegui entrar com o Google.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="bg-linear-to-r from-primary via-primary-glow to-accent bg-clip-text font-display text-5xl font-extrabold text-transparent">Em Dia</h1>
      <p className="mb-6 text-muted-foreground">Entre para ver o que você precisa pagar. Suas contas ficam guardadas e você abre de qualquer aparelho.</p>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-viva">
        <button type="button" onClick={google} className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[#747775] bg-[#FFFFFF] px-3 py-2.5 text-sm font-medium text-[#1F1F1F]">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
          Continuar com o Google
        </button>
        <div className="my-4 text-center text-xs text-muted-foreground">ou com e-mail</div>
        <form onSubmit={enviar} className="grid gap-3">
          <input className={input} type="email" required placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} type="password" required minLength={6} placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <button disabled={ocupado} className="rounded-lg bg-linear-to-br from-primary to-primary-glow px-4 py-2 text-sm font-semibold text-primary-foreground shadow-viva disabled:opacity-50">
            {modo === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        {msg && <p className="mt-3 text-sm">{msg}</p>}
        <button type="button" className="mt-4 text-sm text-primary underline" onClick={() => { setModo(modo === "entrar" ? "criar" : "entrar"); setMsg(null); }}>
          {modo === "entrar" ? "Não tenho conta, quero criar" : "Já tenho conta, quero entrar"}
        </button>
      </div>
    </main>
  );
}
