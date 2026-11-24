// Cloudflare Worker: a small proxy so classmates can use the AI helper
// without seeing the API key. Free plan: 100k requests/day.
//
// Secrets / variables (Workers → Settings → Variables):
//   API_URL    e.g. https://api.tokenharbor.example/v1   (any OpenAI-compatible base URL)
//   API_KEY    your key (add as an encrypted secret)
//   MODEL      default model name, e.g. gpt-4o-mini
//   CLASS_CODE optional: a shared password; the app sends it as the "API key"
//   DAILY_LIMIT optional: requests per IP per day (default 40), needs a KV binding named LIMITS
//
// In the app: Settings → AI → address = https://<your-worker>.workers.dev/v1, key = CLASS_CODE.

const ALLOWED_ORIGINS = ['https://yahor777.github.io', 'http://localhost:5173', 'http://localhost:4173']

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const url = new URL(request.url)
    if (request.method !== 'POST' || !url.pathname.endsWith('/chat/completions')) {
      return new Response('Not found', { status: 404, headers: cors })
    }

    if (env.CLASS_CODE) {
      const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      if (auth !== env.CLASS_CODE) return new Response('Wrong class code', { status: 401, headers: cors })
    }

    if (env.LIMITS) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const day = new Date().toISOString().slice(0, 10)
      const key = `${day}:${ip}`
      const used = Number((await env.LIMITS.get(key)) || 0)
      const limit = Number(env.DAILY_LIMIT || 40)
      if (used >= limit) return new Response('Daily limit reached', { status: 429, headers: cors })
      await env.LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 })
    }

    const body = await request.json()
    const payload = {
      model: env.MODEL || body.model,
      messages: (body.messages || []).slice(-12),
      stream: body.stream !== false,
      temperature: body.temperature ?? 0.3,
      max_tokens: Math.min(Number(body.max_tokens) || 700, 1200),
    }
    const upstream = await fetch(env.API_URL.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.API_KEY}` },
      body: JSON.stringify(payload),
    })
    const headers = new Headers(cors)
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json')
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
