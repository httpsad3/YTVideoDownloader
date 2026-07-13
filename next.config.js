/** @type {import('next').NextConfig} */
const nextConfig = {
  // @ffmpeg-installer/ffmpeg y youtube-dl-exec traen binarios nativos: se
  // marcan como externos para que Next no intente empaquetarlos con webpack
  // y así el trazador de Vercel los incluya como archivos, no como código JS.
  // (En Next 14.2.x esto todavía vive bajo `experimental`; se promovió a la
  // raíz de la config recién en versiones posteriores.)
  experimental: {
    serverComponentsExternalPackages: ['youtube-dl-exec', '@ffmpeg-installer/ffmpeg']
  }
}

module.exports = nextConfig
