# Louvor Jovens

Site com as músicas dos ensaios e cultos. Os dados vêm direto da planilha do Google
(uma aba por mês, ex.: "setembro", "outubro"). Basta editar a planilha; o site atualiza sozinho.

- `index.html`: o site inteiro (GitHub Pages).
- `api/sheet.js`: proxy opcional para hospedar na Vercel.
- `api/spotify.js`: monta uma playlist no Spotify para cada ensaio/culto (botão "Ouvir no Spotify").
  Precisa das variáveis `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` e `SPOTIFY_REFRESH_TOKEN` na Vercel;
  o refresh token aparece ao abrir `/api/spotify?login` e entrar com a conta do Spotify.
