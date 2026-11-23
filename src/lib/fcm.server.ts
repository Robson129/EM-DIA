// Envio de avisos direto pelo Firebase Cloud Messaging (API HTTP v1), sem intermediários.
// Usa a conta de serviço do projeto Firebase, guardada inteira (o JSON) em FIREBASE_SERVICE_ACCOUNT.
import { createSign } from "node:crypto";

interface ContaServico { project_id: string; client_email: string; private_key: string }

let cache: { token: string; expira: number } | null = null;

function contaServico(): ContaServico {
  const bruto = process.env["FIREBASE_SERVICE_ACCOUNT"];
  if (!bruto) throw new Error("FIREBASE_SERVICE_ACCOUNT não configurada");
  const c = JSON.parse(bruto) as ContaServico;
  if (!c.project_id || !c.client_email || !c.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT incompleta");
  // Painéis de variáveis às vezes guardam as quebras de linha como "\n" literal.
  return { ...c, private_key: c.private_key.replace(/\\n/g, "\n") };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function tokenDeAcesso(c: ContaServico) {
  const agora = Math.floor(Date.now() / 1000);
  if (cache && cache.expira - 60 > agora) return cache.token;

  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(JSON.stringify({
    iss: c.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  }));
  const assinatura = createSign("RSA-SHA256").update(`${cabecalho}.${corpo}`).sign(c.private_key);
  const jwt = `${cabecalho}.${corpo}.${b64url(assinatura)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google OAuth falhou [${res.status}]: ${await res.text()}`);
  const r = (await res.json()) as { access_token: string; expires_in: number };
  cache = { token: r.access_token, expira: agora + r.expires_in };
  return r.access_token;
}

export type ResultadoAviso = { ok: true } | { ok: false; apagar: boolean; status: number; corpoErro: string };

export async function enviarAviso(token: string, titulo: string, corpo: string): Promise<ResultadoAviso> {
  const c = contaServico();
  const acesso = await tokenDeAcesso(c);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: titulo, body: corpo },
        data: { path: "/" },
      },
    }),
  });
  if (res.ok) return { ok: true };
  const corpoErro = await res.text();
  // 404 UNREGISTERED / 400 INVALID_ARGUMENT: token velho, apagar em vez de tentar de novo.
  return { ok: false, apagar: res.status === 404 || res.status === 400, status: res.status, corpoErro };
}
