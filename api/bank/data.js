const { eb, handler } = require("../../lib/enable");

const SKIP = /^(booking_date|value_date|transaction_date|entry_reference|transaction_id|status|credit_debit_indicator|currency|amount|iban|bban|bic|other|currency_exchange|balance_after_transaction)$/;
// Concatène tous les champs texte utiles (les banques rangent le libellé à des endroits différents).
function txText(t) {
  const seen = new Set(), parts = [];
  function walk(v, key, depth) {
    if (v == null || depth > 3) return;
    if (typeof v === "string") { const s = v.trim(); if (s && !SKIP.test(key) && !seen.has(s)) { seen.add(s); parts.push(s); } return; }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key, depth + 1));
    if (typeof v === "object") Object.keys(v).forEach((k) => { if (!SKIP.test(k)) walk(v[k], k, depth + 1); });
  }
  ["creditor", "debtor", "remittance_information", "remittance_information_unstructured", "remittance_information_structured",
   "additional_information", "note", "merchant", "bank_transaction_code", "creditor_name", "debtor_name", "purpose_code"]
    .forEach((k) => walk(t[k], k, 0));
  return parts.join(" · ").replace(/\s+/g, " ").trim();
}

function pickBalance(balances) {
  const order = ["CLAV", "XPCD", "ITAV", "CLBD", "ITBD", "OPBD"];
  const list = balances || [];
  for (const type of order) { const b = list.find((x) => x.balance_type === type); if (b) return b; }
  return list[0] || null;
}

// GET ?session_id&accounts=uid1,uid2&from=YYYY-MM-DD&to=YYYY-MM-DD
// Renvoie solde + transactions de chaque compte (à mettre en cache côté client : quotas bancaires ~4 appels/jour/compte).
module.exports = handler(async (req) => {
  const { session_id, accounts, from, to } = req.query;
  if (!session_id || !accounts) throw Object.assign(new Error("session_id et accounts requis"), { status: 400 });
  const uids = String(accounts).split(",").filter(Boolean);
  const dateTo = to || new Date().toISOString().slice(0, 10);
  const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const out = [];
  for (const uid of uids) {
    const acc = { uid, balance: null, transactions: [], errors: [] };
    try {
      const b = await eb("GET", "/accounts/" + encodeURIComponent(uid) + "/balances");
      const bal = pickBalance(b.balances);
      if (bal) acc.balance = { amount: Number(bal.balance_amount.amount), currency: bal.balance_amount.currency };
    } catch (e) { acc.errors.push("solde : " + e.message); }
    try {
      let key = null, guard = 0;
      do {
        const q = "?date_from=" + dateFrom + "&date_to=" + dateTo + (key ? "&continuation_key=" + encodeURIComponent(key) : "");
        const t = await eb("GET", "/accounts/" + encodeURIComponent(uid) + "/transactions" + q);
        for (const tx of t.transactions || []) {
          const amt = Number(tx.transaction_amount && tx.transaction_amount.amount) || 0;
          const debit = tx.credit_debit_indicator === "DBIT";
          acc.transactions.push({
            id: tx.entry_reference || tx.transaction_id || (uid + ":" + (tx.booking_date || tx.value_date) + ":" + amt + ":" + txText(tx)).slice(0, 120),
            date: tx.booking_date || tx.value_date || tx.transaction_date || null,
            amount: debit ? -Math.abs(amt) : Math.abs(amt),
            currency: (tx.transaction_amount && tx.transaction_amount.currency) || "EUR",
            text: txText(tx),
            pending: tx.status === "PDNG" || tx.status === "PEND",
            account: uid,
          });
        }
        key = t.continuation_key || null;
      } while (key && ++guard < 10);
    } catch (e) { acc.errors.push("transactions : " + e.message); }
    acc.transactions.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    out.push(acc);
  }
  return { fetched_at: new Date().toISOString(), from: dateFrom, to: dateTo, accounts: out };
});
