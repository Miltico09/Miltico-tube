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

// Decodificador seguro para evitar que JSON.parse lance SyntaxError en cadenas mal escapadas
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
      .replace(/\\/g, '');
  }
}

// Envoltorio con AbortController para evitar que un servidor lento cause 504 Gateway Timeout en Vercel
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 4500, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
      ...fetchOptions,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req, res) {
  // Configuración CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  let { url, mode = 'auto', quality = 'max' } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Falta la URL del vídeo' });
  }

  // Validación estricta de URL para prevenir SSRF
  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Protocolo de URL no válido' });
    }
  } catch {
    return res.status(400).json({ error: 'El formato del enlace no es válido' });
  }

  const uaDesktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const uaMobile = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

  const ext = mode === 'audio' ? 'mp3' : 'mp4';
  const qLabel = mode === 'audio' ? 'MP3' : (quality === 'max' ? 'MAX' : `${quality}p`);

  // Limpieza de parámetros de seguimiento y resolución de redirecciones cortas con timeout
  try {
    if (parsedUrl.hostname.includes('instagram.com')) {
      url = `${parsedUrl.origin}${parsedUrl.pathname}`;
    } else if (parsedUrl.hostname.includes('fb.watch') || url.includes('/share/')) {
      const redir = await fetchWithTimeout(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': uaMobile },
        timeout: 3000
      });
      if (redir.url && redir.url.startsWith('http')) {
        url = redir.url;
      }
    }
  } catch {
    // Continúa con la URL original si falla la resolución de redirección
  }

  // ==========================================
  // 1. RESOLUCIÓN DE METADATOS Y API EXTERNA CONFIGURADA
  // ==========================================
  // Si configuras una variable de entorno MEDIA_API_ENDPOINT en tu panel de Vercel,
  // se consultará con protección de timeout de 5 segundos.
  if (process.env.MEDIA_API_ENDPOINT) {
    try {
      const apiRes = await fetchWithTimeout(process.env.MEDIA_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': uaDesktop
        },
        body: JSON.stringify({
          url,
          videoQuality: String(quality),
          audioFormat: 'mp3',
          downloadMode: mode === 'audio' ? 'audio' : 'auto'
        }),
        timeout: 5000
      });

      if (apiRes.ok) {
        const apiData = await apiRes.json();
        const streamUrl = decodeEscapedUrl(apiData.url);
        if (streamUrl) {
          const title = apiData.title || apiData.filename || 'Video_Stream';
          return res.status(200).json({
            url: streamUrl,
            title,
            thumb: apiData.thumb || apiData.thumbnail || '',
            filename: limpiarNombre(title, ext, qLabel)
          });
        }
      }
    } catch {
      // Continúa al siguiente bloque si el servicio externo excede los 5s o falla
    }
  }

  // ==========================================
  // 2. RESOLUCIÓN DE ENLACES DIRECTOS (.mp4 / .mp3 / .webm)
  // ==========================================
  if (/\.(mp4|webm|mp3|m4a)(\?.*)?$/i.test(parsedUrl.pathname)) {
    const rawTitle = parsedUrl.pathname.split('/').pop()?.split('.')[0] || 'Media_Directo';
    return res.status(200).json({
      url: url,
      title: decodeURIComponent(rawTitle),
      thumb: '',
      filename: limpiarNombre(rawTitle, ext, qLabel)
    });
  }

  // ==========================================
  // 3. CONSULTA DE METADATOS PÚBLICOS (oEmbed Oficial)
  // ==========================================
  if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be')) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const ytMetaRes = await fetchWithTimeout(oembedUrl, { timeout: 3500 });
      if (ytMetaRes.ok) {
        const ytMeta = await ytMetaRes.json();
        return res.status(422).json({
          error: 'Vídeo detectado correctamente via oEmbed, pero requiere un proveedor de streaming autorizado en MEDIA_API_ENDPOINT.',
          meta: {
            title: ytMeta.title,
            author: ytMeta.author_name,
            thumb: ytMeta.thumbnail_url,
            suggestedFilename: limpiarNombre(ytMeta.title, ext, qLabel)
          }
        });
      }
    } catch {
      // Manejo silencioso si oEmbed no responde a tiempo
    }
  }

  return res.status(500).json({
    error: 'No se pudo obtener un flujo directo. Verifica que el enlace sea un recurso multimedia válido o configura tu endpoint en Vercel.'
  });
}
