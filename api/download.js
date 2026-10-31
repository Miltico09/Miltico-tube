export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { url, mode = 'auto', quality = 'max' } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  // 1. Motor directo para TikTok (Sin marca de agua, respeta calidad y carruseles)
  if (url.includes('tiktok.com')) {
    try {
      const isHd = (quality === 'max' || quality === '1080') ? 1 : 0;
      const ttRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=${isHd}`);
      const ttData = await ttRes.json();
      
      if (ttData.code === 0 && ttData.data) {
        // Si el TikTok es un carrusel de fotos
        if (ttData.data.images && ttData.data.images.length > 0 && mode !== 'audio') {
          return res.status(200).json({
            url: ttData.data.images[0],
            picker: ttData.data.images.map(img => ({ url: img }))
          });
        }
        // Si es vídeo o solo audio MP3
        const streamUrl = mode === 'audio' 
          ? ttData.data.music 
          : (isHd ? (ttData.data.hdplay || ttData.data.play) : ttData.data.play);
          
        return res.status(200).json({
          url: streamUrl,
          filename: mode === 'audio' ? 'tiktok_audio.mp3' : 'tiktok_max.mp4'
        });
      }
    } catch (e) {
      // Si falla, pasa automáticamente a los nodos multiplataforma de abajo
    }
  }

  // 2. Nodos Cobalt Multiplataforma (YouTube 4K/1080p/720p, Facebook, Instagram Reels, TikTok)
  const instances = [
    { url: 'https://cobalt-api.kwiatekmiki.com', v: 10 },
    { url: 'https://cobalt-backend.canine.tools', v: 10 },
    { url: 'https://api.cobalt.tools/api/json', v: 7 }
  ];

  for (const node of instances) {
    try {
      const payload = node.v === 10 ? {
        url: url,
        videoQuality: String(quality),
        audioFormat: 'mp3',
        filenameStyle: 'pretty',
        downloadMode: mode === 'audio' ? 'audio' : 'auto',
        tiktokFullAudio: true
      } : {
        url: url,
        vQuality: String(quality),
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

      if (data.url) {
        return res.status(200).json({
          url: data.url,
          filename: data.filename || (mode === 'audio' ? 'audio_max.mp3' : 'video_max.mp4')
        });
      }

      if (data.picker && data.picker.length > 0) {
        return res.status(200).json({
          url: data.picker[0].url,
          picker: data.picker
        });
      }
    } catch (err) {
      continue;
    }
  }

  return res.status(500).json({ error: 'Nodos ocupados o vídeo privado. Intenta de nuevo en unos segundos.' });
}
