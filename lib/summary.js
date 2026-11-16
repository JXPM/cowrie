// Calcul du résumé de budget pour Johan OS, à partir de la forme réelle des données de index.html :
//   budget = { state: S.state, tx: S.tx }
//   S.state.income[]   : { name, amount, day }           → revenus prévus chaque mois
//   S.state.cats[]     : { id, name, group, budget, ... } → catégories ; group « Épargne & invest » = épargne
//   S.state.accounts[] : { name, kind, balance }
//   S.state.goals[]    : { name, target, saved }
//   S.state.currency   : "EUR", "XOF", ...
//   S.tx["AAAA-MM"][]  : { type: "in" | "out", amount, cat, date: "AAAA-MM-JJ", label, ... }
//
// Hypothèses (identiques au mode « réel » de l'écran Budget, fonction spentTotal) :
//   - spentThisMonth = opérations du mois courant dont type n'est pas « in », hors catégories d'épargne
//     (un virement vers un livret n'est pas une dépense) ;
//   - incomePlanned = somme des revenus prévus (S.state.income) ;
//   - remaining = incomePlanned - spentThisMonth (les revenus ponctuels hors prévision ne sont pas comptés) ;
//   - pourcentage d'un objectif = saved / target, borné entre 0 et 100, arrondi à l'unité ;
//   - le mois courant est celui du jour à Paris.
const SAVE_GROUP = "Épargne & invest";

const num = v => (typeof v === "number" && isFinite(v) ? v : (isFinite(parseFloat(v)) ? parseFloat(v) : 0));
const cents = v => Math.round(v * 100) / 100;
const arr = v => (Array.isArray(v) ? v : []);
const str = v => (typeof v === "string" ? v.slice(0, 80) : "");

function parisMonth(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find(x => x.type === "year").value}-${p.find(x => x.type === "month").value}`;
}

function computeSummary(budget, updatedAt, now = new Date()) {
  const month = parisMonth(now);
  const st = (budget && budget.state) || {};
  const tx = (budget && budget.tx) || {};
  const saveCats = new Set(arr(st.cats).filter(c => c && c.group === SAVE_GROUP).map(c => c.id));

  const incomePlanned = cents(arr(st.income).reduce((s, i) => s + num(i && i.amount), 0));
  const spentThisMonth = cents(arr(tx[month])
    .filter(t => t && t.type !== "in" && !saveCats.has(t.cat))
    .reduce((s, t) => s + num(t.amount), 0));
  const accounts = arr(st.accounts).filter(Boolean).map(a => ({ name: str(a.name), balance: cents(num(a.balance)) }));
  const goals = arr(st.goals).filter(Boolean).map(g => {
    const target = cents(num(g.target)), saved = cents(num(g.saved));
    return { name: str(g.name), target, saved, percent: target > 0 ? Math.round(Math.min(Math.max(saved / target, 0), 1) * 100) : 0 };
  });

  return {
    month,
    currency: typeof st.currency === "string" ? st.currency : null,
    incomePlanned,
    spentThisMonth,
    remaining: cents(incomePlanned - spentThisMonth),
    accountsTotal: cents(accounts.reduce((s, a) => s + a.balance, 0)),
    accounts,
    goals,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null
  };
}

module.exports = { computeSummary, parisMonth, SAVE_GROUP };
