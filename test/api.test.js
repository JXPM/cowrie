// Tests sans dépendance ni vraie base : node --test
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const store = require("../lib/store");
const auth = require("../lib/auth");
const { computeSummary } = require("../lib/summary");
const state2 = require("../api/state2");
const tx = require("../api/tx");
const summary = require("../api/summary");

// Faux stockage en mémoire
let mem;
function fakeStore() {
  mem = new Map();
  store.useBackend({
    async get(k) { return mem.has(k) ? { v: JSON.parse(JSON.stringify(mem.get(k))), updated_at: new Date("2026-11-10T08:00:00Z") } : null; },
    async set(k, v) { mem.set(k, JSON.parse(JSON.stringify(v))); },
    async del(k) { mem.delete(k); }
  });
}

// Fausse réponse façon Vercel
function call(fn, { method = "GET", headers = {}, body } = {}) {
  return new Promise(resolve => {
    const res = {
      statusCode: 200, headers: {}, body: undefined,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; resolve(this); return this; },
      end() { resolve(this); return this; }
    };
    fn({ method, headers, body }, res);
  });
}

const ENV_KEYS = ["APP_USERS", "APP_PASSWORD", "APP_OWNER", "SUMMARY_KEY"];
function env(vars) { ENV_KEYS.forEach(k => delete process.env[k]); Object.assign(process.env, vars); }

const JOHAN = "johan-mot-de-passe-1";
const SOEUR = "soeur-mot-de-passe-2";
const USERS = `johan:${JOHAN},soeur:${SOEUR}`;
const budget = name => ({ state: { v: 2, onboarded: true, currency: "EUR", owner: name }, tx: {} });

beforeEach(() => { fakeStore(); env({}); });

/* ---------- Authentification ---------- */

