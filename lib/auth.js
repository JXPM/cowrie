// Comptes de l'app : chaque personne a son mot de passe (en-tête x-app-key) et ses propres données.
//
// APP_USERS = "nom:motdepasse,nom2:motdepasse2"
//   nom : ^[a-z0-9-]{1,32}$ ; mot de passe : 12 caractères au moins (sans virgule).
//   Une entrée invalide est ignorée et signalée dans les journaux (le mot de passe n'est jamais affiché).
// APP_OWNER (défaut « johan ») : le propriétaire garde les clés historiques « budget-v2 » et « inbox-v1 ».
// Compatibilité : si APP_USERS est absente (ou vide), APP_PASSWORD seul marche comme avant pour le propriétaire.
const crypto = require("crypto");

const NAME_RE = /^[a-z0-9-]{1,32}$/;
const MIN_PASSWORD = 12;
const DEFAULT_OWNER = "johan";

function ownerName(env = process.env) {
  const o = String(env.APP_OWNER || "").trim();
  if (!o) return DEFAULT_OWNER;
  if (!NAME_RE.test(o)) {
    console.warn(`[auth] APP_OWNER invalide, « ${DEFAULT_OWNER} » utilisé à la place`);
    return DEFAULT_OWNER;
  }
  return o;
}

// Lit la configuration. Renvoie { users: [{name, password, owner}], warnings: [...] }.
function parseUsers(env = process.env) {
  const owner = ownerName(env);
  const raw = env.APP_USERS;
  const warnings = [];
  const users = [];

  if (raw === undefined || String(raw).trim() === "") {
    // Mode historique : un seul mot de passe, aucune règle de longueur (exactement comme avant).
    const pw = env.APP_PASSWORD || "";
    if (pw) users.push({ name: owner, password: pw, owner: true });
    return { users, warnings, owner };
  }

  String(raw).split(",").forEach((entry, i) => {
    const e = entry.trim();
    if (!e) return;
    const at = e.indexOf(":");
    const name = at > 0 ? e.slice(0, at).trim() : "";
    const password = at > 0 ? e.slice(at + 1) : "";
    const pos = `entrée n°${i + 1}`;
    if (!NAME_RE.test(name)) return warnings.push(`${pos} ignorée : nom invalide (attendu ^[a-z0-9-]{1,32}$)`);
    if (password.length < MIN_PASSWORD) return warnings.push(`${pos} (${name}) ignorée : mot de passe de moins de ${MIN_PASSWORD} caractères`);
    if (users.some(u => u.name === name)) return warnings.push(`${pos} (${name}) ignorée : nom déjà utilisé`);
    users.push({ name, password, owner: name === owner });
  });
  if (!users.length) warnings.push("aucun compte valide dans APP_USERS : toutes les connexions seront refusées");
  return { users, warnings, owner };
}

// Configuration mémorisée tant que les variables ne changent pas (les avertissements ne sont journalisés qu'une fois).
let cache = { sig: null, conf: null };
function config(env = process.env) {
  const sig = JSON.stringify([env.APP_USERS, env.APP_PASSWORD, env.APP_OWNER]);
  if (cache.sig !== sig) {
    const conf = parseUsers(env);
    conf.warnings.forEach(w => console.warn("[auth] APP_USERS : " + w));
    cache = { sig, conf };
  }
  return cache.conf;
}

// Comparaison en temps constant : on compare des empreintes de même longueur, contre CHAQUE mot de passe,
// sans s'arrêter au premier trouvé.
const digest = s => crypto.createHash("sha256").update(String(s), "utf8").digest();
function safeEqual(a, b) { return crypto.timingSafeEqual(digest(a), digest(b)); }

// Renvoie { name, owner } ou null. Le nom vient UNIQUEMENT du mot de passe, jamais de la requête.
function authenticate(req, env = process.env) {
  const got = String((req.headers || {})["x-app-key"] || "");
  const { users } = config(env);
  let found = null;
  for (const u of users) {
    const ok = safeEqual(got, u.password);
    if (ok && !found) found = u;
  }
  if (!got || !found) return null;
  return { name: found.name, owner: found.owner };
}

// Clés de stockage : le propriétaire garde les clés historiques, sans migration.
function keyFor(base, user) { return user.owner ? base : `${base}:${user.name}`; }
const budgetKey = user => keyFor("budget-v2", user);
const inboxKey = user => keyFor("inbox-v1", user);

function handler(fn) {
  return async (req, res) => {
    if (req.method === "OPTIONS") return res.status(204).end();
    const user = authenticate(req);
    if (!user) return res.status(401).json({ error: "Mot de passe incorrect" });
    try {
      const out = await fn(req, res, user);
      if (out !== undefined) res.status(200).json(out);
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      res.status(status).json({ error: e.message || "Erreur" });
    }
  };
}

module.exports = { handler, authenticate, config, parseUsers, ownerName, budgetKey, inboxKey, safeEqual, NAME_RE, MIN_PASSWORD };
