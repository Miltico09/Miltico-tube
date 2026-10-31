export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { url, mode = 'auto', quality = 'max' } = req.body;
  if (!url) return res.status(400).json({ error: 'Falta la URL del vídeo' });

  const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

  // ==========================================
  // 1. MOTOR TIKTOK (HD sin marca de agua + Carruseles)
  // ==========================================
  if (url.includes('tiktok.com')) {
    try {
      const isHd = (quality === 'max' || quality === '1080') ? 1 : 0;
      const ttRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=${isHd}`, {
        headers: { 'User-Agent': ua }
      });
      const ttData = await ttRes.json();
      if (ttData.code === 0 && ttData.data) {
        const d = ttData.data;
        if (d.images && d.images.length > 0 && mode !== 'audio') {
          return res.status(200).json({
            url: d.images[0],
            title: d.title || 'TikTok Carrusel',
            thumb: d.cover,
            author: d.author?.nickname || 'TikTok',
            picker: d.images.map(img => ({ url: img }))
          });
        }
        const streamUrl = mode === 'audio' ? d.music : (isHd ? (d.hdplay || d.play) : d.play);
        return res.status(200).json({
          url: streamUrl,
          title: d.title || 'TikTok Video HD',
          thumb: d.cover,
          author: d.author?.nickname || 'TikTok',
          filename: mode === 'audio' ? 'MilticoTube_TikTok.mp3' : 'MilticoTube_TikTok_HD.mp4'
        });
      }
    } catch (e) {}
  }

  // ==========================================
  // 2. MOTOR YOUTUBE DIRECTO (Piped / Invidious APIs)
  // ==========================================
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|shorts\/))([^&?/\s]{11})/);
  if (ytMatch) {
    const videoId = ytMatch[1];
    const pipedNodes = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.tokhmi.xyz',
      'https://pipedapi.syncpundit.io',
      'https://api.piped.projectsegfau.lt'
    ];
    for (const api of pipedNodes) {
      try {
        const r = await fetch(`${api}/streams/${videoId}`, { headers: { 'User-Agent': ua } });
        if (!r.ok) continue;
        const data = await r.json();
        if (mode === 'audio' && data.audioStreams?.length) {
          const bestAudio = data.audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
          return res.status(200).json({
            url: bestAudio.url,
            title: data.title,
            thumb: data.thumbnailUrl,
            author: data.uploader,
            filename: 'MilticoTube_Audio.mp3'
          });
        }
        if (data.videoStreams?.length) {
          // Buscamos streams con audio y vídeo integrados o el de mayor resolución
          const combined = data.videoStreams.filter(s => s.videoOnly === false);
          const pool = combined.length ? combined : data.videoStreams;
          const bestVideo = pool[0];
          if (bestVideo?.url) {
            return res.status(200).json({
              url: bestVideo.url,
              title: data.title,
              thumb: data.thumbnailUrl,
              author: data.uploader,
              filename: 'MilticoTube_YT.mp4'
            });
          }
        }
      } catch (e) { continue; }
    }
  }

  // ==========================================
  // 3. MOTOR MULTIPLATAFORMA VKR (FB, IG Reels, YT, TikTok)
  // ==========================================
  try {
    const vkrRes = await fetch(`https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': ua }
    });
    const vkrData = await vkrRes.json();
    if (vkrData?.data?.downloads?.length > 0) {
      const downloads = vkrData.data.downloads;
      const sorted = downloads.filter(d => d.url).reverse();
      const chosen = mode === 'audio'
        ? (sorted.find(d => d.ext === 'mp3' || d.ext === 'm4a') || sorted[0])
        : sorted[0];
      if (chosen?.url) {
        return res.status(200).json({
          url: chosen.url,
          title: vkrData.data.title || 'Video Extraído',
          thumb: vkrData.data.thumbnail || '',
          filename: mode === 'audio' ? 'MilticoTube_Audio.mp3' : 'MilticoTube_Video.mp4'
        });
      }
    }
  } catch (e) {}

  // ==========================================
  // 4. NODOS COBALT ABIERTOS ACTUALIZADOS (Fallback)
  // ==========================================
  const cobaltNodes = [
    'https://cobalt.api.timelessnesses.me',
    'https://co.eepy.today',
    'https://cobalt-api.kwiatekmiki.com',
    'https://cobalt-backend.canine.tools'
  ];

  for (const nodeUrl of cobaltNodes) {
    try {
      const response = await fetch(nodeUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': ua,
          'Origin': nodeUrl,
          'Referer': nodeUrl + '/'
        },
        body: JSON.stringify({
          url: url,
          videoQuality: String(quality),
          audioFormat: 'mp3',
          filenameStyle: 'pretty',
          downloadMode: mode === 'audio' ? 'audio' : 'auto',
          tiktokFullAudio: true
        })
      });

      const data = await response.json();
      if (data.url) {
        return res.status(200).json({
          url: data.url,
          title: data.filename || 'Stream Extraído en Máxima Calidad',
          filename: data.filename || (mode === 'audio' ? 'MilticoTube.mp3' : 'MilticoTube.mp4')
        });
      }
      if (data.picker && data.picker.length > 0) {
        return res.status(200).json({
          url: data.picker[0].url,
          title: 'Carrusel Multimedia Extraído',
          picker: data.picker
        });
      }
    } catch (err) {
      continue;
    }
  }

  return res.status(500).json({ error: 'No se pudo extraer este enlace. Verifica que el vídeo sea público.' });
}
