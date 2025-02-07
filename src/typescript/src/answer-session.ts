import { OramaInterface } from './common.ts'
import type { SSEEvent } from './lib/event-stream.ts'
import type { Maybe } from './lib/types.ts'

type AnswerSessionConfig = {
  url: string
  readAPIKey: string
  collectionID: string
}

export type Role = 'system' | 'assistant' | 'user'

export type Message = {
  role: Role
  content: string
}

export type AnswerConfig = {
  interactionID: string
  query: string
  visitorID: string
  sessionID: string
  messages?: Message[]
}

export class AnswerSession {
  private url: string
  private readAPIKey: string
  private collectionID: string
  private oramaInterface: OramaInterface

  constructor(config: AnswerSessionConfig) {
    this.url = config.url
    this.readAPIKey = config.readAPIKey
    this.collectionID = config.collectionID
    this.oramaInterface = new OramaInterface({
      baseURL: this.url,
      masterAPIKey: null,
      writeAPIKey: null,
      readAPIKey: this.readAPIKey,
    })
  }

  public async *answerStream(data: AnswerConfig): AsyncGenerator<SSEEvent> {
    const body = {
      interaction_id: data.interactionID,
      query: data.query,
      visitor_id: data.visitorID,
      conversation_id: data.sessionID,
      messages: data.messages || [],
    }

    const reqStream = await this.oramaInterface.requestStream({
      method: 'POST',
      securityLevel: 'read-query',
      url: `/v1/collections/${this.collectionID}/answer`,
      body,
    })

    const reader = reqStream.getReader()

    while (true) {
      const { done, value } = await reader.read()

      if (value !== undefined) {
        yield value
      }

      if (done) {
        break
      }
    }

    reader.releaseLock()
  }
}
