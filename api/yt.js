// Procura uma música no YouTube e devolve o id do primeiro vídeo, para o botão abrir direto no vídeo.
module.exports = async (req, res) => {
  const q = String(req.query.q || "").slice(0, 200).trim();
  if (!q) return res.status(400).json({ error: "Informe a música em ?q=" });
  try {
    const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=pt-BR&gl=BR`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Cookie": "CONSENT=YES+1",
      },
    });
    if (!r.ok) throw new Error(`YouTube respondeu ${r.status}`);
    const html = await r.text();
    const m = html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/) || html.match(/"videoId":"([\w-]{11})"/);
    res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=86400");
    res.status(200).json({ id: m ? m[1] : null });
  } catch (e) {
    res.status(502).json({ error: e.message, id: null });
  }
};
