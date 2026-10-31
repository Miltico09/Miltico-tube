function limpiarNombre(texto, ext = 'mp4', quality = 'HD') {
  const base = (texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/#[a-zA-Z0-9_]+/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join('_');

  const tag = Math.floor(100 + Math.random() * 900);
  const nombreLimpio = base.length > 2 ? base : `Video_Extraido`;
  return `${nombreLimpio}_${quality}_${tag}.${ext}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let { url, mode = 'auto', quality = 'max', cookie = '' } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  const uaDesktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const uaMobile = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

  // Limpieza profunda de URLs de Instagram y Facebook
  try {
    if (url.includes('instagram.com')) {
      url = url.split('?')[0]; // Remueve rastreadores como ?igsh=...
    }
    if (url.includes('fb.watch') || url.includes('/share/')) {
      const redir = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': uaMobile } });
      if (redir.url && redir.url.startsWith('http')) url = redir.url;
    }
  } catch (e) {}

  const ext = mode === 'audio' ? 'mp3' : 'mp4';
  const qLabel = mode === 'audio' ? 'MP3' : (quality === 'max' ? 'MAX' : `${quality}p`);

  // ==========================================
  // 1. MOTOR ESPECIALIZADO INSTAGRAM REELS
  // ==========================================
  if (url.includes('instagram.com')) {
    const igMatches = [
      `https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(url)}`,
      `https://www.instagram.com/p/${(url.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/) || [])[1]}/embed/captioned/`
    ];

    try {
      // Intento A: API externa robusta para Reels (Evita bloqueos de IP en Vercel)
      const r = await fetch(igMatches[0], { headers: { 'User-Agent': uaMobile } });
      const d = await r.json();
      const dlList = d?.data?.downloads || d?.downloads || [];
      if (dlList.length > 0) {
        const best = dlList.find(x => x.url) || dlList[0];
        const title = d?.data?.title || d?.title || 'Instagram_Reel';
        return res.status(200).json({
          url: best.url,
          title,
          thumb: d?.data?.thumbnail || d?.thumbnail || '',
          author: 'Instagram Reel',
          filename: limpiarNombre(title, ext, qLabel),
          formats: dlList.map(item => ({ label: `🎬 ${item.quality || 'HD'}`, url: item.url, ext: 'mp4' }))
        });
      }
    } catch (e) {}

    // Intento B: Extracción directa de Embed con cabeceras de Cookies opcionales
    try {
      const igMatch = url.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
      if (igMatch) {
        const shortcode = igMatch[1];
        const headers = { 'User-Agent': uaDesktop, 'Accept-Language': 'es-ES,es;q=0.9' };
        if (cookie) headers['Cookie'] = cookie; // Permite saltar restricción de cuenta privada si el usuario provee su cookie

        const embedRes = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, { headers });
        const html = await embedRes.text();
        const videoMatch = html.match(/"video_url":"([^"]+)"/) || html.match(/video_url\\?":\\?"([^"\\]+)/);
        const thumbMatch = html.match(/"display_url":"([^"]+)"/);
        const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/);

        if (videoMatch && videoMatch[1]) {
          const cleanVideoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          const cleanThumb = thumbMatch ? thumbMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '') : '';
          const rawCaption = captionMatch ? captionMatch[1].replace(/<[^>]+>/g, ' ').trim() : `Reel_${shortcode}`;
          return res.status(200).json({
            url: cleanVideoUrl,
            title: rawCaption.slice(0, 90) || `Instagram Reel ${shortcode}`,
            thumb: cleanThumb,
            author: 'Instagram',
            filename: limpiarNombre(rawCaption, ext, qLabel),
            formats: [{ label: '🔥 MAX HD (Original)', url: cleanVideoUrl, ext: 'mp4' }]
          });
        }
      }
    } catch (e) {}
  }

  // ==========================================
  // 2. MOTOR FACEBOOK (Público y Privado con Cookies)
  // ==========================================
  if (url.includes('facebook.com') || url.includes('fb.')) {
    try {
      const headers = { 'User-Agent': uaDesktop, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
      if (cookie) headers['Cookie'] = cookie;

      const fbRes = await fetch(url, { headers, redirect: 'follow' });
      const html = await fbRes.text();

      const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/) || html.match(/hd_src:"([^"]+)"/);
      const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/) || html.match(/sd_src:"([^"]+)"/);
      const titleMatch = html.match(/property="og:description"\s+content="([^"]+)"/i) || html.match(/property="og:title"\s+content="([^"]+)"/i);

      const hdUrl = hdMatch ? JSON.parse(`"${hdMatch[1]}"`).replace(/\\/g, '') : null;
      const sdUrl = sdMatch ? JSON.parse(`"${sdMatch[1]}"`).replace(/\\/g, '') : null;
      const bestFbUrl = quality === '720' ? (sdUrl || hdUrl) : (hdUrl || sdUrl);

      if (bestFbUrl) {
        const fbTitle = titleMatch ? titleMatch[1].replace(/\| Facebook|Facebook/gi, '').trim() : 'Video_de_Facebook';
        const formats = [];
        if (hdUrl) formats.push({ label: '🔥 1080p / HD Máximo', url: hdUrl, ext: 'mp4' });
        if (sdUrl) formats.push({ label: '⚡ 720p / SD Rápido', url: sdUrl, ext: 'mp4' });

        return res.status(200).json({
          url: bestFbUrl,
          title: fbTitle,
          author: 'Facebook',
          filename: limpiarNombre(fbTitle, ext, qLabel),
          formats
        });
      }
    } catch (e) {}
  }

  // ==========================================
  // 3. RESPALDO MULTIRRED GENERAL (TikTok, YouTube, etc.)
  // ==========================================
  const multiApis = [
    `https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(url)}`,
    `https://allsocial.vercel.app/api/download?url=${encodeURIComponent(url)}`
  ];

  for (const apiEndpoint of multiApis) {
    try {
      const r = await fetch(apiEndpoint, { headers: { 'User-Agent': uaMobile } });
      const d = await r.json();
      const dlList = d?.data?.downloads || d?.downloads || d?.medias || [];
      if (dlList.length > 0) {
        const valid = dlList.filter(item => item.url);
        if (valid.length > 0) {
          const title = d?.data?.title || d?.title || 'Video_Extraido';
          const formats = valid.map((item, idx) => ({
            label: `${item.quality || item.resolution || item.ext || `Opción ${idx + 1}`}`,
            url: item.url,
            ext: (item.ext || 'mp4').replace('.', '')
          }));
          const chosen = valid[0];
          return res.status(200).json({
            url: chosen.url,
            title,
            thumb: d?.data?.thumbnail || d?.thumbnail || '',
            author: d?.data?.source || 'Stream HD',
            filename: limpiarNombre(title, ext, qLabel),
            formats
          });
        }
      }
    } catch (e) {}
  }

  return res.status(500).json({ error: 'No se pudo extraer. Si el vídeo o Reel es privado, despliega el menú de Cookies para autorización.' });
}
