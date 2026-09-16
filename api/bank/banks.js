const { eb, handler } = require("../../lib/enable");

// Liste des banques disponibles pour un pays (par défaut FR), particuliers uniquement.
module.exports = handler(async (req) => {
  const country = String(req.query.country || "FR").toUpperCase();
  const data = await eb("GET", "/aspsps?country=" + encodeURIComponent(country) + "&psu_type=personal");
  return (data.aspsps || [])
    .map((a) => ({ name: a.name, country: a.country, logo: a.logo || null }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
});
