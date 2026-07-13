# REC/DL — Descarga videos y audio de YouTube

Aplicación web (Next.js 14, App Router + TypeScript) que permite pegar un link de
YouTube, elegir la calidad de video o extraer solo el audio (m4a/mp3), y
descargarlo directo desde el navegador. Nada se guarda de forma permanente en
el servidor: todo se transmite en streaming y los archivos temporales que se
usan para fusionar video+audio se borran al terminar cada descarga.

> El proyecto anterior en Python (`descargar_videos.py` + `pytubefix`) quedó
> archivado en [`legacy/`](./legacy) solo como referencia histórica; ya no se
> usa ni se mantiene.

## Cómo funciona

1. **Analizar** (`/api/analyze`): corre `yt-dlp --dump-single-json` sobre el
   link, valida que sea un video individual de YouTube (no playlists/canales)
   y que no exceda la duración máxima configurada, y devuelve las calidades
   disponibles.
2. **Descargar** (`/api/download`):
   - Calidades **progresivas** (video+audio ya combinados por YouTube,
     normalmente hasta 720p): se reenvía el stream de yt-dlp directo a la
     respuesta HTTP, sin usar ffmpeg ni disco.
   - Calidades **de máxima calidad** (1080p+, video y audio en streams
     separados): yt-dlp descarga ambos y los fusiona con ffmpeg en un archivo
     temporal (`/tmp`), que luego se transmite al navegador y se borra.
   - **Solo audio**: si se pide m4a se reenvía el stream de audio original
     sin recodificar; si se pide mp3 se transcodifica con ffmpeg en un pipe
     (stdin → stdout), sin tocar disco.

## Requisitos previos

- Node.js 18.18 o superior.
- Una cuenta de [Vercel](https://vercel.com) para desplegar (plan Hobby o
  Pro, ver la sección de límites más abajo).

## Desarrollo local

