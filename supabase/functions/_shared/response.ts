import { corsHeaders } from './cors.ts'

export const ok = (data: unknown, module: string) =>
  new Response(JSON.stringify({ data, meta: { module, v: '1.0' } }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

export const created = (data: unknown, module: string) =>
  new Response(JSON.stringify({ data, meta: { module, v: '1.0' } }), {
    status: 201,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

export const err = (code: number, error: string, message: string) =>
  new Response(JSON.stringify({ error, message, code }), {
    status: code,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
