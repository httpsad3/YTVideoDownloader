import type { Metadata } from 'next'
import { Big_Shoulders_Display, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const display = Big_Shoulders_Display({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display'
})

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans'
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono'
})

export const metadata: Metadata = {
  title: 'REC/DL — Descarga videos y audio de YouTube',
  description:
    'Pega un link de YouTube, elige la calidad y descarga el video o solo el audio directamente desde tu navegador.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  )
}
