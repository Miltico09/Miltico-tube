function limpiarNombre(texto, ext = 'mp4', quality = 'HD') {
  const base = (texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/https?:\/\/[^\s]+/g, '')                // Quitar links
    .replace(/#[a-zA-Z0-9_]+/g, '')                   // Quitar hashtags
    .replace(/[^a-zA-Z0-9\s_-]/g, '')                 // Solo letras y números
    .trim()
    .split(/\s+/)
    .slice(0, 8)                                      // Primeras 8 palabras de la descripción
    .join('_');

  const tag = Math.floor(100 + Math.random() * 900);  // Código único para no sobrescribir
  const nombreLimpio = base.length > 2 ? base : `Video_Extraido`;
  return `${nombreLimpio}_${quality}_${tag}.${ext}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let { url, mode = 'auto', quality = 'max' } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  const uaMobile = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const uaDesktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  // 0. Desenredador de enlaces cortos (fb.watch, share/r/, vm.tiktok)
  try {
    if (url.includes('fb.watch') || url.includes('/share/') || url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com')) {
      const redir = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': uaMobile } });
      if (redir.url && redir.url.startsWith('http')) url = redir.url;
    }
  } catch (e) {}

  const ext = mode === 'audio' ? 'mp3' : 'mp4';
  const qLabel = mode === 'audio' ? 'MP3' : (quality === 'max' ? 'MAX' : `${quality}p`);

  // 1. MOTOR TIKTOK
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
        const coverHd = d.origin_cover || d.cover;

        if (d.images && d.images.length > 0 && mode !== 'audio') {
          return res.status(200).json({
            url: d.images[0],
            title: desc,
            thumb: coverHd,
            author: d.author?.nickname || 'TikTok',
            filename: limpiarNombre(desc, 'jpg', 'Carrusel'),
            picker: d.images.map(img => ({ url: img }))
          });
        }

        const chosenUrl = mode === 'audio' ? mp3Url : (quality === '720' ? sdUrl : hdUrl);
        return res.status(200).json({
          url: chosenUrl,
          title: desc,
          thumb: coverHd,
          author: d.author?.nickname || 'TikTok',
          filename: limpiarNombre(desc, ext, qLabel),
          formats: [
            { label: '🔥 MAX HD (Sin Marca)', url: hdUrl, ext: 'mp4' },
            { label: '⚡ 720p Ligero', url: sdUrl, ext: 'mp4' },
            { label: '🎵 Audio Original MP3', url: mp3Url, ext: 'mp3' }
          ].filter(f => f.url)
        });
      }
    } catch (e) {}
  }

  // 2. MOTOR NATIVO INSTAGRAM & FACEBOOK
  if (url.includes('instagram.com') || url.includes('facebook.com') || url.includes('fb.')) {
    if (url.includes('instagram.com')) {
      try {
        const igMatch = url.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
        if (igMatch) {
          const shortcode = igMatch[1];
          const embedRes = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
            headers: { 'User-Agent': uaDesktop, 'Accept-Language': 'es-ES,es;q=0.9' }
          });
          const html = await embedRes.text();
          const videoMatch = html.match(/"video_url":"([^"]+)"/) || html.match(/video_url\\?":\\?"([^"\\]+)/);
          const thumbMatch = html.match(/"display_url":"([^"]+)"/) || html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/);
          const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/);
          
          if (videoMatch && videoMatch[1]) {
            const cleanVideoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
            const cleanThumb = thumbMatch ? thumbMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '') : '';
            const rawCaption = captionMatch ? captionMatch[1].replace(/<[^>]+>/g, ' ').trim() : `Reel_${shortcode}`;
            return res.status(200).json({
              url: cleanVideoUrl,
              title: rawCaption.slice(0, 100) || `Instagram Reel ${shortcode}`,
              thumb: cleanThumb,
              author: 'Instagram',
              filename: limpiarNombre(rawCaption, ext, qLabel),
              formats: [{ label: '🔥 MAX HD (Original)', url: cleanVideoUrl, ext: 'mp4' }]
            });
          }
        }
      } catch (e) {}
    }

    if (url.includes('facebook.com') || url.includes('fb.')) {
      try {
        const fbRes = await fetch(url, {
          headers: {
            'User-Agent': uaDesktop,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Sec-Fetch-Mode': 'navigate'
          },
          redirect: 'follow'
        });
        const html = await fbRes.text();

        const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/) || html.match(/hd_src:"([^"]+)"/);
        const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/) || html.match(/sd_src:"([^"]+)"/);
        const titleMatch = html.match(/property="og:description"\s+content="([^"]+)"/i) || html.match(/property="og:title"\s+content="([^"]+)"/i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const thumbMatch = html.match(/property="og:image"\s+content="([^"]+)"/i);

        const hdUrl = hdMatch ? JSON.parse(`"${hdMatch[1]}"`).replace(/\\/g, '') : null;
        const sdUrl = sdMatch ? JSON.parse(`"${sdMatch[1]}"`).replace(/\\/g, '') : null;
        const bestFbUrl = quality === '720' ? (sdUrl || hdUrl) : (hdUrl || sdUrl);

        if (bestFbUrl) {
          const fbTitle = titleMatch ? titleMatch[1].replace(/\| Facebook|Facebook/gi, '').trim() : 'Video_de_Facebook';
          const fbThumb = thumbMatch ? thumbMatch[1].replace(/&amp;/g, '&') : '';
          const formats = [];
          if (hdUrl) formats.push({ label: '🔥 1080p / HD Máximo', url: hdUrl, ext: 'mp4' });
          if (sdUrl) formats.push({ label: '⚡ 720p / SD Rápido', url: sdUrl, ext: 'mp4' });

          return res.status(200).json({
            url: bestFbUrl,
            title: fbTitle,
            thumb: fbThumb,
            author: 'Facebook',
            filename: limpiarNombre(fbTitle, ext, qLabel),
            formats
          });
        }
      } catch (e) {}
    }
  }

  // 3. MOTOR YOUTUBE MULTICALIDAD + PORTADA 4K
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|shorts\/))([^&?/\s]{11})/);
  if (ytMatch) {
    const videoId = ytMatch[1];
    const maxThumb = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    const pipedNodes = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.tokhmi.xyz',
      'https://pipedapi.syncpundit.io',
      'https://api.piped.projectsegfau.lt'
    ];
    for (const api of pipedNodes) {
      try {
        const r = await fetch(`${api}/streams/${videoId}`, { headers: { 'User-Agent': uaMobile } });
        if (!r.ok) continue;
        const data = await r.json();
        const title = data.title || `YouTube_${videoId}`;

        const combined = (data.videoStreams || []).filter(s => s.videoOnly === false);
        const bestAudio = (data.audioStreams || []).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        const formats = combined.map(s => ({
          label: `🎬 Vídeo ${s.quality || 'HD'} (${s.format || 'MP4'})`,
          url: s.url,
          ext: 'mp4'
        }));
        if (bestAudio?.url) {
          formats.push({ label: `🎵 Audio MP3 (${Math.round((bestAudio.bitrate || 128000)/1000)}kbps)`, url: bestAudio.url, ext: 'mp3' });
        }

        let selectedUrl = combined[0]?.url || data.videoStreams?.[0]?.url;
        if (mode === 'audio' && bestAudio?.url) {
          selectedUrl = bestAudio.url;
        } else if (quality === '720') {
          const q720 = combined.find(s => (s.quality || '').includes('720'));
          if (q720) selectedUrl = q720.url;
        }

        if (selectedUrl) {
          return res.status(200).json({
            url: selectedUrl,
            title,
            thumb: maxThumb || data.thumbnailUrl,
            author: data.uploader || 'YouTube',
            filename: limpiarNombre(title, ext, qLabel),
            formats
          });
        }
      } catch (e) { continue; }
    }
  }

  // 4. MOTORES MULTIRRED DE RESPALDO
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
            label: `${item.quality || item.resolution || item.ext || `Calidad ${idx + 1}`}`,
            url: item.url,
            ext: (item.ext || 'mp4').replace('.', '')
          }));
          const chosen = mode === 'audio'
            ? (valid.find(x => (x.ext || '').includes('mp3') || (x.ext || '').includes('m4a')) || valid[0])
            : (quality === '720' ? (valid.find(x => (x.quality || '').includes('720') || (x.quality || '').includes('sd')) || valid[0]) : valid[0]);

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

  return res.status(500).json({ error: 'No se pudo extraer. Verifica que el enlace sea público.' });
}
