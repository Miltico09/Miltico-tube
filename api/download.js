export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  // Limpiar URL de Instagram y Facebook de rastreadores
  try {
    if (url.includes('instagram.com')) url = url.split('?')[0];
    if (url.includes('fb.watch') || url.includes('/share/')) {
      const redir = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': ua } });
      if (redir.url && redir.url.startsWith('http')) url = redir.url;
    }
  } catch (e) {}

  // Función para formatear el nombre limpio basado en la URL o ID
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

  // 1. MOTOR ESPECIALIZADO 1: All-In-One Social Downloader API
  try {
    const response = await fetch(`https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': ua }
    });
    const data = await response.json();
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

  // 2. MOTOR ESPECIALIZADO 2: Cobalt Engine (Excelente para YouTube, TikTok, Reels públicos)
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
    if (cData.picker && cData.picker.length > 0) {
      return res.status(200).json({
        url: cData.picker[0].url,
        title: 'Carrusel',
        thumb: '',
        filename: generarNombre('Carrusel', 'MilticoTube')
      });
    }
  } catch (e) {}

  // 3. MOTOR ESPECIALIZADO 3: SnapSave / SaveFrom mirror API
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
        filename: generarNombre(d.title, 'TikTok_FB')
      });
    }
  } catch (e) {}

  return res.status(500).json({ error: 'No se pudo procesar este enlace. Asegúrate de que la publicación o Reel sea completamente público.' });
}
