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
