// Petit stockage clé → JSON dans Neon Postgres (table `store`).
let sql = null;
function db() {
  if (!sql) {
    if (!process.env.DATABASE_URL) throw Object.assign(new Error("DATABASE_URL manquant"), { status: 500 });
    const { neon } = require("@neondatabase/serverless"); // chargé seulement si une vraie base est utilisée
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

// Pour les tests : un faux stockage en mémoire peut remplacer Neon (aucune vraie base n'est touchée).
let backend = null;
function useBackend(b) { backend = b || null; }

async function get(k) {
  if (backend) return backend.get(k);
  const rows = await db()`SELECT v, updated_at FROM store WHERE k = ${k}`;
  return rows[0] ? { v: rows[0].v, updated_at: rows[0].updated_at } : null;
}
async function set(k, v) {
  if (backend) return backend.set(k, v);
  await db()`INSERT INTO store (k, v, updated_at) VALUES (${k}, ${JSON.stringify(v)}::jsonb, now())
             ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
}
async function del(k) { if (backend) return backend.del(k); await db()`DELETE FROM store WHERE k = ${k}`; }

module.exports = { get, set, del, useBackend };