```bash
YOUTUBE_DL_FILENAME=yt-dlp_linux npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Copia `.env.example` a `.env` si quieres ajustar los límites (duración
máxima, rate limiting, bitrate de mp3):

```bash
cp .env.example .env
```

### ⚠️ yt-dlp en Vercel: por qué `YOUTUBE_DL_FILENAME` es obligatorio

Este proyecto usa [`youtube-dl-exec`](https://github.com/microlinkhq/youtube-dl-exec)
para invocar `yt-dlp`. **Por defecto, ese paquete descarga el asset `yt-dlp`
de GitHub, que es un *zipapp* de Python y necesita `python3` instalado en el
sistema** — algo que el runtime de Node.js de Vercel no tiene.

La variable `YOUTUBE_DL_FILENAME=yt-dlp_linux` le indica al paquete que
descargue el **binario standalone** de yt-dlp (compilado con PyInstaller, sin
dependencia de Python en runtime), que es el que realmente se ejecuta tanto
en desarrollo local (Linux) como en las funciones serverless de Vercel
(también Linux x64).

Esta variable debe estar presente:

- **Al instalar** (`npm install`), porque es cuando se descarga el binario.
- **En runtime**, porque el mismo nombre se vuelve a leer para ubicar el
  binario al ejecutar `yt-dlp`.

En Vercel esto se resuelve con un solo paso: agregar la variable en
**Project Settings → Environment Variables** para los entornos Production,
Preview y Development (Vercel la expone automáticamente tanto en el build
como en runtime). En local, expórtala antes de instalar, como en el comando
de arriba.

> **Nota:** si por cualquier motivo el proceso que corre `next dev`/`next
> start` no tiene la variable exportada (por ejemplo, si abriste una terminal
> nueva y olvidaste volver a exportarla), `lib/ytdlp.ts` cae automáticamente
> al binario `yt-dlp_linux` si lo encuentra en `node_modules/youtube-dl-exec/bin`,
> así que no debería volver a romperse en silencio. Aun así, lo más prolijo
> es exportar la variable siempre (o copiarla a tu `.env`, ver abajo), ya que
> el *fallback* asume ese nombre de archivo exacto.

Copia `.env.example` a `.env` (`cp .env.example .env`) si además quieres
ajustar los límites (duración máxima, rate limiting, bitrate de mp3). Esos
tres sí son válidos como `.env` porque Next.js los carga automáticamente en
runtime de `next dev`/`next start`.

### Actualizar yt-dlp

YouTube cambia seguido cosas que rompen extractores viejos, así que yt-dlp
saca releases con frecuencia. Para forzar que se descargue la última versión
del binario standalone:

```bash
rm -f node_modules/youtube-dl-exec/bin/yt-dlp_linux
YOUTUBE_DL_FILENAME=yt-dlp_linux npm rebuild youtube-dl-exec
```

En Vercel, un simple **Redeploy** (sin "Use existing Build Cache") vuelve a
correr `npm install` y descarga el release más reciente, ya que
`youtube-dl-exec` siempre apunta al último release de yt-dlp en GitHub
(no fija una versión en `package.json`).

Si las descargas empiezan a fallar de forma generalizada (no solo con un
video puntual), sospecha primero de esto antes que de un bug del código: es
la causa más común y no tiene que ver con este proyecto en sí.

## Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. En **Environment Variables**, agrega como mínimo:
   - `YOUTUBE_DL_FILENAME=yt-dlp_linux` (obligatoria, ver arriba).
   - Opcionalmente `MAX_VIDEO_DURATION_MINUTES`, `RATE_LIMIT_MAX_REQUESTS`,
     `RATE_LIMIT_WINDOW_MINUTES`, `MP3_BITRATE_KBPS` (ver `.env.example`).
3. Despliega normalmente (`vercel deploy` o el flujo automático de Git).

### Límites del plan Hobby (gratis) a tener en cuenta

- **Duración máxima de función**: 60 segundos (`maxDuration` en las rutas ya
  está puesto en 60, el tope real de Hobby). En plan Pro se puede subir hasta
  300 segundos editando `maxDuration` en `app/api/download/route.ts`.
- Con el límite por defecto de **20 minutos de video**, las calidades
  progresivas (≤720p) casi siempre terminan muy por debajo de los 60s. Las
  calidades de "máxima calidad" (fusión con ffmpeg) pueden acercarse al
  límite en videos largos o con conexión lenta al origen — si ves timeouts
  frecuentes en esas calidades, baja `MAX_VIDEO_DURATION_MINUTES` o pasa a
  plan Pro.
- **Memoria**: 1024 MB en Hobby. El diseño evita cargar el video completo en
  memoria en el servidor (todo es streaming a disco temporal o directo a la
  respuesta), pero videos muy pesados en calidades altas igual consumen
  ancho de banda y CPU de la función.

## Limitaciones conocidas (MVP)

- **Rate limiting en memoria**: el límite por IP (`lib/rate-limit.ts`) vive
  en la memoria de cada instancia de función. En serverless esto es
  "best effort", no una garantía dura contra abuso distribuido entre varias
  instancias. Para algo más robusto, reemplazar por Upstash Redis o Vercel
  KV manteniendo la misma firma de `checkRateLimit`.
- Solo se soportan videos individuales (no playlists ni canales completos).
- Transmisiones en vivo no están soportadas.

## Uso responsable

Esta herramienta es solo para descargar contenido del cual tengas los
derechos, o para uso personal. Respeta los derechos de autor de quienes
crean los videos que descargues.

## Estructura del proyecto

```
app/
  page.tsx              UI principal
  api/analyze/route.ts  Metadata + calidades disponibles
  api/download/route.ts Streaming de la descarga elegida
lib/
  ytdlp.ts              Wrapper de yt-dlp: análisis y spawn de streams
  ffmpeg.ts             Ruta al binario de ffmpeg + transcodificación a mp3
  validation.ts         Validación de URL de YouTube + esquemas zod
  rate-limit.ts         Limitador en memoria por IP
  stream-utils.ts       Utilidad para detectar fallos tempranos en streams
  config.ts             Límites configurables por variable de entorno
components/             UI (formulario, lista de calidades, progreso, errores)
legacy/                 Script Python anterior, archivado (no se usa)
```
