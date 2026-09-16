// Client Enable Banking (https://enablebanking.com) — JWT RS256 signé avec la clé privée de l'app.
const crypto = require("crypto");

const API = "https://api.enablebanking.com";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

let cached = null; // { token, exp }
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const appId = process.env.ENABLE_APP_ID;
  let key = process.env.ENABLE_PRIVATE_KEY || "";
  if (!appId || !key) throw Object.assign(new Error("ENABLE_APP_ID / ENABLE_PRIVATE_KEY manquants"), { status: 500 });
  key = key.replace(/\\n/g, "\n"); // clé collée sur une ligne dans Vercel
  const exp = now + 3600;
  const head = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const body = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp }));
  const sig = crypto.sign("RSA-SHA256", Buffer.from(head + "." + body), key);
  cached = { token: head + "." + body + "." + b64url(sig), exp };
  return cached.token;
}

async function eb(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + jwt(), "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data; try { data = txt ? JSON.parse(txt) : {}; } catch (e) { data = { raw: txt }; }
  if (!r.ok) throw Object.assign(new Error((data && (data.message || data.error)) || ("Enable Banking " + r.status)), { status: r.status, data });
  return data;
}

// Protection simple : mot de passe partagé, envoyé dans l'en-tête x-app-key.
function authorized(req) {
  const want = process.env.APP_PASSWORD || "";
  const got = String(req.headers["x-app-key"] || "");
  if (!want || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

function handler(fn) {
  return async (req, res) => {
    if (req.method === "OPTIONS") return res.status(204).end();
    if (!authorized(req)) return res.status(401).json({ error: "Mot de passe incorrect" });
    try {
      const out = await fn(req, res);
      if (out !== undefined) res.status(200).json(out);
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      res.status(status).json({ error: e.message || "Erreur", detail: e.data });
    }
  };
}

module.exports = { eb, handler };
