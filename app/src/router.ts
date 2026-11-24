import { useSyncExternalStore } from 'react'

function current() {
  return location.hash.replace(/^#/, '') || '/'
}

export function useRoute(): string {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l)
      return () => window.removeEventListener('hashchange', l)
    },
    current,
  )
}

export function go(path: string) {
  location.hash = path
  window.scrollTo(0, 0)
}
