// Résumé du budget du propriétaire, en lecture seule, pour Johan OS.
// GET avec l'en-tête x-summary-key = SUMMARY_KEY (32 caractères au moins, distincte de tout mot de passe).
// SUMMARY_KEY absente ou trop courte : la route est désactivée (404).
// Ne lit que le budget du propriétaire (clé « budget-v2 ») et n'écrit jamais rien.
const store = require("../lib/store");
const { safeEqual, budgetKey, config } = require("../lib/auth");
const { computeSummary } = require("../lib/summary");

const MIN_KEY = 32;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const want = process.env.SUMMARY_KEY || "";
  if (want.length < MIN_KEY) return res.status(404).json({ error: "Introuvable" });
  // Une clé identique à un mot de passe de l'app désactiverait la séparation lecture / écriture : on refuse.
  if (config().users.some(u => u.password === want)) {
    console.warn("[summary] SUMMARY_KEY identique à un mot de passe de l'app : route désactivée");
    return res.status(404).json({ error: "Introuvable" });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET attendu" });
  }
  const got = String((req.headers || {})["x-summary-key"] || "");
  if (!safeEqual(got, want)) return res.status(401).json({ error: "Clé incorrecte" });
  try {
    const row = await store.get(budgetKey({ owner: true }));
    res.status(200).json(computeSummary(row ? row.v : null, row ? row.updated_at : null));
  } catch (e) {
    res.status(500).json({ error: "Erreur" });
  }
};
