/* Outgoing mail. Two providers:
   - 'resend': https://resend.com over its HTTP API (one fetch, no SDK).
   - 'log':    prints the message to the Worker log. Local dev and tests.
   Swapping in another service means adding a case to `send`. */

import type { Env } from './env'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

/** Every message sent with the 'log' provider, newest last. Tests read it. */
export const outbox: Mail[] = []

export async function send(env: Env, mail: Mail): Promise<void> {
  if (env.MAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    })
    if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`)
    return
  }
  outbox.push(mail)
  if (outbox.length > 50) outbox.shift()
  console.log(`[mail:log] to=${mail.to} subject=${mail.subject}\n${mail.text}`)
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function layout(heading: string, body: string, link: string, cta: string): string {
  return `<!doctype html><html><body style="margin:0;background:#14110d;font-family:Georgia,serif;color:#f5f2ea">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
<div style="font-size:12px;letter-spacing:.2em;color:#c9a227">REAL ESTATE EMPIRE</div>
<h1 style="font-size:24px;margin:12px 0">${esc(heading)}</h1>
<p style="font-size:15px;line-height:1.6">${body}</p>
<p style="margin:28px 0"><a href="${esc(link)}" style="background:#c9a227;color:#14110d;padding:12px 20px;text-decoration:none;font-weight:bold;border-radius:4px">${esc(cta)}</a></p>
<p style="font-size:12px;color:#9a9285;line-height:1.5">Or paste this into your browser:<br>${esc(link)}</p>
</div></body></html>`
}

export function loginMail(to: string, link: string): Mail {
  return {
    to,
    subject: 'Your login link — Real Estate Empire',
    text:
      `Here's your login link. It works once and expires in 15 minutes.\n\n${link}\n\n` +
      `If you didn't ask for this, ignore it. Nobody's getting into your portfolio.`,
    html: layout(
      'Your login link',
      'It works once and expires in 15 minutes. If you didn’t ask for it, ignore this email. Nobody’s getting into your portfolio.',
      link,
      'Sign in',
    ),
  }
}

export function inviteMail(to: string, link: string, city: string, from: string): Mail {
  return {
    to,
    subject: `${from} wants you in ${city} — Real Estate Empire`,
    text:
      `${from} has invited you to ${city}, a private city in Real Estate Empire.\n` +
      `You start in a tent under a bridge. Where you end up is your problem.\n\n${link}\n\n` +
      `Adults only. The writing is not appropriate for anyone's grandmother.`,
    html: layout(
      `You’re invited to ${city}`,
      `${esc(from)} has invited you to a private city in Real Estate Empire. You start in a tent under a bridge. Where you end up is your problem.<br><br><i>Adults only.</i>`,
      link,
      'Take the invite',
    ),
  }
}
