// Busca a planilha do Google como CSV no servidor (evita problemas de CORS no navegador).
const SHEET_ID = process.env.SHEET_ID || "1UUcfkqzARSFsYahlaAvpDdeVIa9WhOvR_9NknEPz6Cc";

module.exports = async (req, res) => {
  const sheet = req.query.sheet ? `&sheet=${encodeURIComponent(req.query.sheet)}` : "";
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=0${sheet}`;
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) throw new Error(`Google respondeu ${r.status}`);
    const text = await r.text();
    if (/^\s*<!doctype html|<html/i.test(text)) throw new Error("A planilha não está pública");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    res.status(200).send(text);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
