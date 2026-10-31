export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  // Limpieza de URLs acortadas o rastreadores de Meta
  try {
    if (url.includes('instagram.com')) url = url.split('?')[0];
    if (url.includes('fb.watch') || url.includes('/share/')) {
      const redir = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': ua } });
      if (redir.url && redir.url.startsWith('http')) url = redir.url;
    }
  } catch (e) {}

  function generarNombre(tituloOriginal, plataforma) {
    const base = (tituloOriginal || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join('_');
    const tag = Math.floor(100 + Math.random() * 900);
    const nombreLimpio = base.length > 2 ? base : `${plataforma}_Video`;
    return `${nombreLimpio}_${tag}.mp4`;
  }

  // 1. MOTOR PASARELA PRINCIPAL PARA INSTAGRAM Y FACEBOOK (Snapsave / VKR Mirror)
  try {
    const apiRes = await fetch(`https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': ua }
    });
    const data = await apiRes.json();
    const dlList = data?.data?.downloads || data?.downloads || [];
    if (dlList.length > 0) {
      const best = dlList.find(x => x.url) || dlList[0];
      const title = data?.data?.title || data?.title || 'Video';
      return res.status(200).json({
        url: best.url,
        title: title,
        thumb: data?.data?.thumbnail || data?.thumbnail || '',
        filename: generarNombre(title, 'Social')
      });
    }
  } catch (e) {}

  // 2. MOTOR PASARELA SECUNDARIA (SaveFrom / Cobalt Mirror)
  try {
    const cobaltRes = await fetch('https://co.eepy.today/api/json', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': ua },
      body: JSON.stringify({ url, vQuality: 'max', filenamePattern: 'pretty' })
    });
    const cData = await cobaltRes.json();
    if (cData.url) {
      return res.status(200).json({
        url: cData.url,
        title: cData.filename || 'Video_HD',
        thumb: '',
        filename: generarNombre(cData.filename, 'MilticoTube')
      });
    }
  } catch (e) {}

  // 3. MOTOR PASARELA TERCIARIA (TikWM Mirror para Reels y FB Watch)
  try {
    const mirrorRes = await fetch(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': ua }
    });
    const mData = await mirrorRes.json();
    if (mData.code === 0 && mData.data) {
      const d = mData.data;
      const vUrl = d.hdplay || d.play;
      return res.status(200).json({
        url: vUrl,
        title: d.title || 'Video',
        thumb: d.cover || '',
        filename: generarNombre(d.title, 'Meta_Video')
      });
    }
  } catch (e) {}

  return res.status(500).json({ error: 'Meta bloqueó la petición temporalmente. Intenta recargar la app en unos segundos.' });
}
