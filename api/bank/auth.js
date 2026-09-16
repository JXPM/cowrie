const crypto = require("crypto");
const { eb, handler } = require("../../lib/enable");

// Démarre l'autorisation : renvoie l'URL de la banque où l'utilisateur donne son consentement (90 jours).
module.exports = handler(async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "POST attendu" }); return; }
  const { bank, country, redirect_url } = req.body || {};
  if (!bank || !redirect_url) throw Object.assign(new Error("bank et redirect_url requis"), { status: 400 });
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!redirect_url.startsWith("https://" + host + "/") && !redirect_url.startsWith("http://localhost")) {
    throw Object.assign(new Error("redirect_url doit pointer vers cette app"), { status: 400 });
  }
  const validUntil = new Date(Date.now() + 90 * 86400000).toISOString();
  const state = crypto.randomUUID();
  const data = await eb("POST", "/auth", {
    access: { valid_until: validUntil },
    aspsp: { name: bank, country: (country || "FR").toUpperCase() },
    state,
    redirect_url,
    psu_type: "personal",
  });
  return { url: data.url, state };
});
