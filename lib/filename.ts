/** Convierte un título de video en un nombre de archivo seguro para Content-Disposition. */
export function sanitizeFilename(title: string): string {
  const cleaned = title
    .normalize('NFKD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // quita marcas diacríticas tras normalizar (á -> a + acento)
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)

  return cleaned.length > 0 ? cleaned : 'video'
}

export function contentDispositionHeader(filename: string): string {
  return `attachment; filename="${filename}"`
}
