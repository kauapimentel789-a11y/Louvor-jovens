// Monta no Spotify uma playlist por ensaio/culto, sempre na conta do dono do site.
// Variáveis na Vercel: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET e SPOTIFY_REFRESH_TOKEN
// (o refresh token sai do próprio site: abra /api/spotify?login e entre com a conta do Spotify).
//   GET /api/spotify?login            → leva para o login do Spotify
//   GET /api/spotify?code=...          → volta do login e mostra o SPOTIFY_REFRESH_TOKEN
//   GET /api/spotify?name=...&s=música|autor|link&s=...  → cria/atualiza a playlist e devolve o link
const API = "https://api.spotify.com/v1";
const PREFIX = "Louvor Jovens · ";
const { SPOTIFY_CLIENT_ID: ID, SPOTIFY_CLIENT_SECRET: SECRET, SPOTIFY_REFRESH_TOKEN: REFRESH } = process.env;

const redirectUri = req => process.env.SPOTIFY_REDIRECT_URI || `https://${req.headers.host}/api/spotify`;
const basic = () => "Basic " + Buffer.from(`${ID}:${SECRET}`).toString("base64");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function tokenRequest(params) {
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `Spotify respondeu ${r.status}`);
  return j;
}

// Um único pedido de token por vez, reaproveitado enquanto vale (as buscas rodam em paralelo).
let cached = { token: null, until: 0 };
function accessToken() {
  if (cached.token && Date.now() < cached.until) return cached.token;
  cached.token = tokenRequest({ grant_type: "refresh_token", refresh_token: REFRESH })
    .then(j => { cached.until = Date.now() + (j.expires_in - 60) * 1000; return j.access_token; })
    .catch(e => { cached = { token: null, until: 0 }; throw e; });
  cached.until = Date.now() + 30000;
  return cached.token;
}

async function sp(path, opts = {}) {
  const r = await fetch(path.startsWith("http") ? path : API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || `Spotify respondeu ${r.status}`);
  return j;
}

// "Algo Novo / Fez um caminho" vira duas faixas; o autor acompanha a parte de mesmo índice quando há mais de um.
// Um link do Spotify na coluna Link da planilha manda mais que a busca.
function tracksOf(entry) {
  const [musica, autor = "", link = ""] = entry.split("|");
  const parts = musica.split("/").map(p => p.trim()).filter(Boolean);
  const authors = autor.split(/[\/,]/).map(a => a.trim()).filter(Boolean);
  const id = parts.length === 1 && (link.match(/open\.spotify\.com\/(?:intl-\w+\/)?track\/(\w{22})/) || [])[1];
  return parts.map((p, i) => ({ title: p, artist: authors[i] || authors[0] || "", uri: id ? `spotify:track:${id}` : null }));
}

const norm = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, " ").replace(/ - .*$/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Só aceita resultado cujo nome bate com o da planilha; o artista certo ganha pontos.
// Melhor deixar a música de fora do que colocar outra no lugar.
function score(t, title, artist) {
  const a = norm(t.name), b = norm(title);
  const tit = a === b ? 3 : a.startsWith(b) || b.startsWith(a) ? 2 : 0;
  if (!tit) return 0;
  const names = (t.artists || []).map(x => norm(x.name));
  const want = artist.split(/[\/,&]| e | feat /i).map(norm).filter(Boolean);
  const art = want.some(w => names.some(n => n.includes(w) || w.includes(n))) ? 3 : 0;
  return tit + art;
}

async function findTrack({ title, artist, uri }) {
  if (uri) return uri;
  const tries = artist ? [`track:${title} artist:${artist}`, `${title} ${artist}`, title] : [title];
  let best = null, bestScore = 0;
  for (const q of tries) {
    const j = await sp(`/search?type=track&limit=10&market=BR&q=${encodeURIComponent(q)}`);
    for (const t of (j.tracks && j.tracks.items) || []) {
      const sc = t && score(t, title, artist);
      if (sc > bestScore) { best = t; bestScore = sc; }
    }
    if (bestScore >= 5 || (!artist && bestScore >= 3)) break;
  }
  return best ? best.uri : null;
}

async function findPlaylist(name) {
  const me = await sp("/me");
  for (let url = "/me/playlists?limit=50", n = 0; url && n < 6; n++) {
    const j = await sp(url);
    const hit = (j.items || []).find(p => p && p.name === name && p.owner && p.owner.id === me.id);
    if (hit) return hit;
    url = j.next;
  }
  return null;
}

async function playlist(req, res) {
  const name = PREFIX + String(req.query.name || "").slice(0, 80).trim();
  const entries = [].concat(req.query.s || []).map(s => String(s).slice(0, 200)).filter(Boolean).slice(0, 60);
  if (!entries.length) return res.status(400).json({ error: "Nenhuma música em ?s=" });
  const tracks = entries.flatMap(tracksOf);
  const uris = await Promise.all(tracks.map(t => findTrack(t).catch(() => null)));
  const pl = (await findPlaylist(name)) ||
    (await sp("/me/playlists", { method: "POST", body: JSON.stringify({ name, public: true, description: "Músicas do ensaio, montada automaticamente pelo site louvor-jovens.vercel.app" }) }));
  await sp(`/playlists/${pl.id}/items`, { method: "PUT", body: JSON.stringify({ uris: uris.filter(Boolean).slice(0, 100) }) });
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");
  res.status(200).json({
    url: pl.external_urls ? pl.external_urls.spotify : `https://open.spotify.com/playlist/${pl.id}`,
    found: uris.filter(Boolean).length,
    missing: tracks.filter((_, i) => !uris[i]).map(t => t.title),
  });
}

function page(res, title, body) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;background:#120c08;color:#fbf3ea"><h1 style="font-size:22px">${esc(title)}</h1>${body}</body>`);
}

module.exports = async (req, res) => {
  try {
    if (!ID || !SECRET) return res.status(503).json({ error: "Spotify ainda não configurado" });
    if ("login" in req.query) {
      const qs = new URLSearchParams({ client_id: ID, response_type: "code", redirect_uri: redirectUri(req), scope: "playlist-modify-public playlist-modify-private playlist-read-private", show_dialog: "true" });
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, `https://accounts.spotify.com/authorize?${qs}`);
    }
    if (req.query.code || req.query.error) {
      if (req.query.error) return page(res, "Login cancelado", `<p>O Spotify respondeu: ${esc(req.query.error)}</p>`);
      const j = await tokenRequest({ grant_type: "authorization_code", code: req.query.code, redirect_uri: redirectUri(req) });
      return page(res, "Spotify conectado", `<p>Copie o código abaixo e salve na Vercel em <b>Settings → Environment Variables</b> com o nome <code>SPOTIFY_REFRESH_TOKEN</code>. Depois faça um novo deploy (Deployments → Redeploy).</p>
<textarea readonly rows="5" style="width:100%;font:14px monospace;padding:10px;border-radius:10px" onclick="this.select()">${esc(j.refresh_token)}</textarea>
<p style="opacity:.7">Não compartilhe esse código: ele dá acesso às playlists da conta.</p>`);
    }
    if (!REFRESH) return res.status(503).json({ error: "Falta SPOTIFY_REFRESH_TOKEN" });
    return await playlist(req, res);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
