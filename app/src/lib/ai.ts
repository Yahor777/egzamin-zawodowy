// OpenAI-compatible chat client. Settings stay in this browser only.
const KEY = 'inf02.ai'

export interface AiSettings {
  url: string
  key: string
  model: string
}

export function getAi(): AiSettings | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as AiSettings
    return s.url ? s : null
  } catch {
    return null
  }
}

export function setAi(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Streams the reply; calls onDelta with the accumulated text. */
export async function chat(messages: ChatMsg[], onDelta: (text: string) => void, signal?: AbortSignal): Promise<string> {
  const s = getAi()
  if (!s) throw new Error('not configured')
  const url = s.url.replace(/\/+$/, '') + '/chat/completions'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (s.key) headers.Authorization = `Bearer ${s.key}`
  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ model: s.model || 'gpt-4o-mini', messages, stream: true, temperature: 0.3, max_tokens: 700 }),
  })
  if (!res.ok || !res.body) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.slice(0, 200))
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const l = line.trim()
      if (!l.startsWith('data:')) continue
      const data = l.slice(5).trim()
      if (data === '[DONE]') return text
      try {
        const j = JSON.parse(data)
        const d = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? ''
        if (d) {
          text += d
          onDelta(text)
        }
      } catch {
        /* partial line */
      }
    }
  }
  return text
}

export const SYSTEM_PROMPT = {
  ru: 'Ты репетитор по польскому профессиональному экзамену INF.02 (technik informatyk). Отвечай по-русски, коротко и понятно школьнику 3 класса техникума. Польские термины давай в скобках. Официальный ответ CKE считается правильным: объясни, почему он верный и почему остальные варианты неверны. Если нужен расчёт — покажи шаги. Не выдумывай факты.',
  pl: 'Jesteś korepetytorem do egzaminu zawodowego INF.02 (technik informatyk). Odpowiadaj po polsku, krótko i zrozumiale dla ucznia technikum. Oficjalna odpowiedź CKE jest poprawna: wyjaśnij, dlaczego jest dobra i dlaczego pozostałe są błędne. Przy obliczeniach pokaż kroki. Nie wymyślaj faktów.',
}
