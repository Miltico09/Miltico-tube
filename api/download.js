export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { url, mode = 'auto' } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  // 1. Motor directo para TikTok en máxima calidad original (Sin compresión ni marca de agua)
  if (url.includes('tiktok.com')) {
    try {
      const ttRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
      const ttData = await ttRes.json();
      if (ttData.code === 0 && ttData.data) {
        const videoUrl = mode === 'audio' ? ttData.data.music : (ttData.data.hdplay || ttData.data.play);
        return res.status(200).json({ url: videoUrl, title: ttData.data.title || 'TikTok_HD' });
      }
    } catch (e) {
      // Si falla, pasa automáticamente a los nodos multiplataforma de abajo
    }
  }

  // 2. Lista de nodos Cobalt Multiplataforma (YouTube 4K/1080p, FB, Instagram Reels, TikTok)
  const instances = [
    { url: 'https://cobalt-api.kwiatekmiki.com', v: 10 },
    { url: 'https://cobalt-backend.canine.tools', v: 10 },
    { url: 'https://api.cobalt.tools/api/json', v: 7 }
  ];

  for (const node of instances) {
    try {
      const payload = node.v === 10 ? {
        url: url,
        videoQuality: 'max',
        audioFormat: 'mp3',
        filenameStyle: 'pretty',
        downloadMode: mode === 'audio' ? 'audio' : 'auto',
        tiktokFullAudio: true
      } : {
        url: url,
        vQuality: 'max',
        isAudioOnly: mode === 'audio',
        filenamePattern: 'pretty'
      };

      const response = await fetch(node.url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14)'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      // Si devuelve enlace directo o túnel de descarga
      if (data.url) {
        return res.status(200).json({ url: data.url, filename: data.filename || 'video_max.mp4' });
      }
      // Si es un carrusel o tiene múltiples pistas (picker)
      if (data.picker && data.picker.length > 0) {
        return res.status(200).json({ url: data.picker[0].url, picker: data.picker });
      }
    } catch (err) {
      continue; // Intenta con el siguiente nodo automáticamente
    }
  }

  return res.status(500).json({ error: 'Nodos ocupados o vídeo privado. Intenta de nuevo en unos segundos.' });
}
