// Pure helpers shared by the quizzes (no React — usable from headless tests).

/** shuffle with a seeded generator */
export function shuffle<T>(a: readonly T[], next: () => number): T[] {
  const c = [...a]
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[c[i], c[j]] = [c[j], c[i]]
  }
  return c
}
