const { handler } = require("../../lib/enable");
const store = require("../../lib/store");

// État de la connexion bancaire (session + dernières données), quel que soit l'appareil.
module.exports = handler(async () => {
  const [s, d] = await Promise.all([store.get("bank"), store.get("bankdata")]);
  return { bank: s ? s.v : null, data: d ? d.v : null };
});
