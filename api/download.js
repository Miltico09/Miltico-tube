function limpiarNombre(texto, ext = 'mp4') {
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
  const nombreLimpio = base.length > 2 ? base : `Video_Social`;
  return `${nombreLimpio}_${tag}.${ext}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  // Limpieza de URLs acortadas o rastreadores
  try {
    if (url.includes('instagram.com')) url = url.split('?')[0];
    if (url.includes('fb.watch') || url.includes('/share/')) {
      const redir = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': ua } });
      if (redir.url && redir.url.startsWith('http')) url = redir.url;
    }
  } catch (e) {}

  // Lista de motores y APIs espejo altamente estables para redes sociales y YouTube
  const extractors = [
    `https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(url)}`,
    `https://co.eepy.today/api/json`,
    `https://cobalt-api.kwiatekmiki.com`
  ];

  // 1. Intentar con APIs espejo especializadas en redes sociales (Ideal para IG Reels y FB)
  try {
    const r1 = await fetch(extractors[0], { headers: { 'User-Agent': ua } });
    const d1 = await r1.json();
    const dlList = d1?.data?.downloads || d1?.downloads || [];
    if (dlList.length > 0) {
      const best = dlList.find(x => x.url) || dlList[0];
      const title = d1?.data?.title || d1?.title || 'Video_Social';
      return res.status(200).json({
        url: best.url,
        title,
        thumb: d1?.data?.thumbnail || d1?.thumbnail || '',
        filename: limpiarNombre(title, 'mp4')
      });
    }
  } catch (e) {}

  // 2. Intentar con motores Cobalt abiertos (YouTube, TikTok, FB, Reels)
  for (let i = 1; i < extractors.length; i++) {
    try {
      const payload = i === 1 ? { url, vQuality: 'max', filenamePattern: 'pretty' } : { url, videoQuality: 'max', filenameStyle: 'pretty' };
      const resCobalt = await fetch(extractors[i], {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': ua },
        body: JSON.stringify(payload)
      });
      const data = await resCobalt.json();
      if (data.url) {
        return res.status(200).json({
          url: data.url,
          title: data.filename || 'Video_Redes',
          thumb: '',
          filename: limpiarNombre(data.filename, 'mp4')
        });
      }
    } catch (err) {
      continue;
    }
  }

  return res.status(500).json({ error: 'No se pudo procesar. Asegúrate de que el enlace de Instagram o Facebook sea una publicación pública.' });
}
