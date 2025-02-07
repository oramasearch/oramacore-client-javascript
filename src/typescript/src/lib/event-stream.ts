import type { Nullable } from './types.ts'

export type SSEEvent = {
  data: string
}

export class EventsStreamTransformer extends TransformStream<Uint8Array, SSEEvent> {
  constructor() {
    const decoder = new TextDecoder('utf-8', { ignoreBOM: false })
    let buffer: string
    let currentEvent: SSEEvent

    super({
      start() {
        buffer = ''
        currentEvent = { data: '' }
      },
      transform(chunk, controller) {
        const chunkText = decoder.decode(chunk)
        buffer += chunkText

        let lineEnd: Nullable<RegExpExecArray>

        while ((lineEnd = /\r\n|\n|\r/.exec(buffer)) !== null) {
          const line = buffer.substring(0, lineEnd.index)
          buffer = buffer.substring(lineEnd.index + lineEnd[0].length)
          if (line.length === 0) {
            controller.enqueue(currentEvent)
            currentEvent = { data: '' }
          } else if (!line.startsWith(':')) {
            const firstColonMatch = /:/.exec(line)
            if (!firstColonMatch) {
              // @ts-expect-error - Temporary fix
              currentEvent[line] = ''
              continue
            }
            const key = line.substring(0, firstColonMatch.index)
            const value = line.substring(firstColonMatch.index + 1)

            // @ts-expect-error - Temporary fix
            currentEvent[key] = value?.replace(/^\u0020/, '')
          }
        }
      },
    })
  }
}
