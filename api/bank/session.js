const { eb, handler } = require("../../lib/enable");
const store = require("../../lib/store");

function slimAccount(a) {
  return {
    uid: a.uid,
    name: a.name || a.product || a.cash_account_type || "Compte",
    iban: a.account_id && a.account_id.iban ? a.account_id.iban : null,
    currency: a.currency || "EUR",
  };
}

// POST {code}  → crée la session après le retour de la banque et l'enregistre côté serveur.
// DELETE       → révoque la session et efface les données bancaires stockées.
module.exports = handler(async (req, res) => {
  if (req.method === "POST") {
    const { code } = req.body || {};
    if (!code) throw Object.assign(new Error("code requis"), { status: 400 });
    const s = await eb("POST", "/sessions", { code });
    const bank = {
      session_id: s.session_id,
      valid_until: s.access && s.access.valid_until,
      accounts: (s.accounts || []).map(slimAccount),
      created_at: new Date().toISOString(),
    };
    await store.set("bank", bank);
    await store.del("bankdata");
    return bank;
  }
  if (req.method === "DELETE") {
    const row = await store.get("bank");
    const id = req.query.id || (row && row.v.session_id);
    await store.del("bank");
    await store.del("bankdata");
    if (id) { try { await eb("DELETE", "/sessions/" + encodeURIComponent(id)); } catch (e) { if (e.status !== 404) throw e; } }
    return { ok: true };
  }
  res.status(405).json({ error: "POST ou DELETE attendu" });
});
