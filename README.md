# Miltico Tube // Pro HUD & Stream Engine

## Descripción del Proyecto
Miltico Tube es una Progressive Web App (PWA) de descarga multimedia ultrarrápida y de "un solo toque", con temática visual Cyberpunk/Glassmorphic. Está diseñada para ejecutarse principalmente desde navegadores móviles (Android) y está alojada en la infraestructura Serverless de Vercel.

Permite descargar contenidos multimedia de múltiples plataformas (YouTube, TikTok, Instagram Reels, Facebook) generando nombres de archivo limpios basados en las descripciones de los vídeos, sin prefijos no deseados y con previsualización multimedia integrada.

## Arquitectura de Archivos
El proyecto consta de tres archivos principales:
1. **`index.html`**: La interfaz de usuario (PWA, diseño Cyberpunk, gestor de colas, reproductor de vista previa, selector de calidad/modo audio y disparador de descarga por túnel proxy).
2. **`api/download.js`**: El backend Serverless principal en Node.js que maneja los extractores por plataforma (YouTube, TikTok, Instagram Reels, Facebook) y pasarelas de respaldo.
3. **`api/stream.js`**: Un túnel proxy de streaming que descarga y fuerza el guardado del archivo real en el dispositivo móvil con el nombre limpio de la descripción, evitando redirecciones y reproductores en blanco.

## Problemas Actuales a Resolver / Estado del Sistema
- **YouTube**: A veces falla la extracción directa debido a la saturación o cambios en las rutas de los nodos de respaldo públicos de Cobalt/Piped en Vercel.
- **Instagram Reels y Facebook**: Frecuentemente arrojan bloqueos por parte de Meta ("vídeo privado" o bloqueo de IP del centro de datos de Vercel). Se implementó un campo opcional de Cookie de sesión, pero necesitamos máxima robustez o una revisión del flujo de extracción para que no falle al procesar enlaces públicos.

## Objetivo de la Revisión
Analiza la lógica de extracción en `api/download.js` y la interacción con `index.html`. Identifica los puntos de fallo actuales en las APIs de terceros utilizadas para YouTube y Meta (Instagram/Facebook), y propón una solución o refactorización limpia y optimizada que garantice la estabilidad en Vercel.

# Miltico-tube