test("compatibilité : APP_PASSWORD seul marche comme avant, pour johan, sur la clé budget-v2", async () => {
  env({ APP_PASSWORD: "court" }); // aucune règle de longueur en mode historique
  mem.set("budget-v2", budget("johan"));
  const r = await call(state2, { headers: { "x-app-key": "court" } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.user, "johan");
  assert.equal(r.body.owner, true);
  assert.equal(r.body.state.state.owner, "johan");
  const bad = await call(state2, { headers: { "x-app-key": "courT" } });
  assert.equal(bad.statusCode, 401);
});

test("aucun mot de passe configuré : tout est refusé, même un en-tête vide", async () => {
  assert.equal((await call(state2, { headers: {} })).statusCode, 401);
  assert.equal((await call(state2, { headers: { "x-app-key": "" } })).statusCode, 401);
});

test("plusieurs utilisateurs : chacun est reconnu par son mot de passe, un mauvais est refusé", async () => {
  env({ APP_USERS: USERS });
  assert.deepEqual(auth.authenticate({ headers: { "x-app-key": JOHAN } }), { name: "johan", owner: true });
  assert.deepEqual(auth.authenticate({ headers: { "x-app-key": SOEUR } }), { name: "soeur", owner: false });
  assert.equal(auth.authenticate({ headers: { "x-app-key": "pas-le-bon-mot-de-passe" } }), null);
  assert.equal(auth.authenticate({ headers: {} }), null);
});

test("APP_USERS présente : APP_PASSWORD n'est plus accepté", async () => {
  env({ APP_USERS: USERS, APP_PASSWORD: "ancien-mot-de-passe" });
  assert.equal(auth.authenticate({ headers: { "x-app-key": "ancien-mot-de-passe" } }), null);
});

test("entrées invalides ignorées et signalées sans afficher le mot de passe", () => {
  const { users, warnings } = auth.parseUsers({ APP_USERS: "johan:" + JOHAN + ",zoe:trop-court,Bad_Name:mot-de-passe-long-1,soeur:" + SOEUR + ",soeur:autre-mot-de-passe" });
  assert.deepEqual(users.map(u => u.name), ["johan", "soeur"]);
  assert.equal(warnings.length, 3);
  const all = warnings.join(" ");
  assert.ok(!all.includes("trop-court") && !all.includes("mot-de-passe-long-1") && !all.includes("autre-mot-de-passe"));
  env({ APP_USERS: "zoe:trop-court" });
  assert.equal(auth.authenticate({ headers: { "x-app-key": "trop-court" } }), null);
});

test("mot de passe contenant « : » accepté (découpage au premier deux-points)", () => {
  const { users } = auth.parseUsers({ APP_USERS: "ami:abc:def:ghi:jkl" });
  assert.equal(users[0].password, "abc:def:ghi:jkl");
});

test("APP_OWNER change le propriétaire qui garde les clés historiques", async () => {
  env({ APP_USERS: USERS, APP_OWNER: "soeur" });
  await call(state2, { method: "PUT", headers: { "x-app-key": SOEUR }, body: { state: budget("soeur") } });
  assert.ok(mem.has("budget-v2"));
  await call(state2, { method: "PUT", headers: { "x-app-key": JOHAN }, body: { state: budget("johan") } });
  assert.ok(mem.has("budget-v2:johan"));
});

/* ---------- Isolation ---------- */

test("isolation du budget : chacun lit et écrit uniquement sa clé", async () => {
  env({ APP_USERS: USERS });
  mem.set("budget-v2", budget("johan"));
  let r = await call(state2, { headers: { "x-app-key": SOEUR } });
  assert.equal(r.body.user, "soeur");
  assert.equal(r.body.owner, false);
  assert.equal(r.body.state, null); // ne voit pas le budget de johan

  r = await call(state2, { method: "PUT", headers: { "x-app-key": SOEUR }, body: { state: budget("soeur") } });
  assert.equal(r.statusCode, 200);
  assert.equal(mem.get("budget-v2").state.owner, "johan"); // intact
  assert.equal(mem.get("budget-v2:soeur").state.owner, "soeur");

  r = await call(state2, { headers: { "x-app-key": JOHAN } });
  assert.equal(r.body.state.state.owner, "johan");
});

test("isolation : impossible de viser un autre compte par la requête", async () => {
  env({ APP_USERS: USERS });
  mem.set("budget-v2", budget("johan"));
  // Le champ « user » du corps ne choisit jamais la clé : s'il diffère, l'écriture est refusée.
  const r = await call(state2, { method: "PUT", headers: { "x-app-key": SOEUR, "x-app-user": "johan" }, body: { user: "johan", state: budget("pirate") } });
  assert.equal(r.statusCode, 409);
  assert.equal(mem.get("budget-v2").state.owner, "johan");
  assert.ok(!mem.has("budget-v2:soeur"));
});

test("Apple Pay : chaque opération va dans la boîte de la personne", async () => {
  env({ APP_USERS: USERS });
  await call(tx, { method: "POST", headers: { "x-app-key": JOHAN }, body: { amount: "12,50 €", merchant: "Carrefour" } });
  await call(tx, { method: "POST", headers: { "x-app-key": SOEUR }, body: { amount: 8.9, merchant: "Lidl" } });
  assert.equal(mem.get("inbox-v1").length, 1);
  assert.equal(mem.get("inbox-v1")[0].amount, 12.5);
  assert.equal(mem.get("inbox-v1:soeur")[0].label, "Lidl");

  const r = await call(tx, { headers: { "x-app-key": SOEUR } });
  assert.deepEqual(r.body.items.map(i => i.label), ["Lidl"]);

  const id = mem.get("inbox-v1")[0].id; // la soeur ne peut pas vider la boîte de johan
  await call(tx, { method: "DELETE", headers: { "x-app-key": SOEUR }, body: { ids: [id] } });
  assert.equal(mem.get("inbox-v1").length, 1);
});

test("Apple Pay en mode historique (APP_PASSWORD seul) : boîte inbox-v1", async () => {
  env({ APP_PASSWORD: JOHAN });
  await call(tx, { method: "POST", headers: { "x-app-key": JOHAN }, body: { amount: "3", merchant: "Paul" } });
  assert.equal(mem.get("inbox-v1").length, 1);
});

/* ---------- Résumé ---------- */

const SKEY = "k".repeat(43);

test("résumé : SUMMARY_KEY absente ou trop courte, route désactivée (404)", async () => {
  env({ APP_USERS: USERS });
  assert.equal((await call(summary, { headers: { "x-summary-key": "" } })).statusCode, 404);
  env({ APP_USERS: USERS, SUMMARY_KEY: "x".repeat(31) });
  assert.equal((await call(summary, { headers: { "x-summary-key": "x".repeat(31) } })).statusCode, 404);
});

test("résumé : SUMMARY_KEY identique à un mot de passe, route désactivée", async () => {
  const same = "m".repeat(40);
  env({ APP_USERS: "johan:" + same, SUMMARY_KEY: same });
  assert.equal((await call(summary, { headers: { "x-summary-key": same } })).statusCode, 404);
});

test("résumé : mauvaise clé, et mot de passe de l'app refusés", async () => {
  env({ APP_USERS: USERS, SUMMARY_KEY: SKEY });
  assert.equal((await call(summary, { headers: { "x-summary-key": SKEY + "x" } })).statusCode, 401);
  assert.equal((await call(summary, { headers: { "x-summary-key": JOHAN } })).statusCode, 401);
  assert.equal((await call(summary, { headers: { "x-app-key": JOHAN } })).statusCode, 401);
  // et la clé de résumé n'ouvre pas l'app
  assert.equal((await call(state2, { headers: { "x-app-key": SKEY } })).statusCode, 401);
});

test("résumé : toute écriture est refusée et rien n'est modifié", async () => {
  env({ APP_USERS: USERS, SUMMARY_KEY: SKEY });
  mem.set("budget-v2", budget("johan"));
  const before = JSON.stringify([...mem]);
  for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
    const r = await call(summary, { method, headers: { "x-summary-key": SKEY }, body: { state: budget("pirate") } });
    assert.equal(r.statusCode, 405);
  }
  assert.equal(JSON.stringify([...mem]), before);
});

