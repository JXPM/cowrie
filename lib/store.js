// Petit stockage clé → JSON dans Neon Postgres (table `store`).
const { neon } = require("@neondatabase/serverless");

let sql = null;
function db() {
  if (!sql) {
    if (!process.env.DATABASE_URL) throw Object.assign(new Error("DATABASE_URL manquant"), { status: 500 });
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

async function get(k) {
  const rows = await db()`SELECT v, updated_at FROM store WHERE k = ${k}`;
  return rows[0] ? { v: rows[0].v, updated_at: rows[0].updated_at } : null;
}
async function set(k, v) {
  await db()`INSERT INTO store (k, v, updated_at) VALUES (${k}, ${JSON.stringify(v)}::jsonb, now())
             ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
}
async function del(k) { await db()`DELETE FROM store WHERE k = ${k}`; }

module.exports = { get, set, del };
