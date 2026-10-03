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

### 🍪 Bloqueo por bot-detection de YouTube ("Sign in to confirm you're not a bot")

YouTube puede bloquear las peticiones de yt-dlp con el error *"Sign in to
confirm you're not a bot. Use --cookies-from-browser or --cookies for the
authentication"*. Esto pasa incluso en local, y en Vercel (IPs de datacenter,
compartidas con muchos otros proyectos) es igual o más frecuente.

La mitigación es pasarle a yt-dlp las cookies de una sesión real de YouTube
con `--cookies`. Esta app soporta configurarlas vía la variable de entorno
`YTDLP_COOKIES_BASE64`, sin necesidad de tocar código.

**1. Exportar cookies.txt desde el navegador**

- Recomendado: usa una **cuenta de Google secundaria o desechable**, no tu
  cuenta principal. YouTube puede marcar la cuenta por actividad que detecte
  como automatizada (muchas descargas, patrones de acceso raros, etc.), y no
  quieres que eso le pase a tu cuenta personal.
- Inicia sesión en YouTube con esa cuenta en Chrome o Firefox.
- Instala la extensión **"Get cookies.txt LOCALLY"** ([Chrome Web
  Store](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) /
  [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/get-cookies-txt-locally/)).
- Entra a [youtube.com](https://youtube.com), abre la extensión y exporta las
  cookies del sitio actual. Vas a obtener un archivo `cookies.txt` en formato
  Netscape.

**2. Convertir el archivo a base64**

En Linux (o WSL):

```bash
base64 -w 0 cookies.txt
```

Copia todo el output (es una sola línea larga) y pégalo como valor de
`YTDLP_COOKIES_BASE64` en tu `.env`:

```bash
YTDLP_COOKIES_BASE64=<pega aquí el base64>
```

La app decodifica esta variable de forma perezosa (en el primer request que
la necesita), escribe el `cookies.txt` resultante en `/tmp` y se lo pasa a
yt-dlp con `--cookies` en todas sus invocaciones (análisis, descarga
progresiva, fusión con ffmpeg y audio). Si la variable no está seteada, la
app sigue funcionando exactamente igual que antes, sin cookies.

**3. Configurar la misma variable en Vercel**

En el dashboard del proyecto: **Project Settings → Environment Variables**,
agrega `YTDLP_COOKIES_BASE64` con el mismo valor base64, para los entornos
Production, Preview y Development según necesites. Vuelve a desplegar para
que tome efecto.

> **Nota:** las cookies de sesión expiran o se invalidan periódicamente (por
> ejemplo, si la cuenta cierra sesión en todos los dispositivos, cambia la
> contraseña, o YouTube simplemente vence la sesión). Si el bloqueo de
> bot-detection reaparece más adelante, repite los pasos 1 y 2 para generar
> cookies nuevas y actualiza la variable de entorno (tanto local como en
> Vercel).

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
  cookies.ts            Resuelve YTDLP_COOKIES_BASE64 a un cookies.txt en /tmp
  ffmpeg.ts             Ruta al binario de ffmpeg + transcodificación a mp3
  validation.ts         Validación de URL de YouTube + esquemas zod
  rate-limit.ts         Limitador en memoria por IP
  stream-utils.ts       Utilidad para detectar fallos tempranos en streams
  config.ts             Límites configurables por variable de entorno
components/             UI (formulario, lista de calidades, progreso, errores)
legacy/                 Script Python anterior, archivado (no se usa)
```
