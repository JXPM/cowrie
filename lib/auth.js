// Protection simple : mot de passe partagé, envoyé dans l'en-tête x-app-key.
const crypto = require("crypto");

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
      res.status(status).json({ error: e.message || "Erreur" });
    }
  };
}

module.exports = { handler };
