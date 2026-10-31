// api/download.js

function limpiarNombre(texto, ext = 'mp4', quality = 'HD') {
  const base = (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/#[a-zA-Z0-9_]+/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join('_');

  const tag = Math.floor(100 + Math.random() * 900);
  const nombreLimpio = base.length > 2 ? base : 'Video_Pro';
  return `${nombreLimpio}_${quality}_${tag}.${ext}`;
}

function decodeEscapedUrl(rawStr) {
  if (!rawStr) return null;
  try {
    return JSON.parse(`"${rawStr.replace(/"/g, '\\"')}"`);
  } catch {
    return rawStr
      .replace(/\\u0025/g, '%')
      .replace(/\\u0026/g, '&')
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/\\/g, '')
      .replace(/&amp;/g, '&');
  }
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 4500, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(resource, {
      ...fetchOptions,
      signal: controller.signal
    });
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let { url, mode = 'auto', quality = 'max', cookie = '' } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  const uaDesktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const uaMobile = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

  const ext = mode === 'audio' ? 'mp3' : 'mp4';
  const qLabel = mode === 'audio' ? 'MP3' : (quality === 'max' ? 'MAX' : `${quality}p`);

  // Normalizar URL
  try {
    if (url.includes('instagram.com')) {
      url = url.split('?')[0];
    } else if (url.includes('fb.watch') || url.includes('/share/') || url.includes('vt.tiktok.com') || url.includes('vm.tiktok.com')) {
      const redir = await fetchWithTimeout(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': uaMobile },
        timeout: 2800
      });
      if (redir.url && redir.url.startsWith('http')) url = redir.url;
    }
  } catch {}

  // ==========================================
  // 1. MOTOR YOUTUBE (Nodos en Paralelo)
  // ==========================================
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const vQuality = quality === 'max' ? '1080' : String(quality);

    const tryCobaltNode = async (endpoint, isV10) => {
      const payload = isV10
        ? {
            url,
            videoQuality: vQuality,
            audioFormat: 'mp3',
            filenameStyle: 'pretty',
            downloadMode: mode === 'audio' ? 'audio' : 'auto'
          }
        : {
            url,
            vQuality,
            aFormat: 'mp3',
            filenamePattern: 'pretty',
            isAudioOnly: mode === 'audio'
          };

      const r = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': uaDesktop
        },
        body: JSON.stringify(payload),
        timeout: 5000
      });

      if (!r.ok) throw new Error('Node failed');
      const d = await r.json();
      const stream = d.url || d.audio;
      if (!stream) throw new Error('No URL');
      return { url: stream, title: d.filename || 'YouTube_Video' };
    };

    const tryVkrNode = async () => {
      const r = await fetchWithTimeout(`https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': uaMobile },
        timeout: 5500
      });
      if (!r.ok) throw new Error('VKR failed');
      const d = await r.json();
      const dlList = d?.data?.downloads || d?.downloads || [];
      const best =
        dlList.find(x => x.url && String(x.ext || x.format_id || '').includes('mp4')) ||
        dlList.find(x => x.url) ||
        dlList[0];
      if (!best || !best.url) throw new Error('No VKR URL');
      return {
        url: best.url,
        title: d?.data?.title || d?.title || 'YouTube_Video',
        thumb: d?.data?.thumbnail || d?.thumbnail || ''
      };
    };

    try {
      const winner = await Promise.any([
        tryCobaltNode('https://co.eepy.today/api/json', false),
        tryCobaltNode('https://cobalt-api.kwiatekmiki.com', true),
        tryCobaltNode('https://cobalt.api.timelessnesses.me', true),
        tryVkrNode()
      ]);

      return res.status(200).json({
        url: winner.url,
        title: winner.title,
        thumb: winner.thumb || '',
        filename: limpiarNombre(winner.title, ext, qLabel)
      });
    } catch {}
  }

  // ==========================================
  // 2. MOTOR TIKTOK (Sin marca de agua)
  // ==========================================
  if (url.includes('tiktok.com')) {
    try {
      const ttRes = await fetchWithTimeout(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
        headers: { 'User-Agent': uaMobile },
        timeout: 4500
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
        if (chosenUrl) {
          return res.status(200).json({
            url: chosenUrl,
            title: desc,
            thumb: d.cover,
            author: d.author?.nickname || 'TikTok',
            filename: limpiarNombre(desc, ext, qLabel)
          });
        }
      }
    } catch {}
  }

  // ==========================================
  // 3. MOTOR INSTAGRAM REELS
  // ==========================================
  if (url.includes('instagram.com')) {
    try {
      const igMatch = url.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
      if (igMatch) {
        const shortcode = igMatch[1];
        const headers = {
          'User-Agent': uaDesktop,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
        };
        if (cookie) headers['Cookie'] = cookie;

        const embedRes = await fetchWithTimeout(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
          headers,
          timeout: 4500
        });
        const html = await embedRes.text();

        const videoMatch =
          html.match(/"video_url":"([^"]+)"/) ||
          html.match(/video_url\\?":\\?"([^"\\]+)/) ||
          html.match(/property="og:video"\s+content="([^"]+)"/i);

        const thumbMatch =
          html.match(/"display_url":"([^"]+)"/) ||
          html.match(/property="og:image"\s+content="([^"]+)"/i);

        const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/);

        if (videoMatch && videoMatch[1]) {
          const cleanVideoUrl = decodeEscapedUrl(videoMatch[1]);
          const cleanThumb = thumbMatch ? decodeEscapedUrl(thumbMatch[1]) : '';
          const rawCaption = captionMatch ? captionMatch[1].replace(/<[^>]+>/g, ' ').trim() : `Reel_${shortcode}`;

          return res.status(200).json({
            url: cleanVideoUrl,
            title: rawCaption.slice(0, 90) || 'Instagram Reel',
            thumb: cleanThumb,
            author: 'Instagram',
            filename: limpiarNombre(rawCaption, ext, qLabel)
          });
        }
      }
    } catch {}
  }

  // ==========================================
  // 4. MOTOR FACEBOOK
  // ==========================================
  if (url.includes('facebook.com') || url.includes('fb.')) {
    try {
      const headers = {
        'User-Agent': uaDesktop,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9'
      };
      if (cookie) headers['Cookie'] = cookie;

      const fbRes = await fetchWithTimeout(url, { headers, redirect: 'follow', timeout: 4500 });
      const html = await fbRes.text();

      const hdMatch =
        html.match(/"browser_native_hd_url":"([^"]+)"/) ||
        html.match(/"playable_url_quality_hd":"([^"]+)"/) ||
        html.match(/hd_src\s*:\s*"([^"]+)"/);

      const sdMatch =
        html.match(/"browser_native_sd_url":"([^"]+)"/) ||
        html.match(/"playable_url":"([^"]+)"/) ||
        html.match(/sd_src\s*:\s*"([^"]+)"/) ||
        html.match(/property="og:video"\s+content="([^"]+)"/i);

      const titleMatch =
        html.match(/property="og:description"\s+content="([^"]+)"/i) ||
        html.match(/property="og:title"\s+content="([^"]+)"/i);

      const hdUrl = hdMatch ? decodeEscapedUrl(hdMatch[1]) : null;
      const sdUrl = sdMatch ? decodeEscapedUrl(sdMatch[1]) : null;
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
    } catch {}
  }

  // ==========================================
  // 5. PASARELA UNIVERSAL DE RESPALDO
  // ==========================================
  try {
    const r = await fetchWithTimeout(`https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': uaMobile },
      timeout: 5500
    });
    if (r.ok) {
      const d = await r.json();
      const dlList = d?.data?.downloads || d?.downloads || [];
      if (dlList.length > 0) {
        const best =
          dlList.find(x => x.url && String(x.ext || x.format_id || '').includes('mp4')) ||
          dlList.find(x => x.url) ||
          dlList[0];

        if (best && best.url) {
          const title = d?.data?.title || d?.title || 'Video_Social';
          return res.status(200).json({
            url: best.url,
            title,
            thumb: d?.data?.thumbnail || d?.thumbnail || '',
            filename: limpiarNombre(title, ext, qLabel)
          });
        }
      }
    }
  } catch {}

  return res.status(500).json({
    error: 'No se pudo procesar el enlace. Verifica que el vídeo sea público e intenta de nuevo.'
  });
}
