const { handler } = require("../lib/auth");
const store = require("../lib/store");

// Boîte de réception des paiements envoyés par Raccourcis iOS (automatisation « Transaction » de Cartes).
// POST {amount, merchant, card?, date?}   → ajoute une opération en attente
// GET                                       → liste les opérations en attente (l'app les importe)
// DELETE {ids: [...]}                       → retire les opérations déjà importées
const KEY = "inbox-v1";

// Montant envoyé par Raccourcis : "12,50 €", "1 234,56", "-8.90"…
function parseAmount(v) {
  if (typeof v === "number") return Math.abs(v);
  let s = String(v || "").replace(/[^\d,.\-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Math.abs(parseFloat(s));
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function parisDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

module.exports = handler(async (req, res) => {
  const row = await store.get(KEY);
  const items = (row && Array.isArray(row.v)) ? row.v : [];

  if (req.method === "GET") return { items };

  if (req.method === "POST") {
    const b = req.body || {};
    const amount = parseAmount(b.amount);
    if (!amount) throw Object.assign(new Error("Montant manquant ou invalide"), { status: 400 });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : parisDate();
    const item = {
      id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3),
      amount,
      label: String(b.merchant || b.label || "Paiement Apple Pay").trim().slice(0, 80),
      card: String(b.card || "").trim().slice(0, 60),
      date,
      at: Date.now()
    };
    items.push(item);
    await store.set(KEY, items.slice(-200));
    return { ok: true, item };
  }

  if (req.method === "DELETE") {
    const ids = new Set(((req.body || {}).ids) || []);
    await store.set(KEY, items.filter(i => !ids.has(i.id)));
    return { ok: true };
  }

  res.status(405).json({ error: "GET, POST ou DELETE attendu" });
});
