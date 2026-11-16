const { handler, budgetKey } = require("../lib/auth");
const store = require("../lib/store");

// Budget de la personne connectée, partagé entre ses appareils (Cowrie v2 : {state, tx}).
// GET → {state, updated_at, user, owner} ; PUT {state, user?} → enregistre.
// La clé vient uniquement du compte authentifié (jamais de la requête).
// Si le corps du PUT précise « user » et qu'il ne correspond pas au compte connecté, l'écriture est refusée (409) :
// garde-fou contre l'envoi des données d'une personne dans le compte d'une autre depuis un même appareil.
module.exports = handler(async (req, res, user) => {
  const key = budgetKey(user);
  if (req.method === "GET") {
    const row = await store.get(key);
    const who = { user: user.name, owner: user.owner };
    return row ? { state: row.v, updated_at: row.updated_at, ...who } : { state: null, ...who };
  }
  if (req.method === "PUT") {
    const { state, user: expected } = req.body || {};
    if (expected !== undefined && expected !== user.name) throw Object.assign(new Error("Compte différent de celui attendu"), { status: 409 });
    if (!state || !state.state) throw Object.assign(new Error("state invalide"), { status: 400 });
    await store.set(key, state);
    return { ok: true, updated_at: new Date().toISOString(), user: user.name };
  }
  res.status(405).json({ error: "GET ou PUT attendu" });
});
