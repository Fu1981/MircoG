import { supabase } from '@/lib/supabase'

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

interface ApiResponse<T> {
  data: T
  meta: { module: string; v: string }
}

interface ApiError {
  error: string
  message: string
  code: number
}

export class ApiRequestError extends Error {
  constructor(
    public readonly error: string,
    message: string,
    public readonly code: number
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new ApiRequestError('unauthorized', 'Not authenticated', 401)
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${BASE_URL}${path}`, { headers })
  const json: ApiResponse<T> | ApiError = await res.json()

  if (!res.ok) {
    const e = json as ApiError
    throw new ApiRequestError(e.error, e.message, e.code)
  }

  return (json as ApiResponse<T>).data
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json: ApiResponse<T> | ApiError = await res.json()

  if (!res.ok) {
    const e = json as ApiError
    throw new ApiRequestError(e.error, e.message, e.code)
  }

  return (json as ApiResponse<T>).data
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  const json: ApiResponse<T> | ApiError = await res.json()

  if (!res.ok) {
    const e = json as ApiError
    throw new ApiRequestError(e.error, e.message, e.code)
  }

  return (json as ApiResponse<T>).data
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json: ApiResponse<T> | ApiError = await res.json()

  if (!res.ok) {
    const e = json as ApiError
    throw new ApiRequestError(e.error, e.message, e.code)
  }

  return (json as ApiResponse<T>).data
}
