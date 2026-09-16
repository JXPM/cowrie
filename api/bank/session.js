const { eb, handler } = require("../../lib/enable");

function slimAccount(a) {
  return {
    uid: a.uid,
    name: a.name || a.product || a.cash_account_type || "Compte",
    iban: a.account_id && a.account_id.iban ? a.account_id.iban : null,
    currency: a.currency || "EUR",
  };
}

// POST {code}  → crée la session après le retour de la banque, renvoie session_id + comptes.
// DELETE ?id=  → révoque la session (déconnexion).
module.exports = handler(async (req, res) => {
  if (req.method === "POST") {
    const { code } = req.body || {};
    if (!code) throw Object.assign(new Error("code requis"), { status: 400 });
    const s = await eb("POST", "/sessions", { code });
    return { session_id: s.session_id, valid_until: s.access && s.access.valid_until, accounts: (s.accounts || []).map(slimAccount) };
  }
  if (req.method === "DELETE") {
    const id = req.query.id;
    if (!id) throw Object.assign(new Error("id requis"), { status: 400 });
    try { await eb("DELETE", "/sessions/" + encodeURIComponent(id)); } catch (e) { if (e.status !== 404) throw e; }
    return { ok: true };
  }
  res.status(405).json({ error: "POST ou DELETE attendu" });
});
