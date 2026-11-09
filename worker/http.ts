/* Small HTTP helpers: JSON in and out, errors with a code the UI can switch
   on, and cookies. */

export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

export const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      /* Tells the browser a real backend answered (not a static host's
         404 page), which is how it decides between online and local play. */
      'x-res-api': '1',
      ...(init.headers ?? {}),
    },
  })

export const errorResponse = (e: HttpError): Response =>
  json({ error: e.code, message: e.message }, { status: e.status })

/** Largest request body accepted: a full week of moves is a few KB. */
const MAX_BODY = 64 * 1024

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const type = req.headers.get('content-type') ?? ''
  if (!type.includes('application/json'))
    throw new HttpError(415, 'json_required', 'Send JSON.')
  const text = await req.text()
  if (text.length > MAX_BODY) throw new HttpError(413, 'too_large')
  try {
    const v = JSON.parse(text)
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw 0
    return v as T
  } catch {
    throw new HttpError(400, 'bad_json', "That body wasn't a JSON object.")
  }
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export function cookie(
  name: string,
  value: string,
  opts: { maxAge: number; secure: boolean },
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${opts.maxAge}`,
    opts.secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

export const str = (v: unknown): string => (typeof v === 'string' ? v : '')
