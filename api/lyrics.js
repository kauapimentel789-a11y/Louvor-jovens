// Busca a letra no LRCLIB (letras sincronizadas abertas) e devolve as opções encontradas.
module.exports = async (req, res) => {
  const track = String(req.query.track || "").slice(0, 150).trim();
  const artist = String(req.query.artist || "").slice(0, 150).trim();
  if (!track) return res.status(400).json({ error: "Informe a música em ?track=" });
  const get = async qs => {
    const r = await fetch(`https://lrclib.net/api/search?${qs}`, { headers: { "User-Agent": "louvor-jovens (https://louvor-jovens.vercel.app)" } });
    return r.ok ? r.json() : [];
  };
  try {
    let list = artist ? await get(`track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}`) : [];
    if (!list.length) list = await get(`q=${encodeURIComponent(track)}`);
    const out = list.filter(x => x.syncedLyrics || x.plainLyrics).slice(0, 10).map(x => ({
      track: x.trackName, artist: x.artistName, duration: x.duration, synced: x.syncedLyrics || null, plain: x.plainLyrics || null,
    }));
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
