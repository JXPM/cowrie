const { eb, handler } = require("../../lib/enable");

function txText(t) {
  const parts = [];
  if (t.creditor && t.creditor.name) parts.push(t.creditor.name);
  if (t.debtor && t.debtor.name) parts.push(t.debtor.name);
  if (Array.isArray(t.remittance_information)) parts.push(t.remittance_information.join(" "));
  else if (t.remittance_information) parts.push(String(t.remittance_information));
  if (t.note) parts.push(t.note);
  return parts.filter(Boolean).join(" · ").replace(/\s+/g, " ").trim();
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
