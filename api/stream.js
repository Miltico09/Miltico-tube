export default async function handler(req, res) {
  const { url, name = 'Video_HD.mp4' } = req.query;
  if (!url) return res.status(400).send('Falta URL de origen');

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        'Referer': new URL(url).origin + '/'
      }
    });

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const arrayBuffer = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e) {
    // Si el archivo supera el límite de memoria serverless, redirige directo al stream original
    return res.redirect(url);
  }
}