test("résumé : lit seulement le budget du propriétaire, en-tête no-store", async () => {
  env({ APP_USERS: USERS, SUMMARY_KEY: SKEY });
  mem.set("budget-v2:soeur", { state: { currency: "XOF", income: [{ amount: 999 }] }, tx: {} });
  const r = await call(summary, { headers: { "x-summary-key": SKEY } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(r.body.incomePlanned, 0);
  assert.equal(r.body.currency, null);
});

test("résumé : calcul sur un état fictif, sans données brutes", async () => {
  const now = new Date("2026-11-30T23:30:00Z"); // déjà le 1er décembre à Paris
  const state = {
    currency: "EUR",
    income: [{ id: "a", name: "Salaire", amount: 2000, day: 27 }, { id: "b", name: "Prime", amount: "150.5", day: 5 }],
    cats: [{ id: "courses", group: "Vie quotidienne" }, { id: "livret", group: "Épargne & invest" }],
    accounts: [{ id: "x", name: "Courant", kind: "Compte courant", balance: 1200.1 }, { id: "y", name: "Livret A", balance: 3000.2 }],
    goals: [{ name: "Voyage", target: 1000, saved: 250, scene: "aube" }, { name: "Fini", target: 100, saved: 150 }, { name: "Vide", target: 0, saved: 0 }]
  };
  const txs = {
    "2026-12": [
      { type: "out", amount: 40, cat: "courses", label: "Lidl", note: "secret" },
      { type: "out", amount: 10.25, cat: "", label: "Divers" },
      { type: "out", amount: 300, cat: "livret", label: "Virement livret" },
      { type: "in", amount: 2000, plan: "i:a", label: "Salaire" }
    ],
    "2026-11": [{ type: "out", amount: 999, cat: "courses" }]
  };
  const s = computeSummary({ state, tx: txs }, new Date("2026-11-30T20:00:00Z"), now);
  assert.deepEqual(s, {
    month: "2026-12",
    currency: "EUR",
    incomePlanned: 2150.5,
    spentThisMonth: 50.25,
    remaining: 2100.25,
    accountsTotal: 4200.3,
    accounts: [{ name: "Courant", balance: 1200.1 }, { name: "Livret A", balance: 3000.2 }],
    goals: [
      { name: "Voyage", target: 1000, saved: 250, percent: 25 },
      { name: "Fini", target: 100, saved: 150, percent: 100 },
      { name: "Vide", target: 0, saved: 0, percent: 0 }
    ],
    updatedAt: "2026-11-30T20:00:00.000Z"
  });
  const txt = JSON.stringify(s);
  assert.ok(!txt.includes("Lidl") && !txt.includes("secret") && !txt.includes("aube"));
});

test("résumé : budget vide ou malformé ne plante pas", () => {
  const s = computeSummary(null, null, new Date("2026-06-15T12:00:00Z"));
  assert.equal(s.month, "2026-06");
  assert.equal(s.remaining, 0);
  assert.deepEqual(s.accounts, []);
  const t = computeSummary({ state: { income: "x", accounts: [null, { balance: "abc" }] }, tx: { "2026-06": "x" } }, null, new Date("2026-06-15T12:00:00Z"));
  assert.equal(t.accountsTotal, 0);
});
