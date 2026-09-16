const { handler } = require("../lib/enable");
const store = require("../lib/store");

// Budget partagé entre appareils. GET → {state, updated_at} ; PUT {state} → enregistre.
module.exports = handler(async (req, res) => {
  if (req.method === "GET") {
    const row = await store.get("budget");
    return row ? { state: row.v, updated_at: row.updated_at } : { state: null };
  }
  if (req.method === "PUT") {
    const { state } = req.body || {};
    if (!state || !state.months) throw Object.assign(new Error("state invalide"), { status: 400 });
    await store.set("budget", state);
    return { ok: true, updated_at: new Date().toISOString() };
  }
  res.status(405).json({ error: "GET ou PUT attendu" });
});
