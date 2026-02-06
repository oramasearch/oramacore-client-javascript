import type { Maybe } from './types.ts'

export const LOCAL_STORAGE_USER_ID_KEY = '___orama_anonymous_user_id'
export const LOCAL_STORAGE_SERVER_SIDE_SESSION_KEY = '___orama_server_side_session'

export function createRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-$'
  let result = ''

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }

  return result
}

export function formatDuration(duration: number): string {
  if (duration < 1000) {
    return `${duration}ms`
  } else {
    const seconds = duration / 1000
    if (Number.isInteger(seconds)) {
      return `${seconds}s`
    }
    return `${seconds.toFixed(1)}s`
  }
}

export function sendBeacon(endpoint: string, body?: string): Maybe<Promise<Response>> {
  if (typeof navigator !== 'undefined') {
    if (typeof navigator.sendBeacon !== 'undefined') {
      navigator.sendBeacon(endpoint, body)
    }
    return
  }

  fetch(endpoint, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
    },
  }).then(
    () => {},
    (e) => console.log(e),
  )
}

export const hasLocalStorage = typeof localStorage !== 'undefined'

export function throttle(func: (...args: unknown[]) => unknown, limit: number) {
  let inThrottle: boolean
  return function (...args: unknown[]) {
    if (!inThrottle) {
      // @ts-ignore - 'this' has implicitly any, yes
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

export function debounce(func: (...args: unknown[]) => unknown, delay: number) {
  let debounceTimer: number
  return function (...args: unknown[]) {
    clearTimeout(debounceTimer)
    // @ts-ignore - 'this' has implicitly any, yes
    debounceTimer = setTimeout(() => func.apply(this, args), delay)
  }
}

export function isServerRuntime() {
  // Browser detection: if window or document exists, you're definitely in a browser
  if (typeof window !== 'undefined' || typeof document !== 'undefined') {
    return false
  }

  // Node.js
  // @ts-ignore - process is not defined
  if (typeof process !== 'undefined' && process.versions?.node) {
    return true
  }

  // Deno
  // @ts-ignore - Deno is not defined
  if (typeof Deno !== 'undefined' && typeof Deno.version !== 'undefined') {
    return true
  }

  // Bun
  // @ts-ignore - Bun is not defined
  if (typeof Bun !== 'undefined' && typeof Bun.version !== 'undefined') {
    return true
  }

  // Cloudflare Workers, Vercel Edge, and other serverless environments often run in a V8 isolate
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.Response === 'function' &&
    typeof globalThis.fetch === 'function' &&
    typeof globalThis.navigator === 'undefined' // real browser usually has navigator
  ) {
    return true
  }

  // AWS Lambda or generic serverless
  // @ts-ignore - process is not defined
  if (typeof process !== 'undefined' && process?.env.AWS_LAMBDA_FUNCTION_NAME) {
    return true
  }

  // Default to false if it looks like a browser
  return false
}
