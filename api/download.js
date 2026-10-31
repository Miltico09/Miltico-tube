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
  const nombreLimpio = base.length > 2 ? base : `Video_Pro`;
  return `${nombreLimpio}_${quality}_${tag}.${ext}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let { url, mode = 'auto', quality = 'max', cookie = '' } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  const uaDesktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const uaMobile = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

  try {
    if (url.includes('instagram.com')) url = url.split('?')[0];
    if (url.includes('fb.watch') || url.includes('/share/')) {
      const redir = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': uaMobile } });
      if (redir.url && redir.url.startsWith('http')) url = redir.url;
    }
  } catch (e) {}

  const ext = mode === 'audio' ? 'mp3' : 'mp4';
  const qLabel = mode === 'audio' ? 'MP3' : (quality === 'max' ? 'MAX' : `${quality}p`);

  // ==========================================
  // 1. MOTOR YOUTUBE (Directo y Confiable)
  // ==========================================
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    try {
      const ytRes = await fetch('https://co.eepy.today/api/json', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': uaDesktop },
        body: JSON.stringify({
          url: url,
          videoQuality: String(quality),
          audioFormat: 'mp3',
          filenameStyle: 'pretty',
          downloadMode: mode === 'audio' ? 'audio' : 'auto'
        })
      });
      const ytData = await ytRes.json();
      if (ytData.url) {
        const title = ytData.filename || 'YouTube_Video';
        return res.status(200).json({
          url: ytData.url,
          title,
          thumb: '',
          filename: limpiarNombre(title, ext, qLabel)
        });
      }
    } catch (e) {}
  }

  // ==========================================
  // 2. MOTOR TIKTOK (Sin marca de agua)
  // ==========================================
  if (url.includes('tiktok.com')) {
    try {
      const ttRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
        headers: { 'User-Agent': uaMobile }
      });
      const ttData = await ttRes.json();
      if (ttData.code === 0 && ttData.data) {
        const d = ttData.data;
        const desc = d.title || d.author?.nickname || 'TikTok_Video';
        const hdUrl = d.hdplay || d.play;
        const sdUrl = d.play || d.wmplay;
        const mp3Url = d.music;

        if (d.images && d.images.length > 0 && mode !== 'audio') {
          return res.status(200).json({
            url: d.images[0],
            title: desc,
            thumb: d.cover,
            author: d.author?.nickname || 'TikTok',
            filename: limpiarNombre(desc, 'jpg', 'Carrusel')
          });
        }

        const chosenUrl = mode === 'audio' ? mp3Url : (quality === '720' ? sdUrl : hdUrl);
        return res.status(200).json({
          url: chosenUrl,
          title: desc,
          thumb: d.cover,
          author: d.author?.nickname || 'TikTok',
          filename: limpiarNombre(desc, ext, qLabel)
        });
      }
    } catch (e) {}
  }

  // ==========================================
  // 3. INSTAGRAM REELS
  // ==========================================
  if (url.includes('instagram.com')) {
    try {
      const igMatch = url.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
      if (igMatch) {
        const shortcode = igMatch[1];
        const headers = { 'User-Agent': uaDesktop, 'Accept-Language': 'es-ES,es;q=0.9' };
        if (cookie) headers['Cookie'] = cookie;

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
            title: rawCaption.slice(0, 90) || `Instagram Reel`,
            thumb: cleanThumb,
            author: 'Instagram',
            filename: limpiarNombre(rawCaption, ext, qLabel)
          });
        }
      }
    } catch (e) {}
  }

  // ==========================================
  // 4. FACEBOOK
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
        return res.status(200).json({
          url: bestFbUrl,
          title: fbTitle,
          author: 'Facebook',
          filename: limpiarNombre(fbTitle, ext, qLabel)
        });
      }
    } catch (e) {}
  }

  // ==========================================
  // 5. PASARELA UNIVERSAL DE RESPALDO (Para cualquier plataforma)
  // ==========================================
  try {
    const r = await fetch(`https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': uaMobile }
    });
    const d = await r.json();
    const dlList = d?.data?.downloads || d?.downloads || [];
    if (dlList.length > 0) {
      const best = dlList.find(x => x.url) || dlList[0];
      const title = d?.data?.title || d?.title || 'Video_Social';
      return res.status(200).json({
        url: best.url,
        title,
        thumb: d?.data?.thumbnail || d?.thumbnail || '',
        filename: limpiarNombre(title, ext, qLabel)
      });
    }
  } catch (e) {}

  return res.status(500).json({ error: 'No se pudo procesar el enlace. Verifica que la publicación sea pública.' });
}
