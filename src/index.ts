export { STATES_STEPS as answerSessionSteps } from 'npm:@orama/oramacore-events-parser@0.0.5'
export type { AnswerConfig, AnswerSessionConfig, Interaction } from './stream-manager.ts'

export { OramaCoreStream as AnswerSession } from './stream-manager.ts'

export * from './lib/types.ts'
export { createRandomString } from './lib/utils.ts'
export * from './manager.ts'
export * from './collection.ts'
export * from './cloud.ts'

type DedupeFunction = (message: string | undefined) => string

export const dedupe: DedupeFunction = (() => {
  const seenMessages = new Set<string>()

  return function (message: string | undefined): string {
    if (!message) return ''

    if (seenMessages.has(message)) {
      return ''
    }

    seenMessages.add(message)
    return message
  }
})()
