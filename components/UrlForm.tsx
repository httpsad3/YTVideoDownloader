'use client'

import { useState } from 'react'

interface UrlFormProps {
  onSubmit: (url: string) => void
  isBusy: boolean
}

export function UrlForm({ onSubmit, isBusy }: UrlFormProps) {
  const [value, setValue] = useState('')

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={event => {
        event.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
    >
      <label htmlFor="youtube-url" className="sr-only">
        Link de YouTube
      </label>
      <input
        id="youtube-url"
        type="url"
        inputMode="url"
        autoComplete="off"
        placeholder="https://www.youtube.com/watch?v=…"
        value={value}
        onChange={event => setValue(event.target.value)}
        required
        className="flex-1 rounded-md border border-deck-600 bg-deck-900 px-4 py-3 font-mono text-sm text-paper placeholder:text-paper/30 focus:border-amber-500"
      />
      <button
        type="submit"
        disabled={isBusy || value.trim().length === 0}
        className="shrink-0 rounded-md bg-amber-500 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wide text-deck-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isBusy ? 'Analizando…' : 'Analizar ▶'}
      </button>
    </form>
  )
}
