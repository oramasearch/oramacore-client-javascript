import { OramaInterface } from './common.ts'
import { AnyObject } from './index.ts'
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

export type PlannedAnswerResponse = {
  message: string
  action: string
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

  public async *plannedAnswerStream(data: AnswerConfig): AsyncGenerator<PlannedAnswerResponse> {
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
      url: `/v1/collections/${this.collectionID}/planned_answer`,
      body,
    })

    const reader = reqStream.getReader()

    while (true) {
      const { done, value } = await reader.read()

      if (value !== undefined) {
        // @ts-expect-error - Sometime it happens that the server sends an empty message. It should be ignored.
        if (value === '') {
          continue
        }

        const data = JSON.parse(value.data)

        // Acknowledgement message.
        // This message is sent when the server starts processing the request.
        // From this point, the server will start sending the response messages.
        if (data.type === 'acknowledgement') {
          yield { action: 'ACKNOWLEDGEMENT', message: 'acknowledgement' }
          continue
        }

        // Response message.
        // It could contain several different types of messages.
        if (data.type === 'response') {
          // Sometimes the server sends an empty message. It should be ignored.
          if (data.message === '') {
            continue
          }

          const message = JSON.parse(data.message)
          const action = message.action

          // As a first message, the server will send the action plan.
          // This action plan contains the list of actions that the server will perform to answer the query.
          if (action === 'ACTION_PLAN') {
            const jsonPlan = JSON.parse(message.result)
            yield { action: 'ACTION_PLAN', message: jsonPlan }
            continue
          }

          // During the RAG process, the server will send the search results.
          // Since we know they will always be in a valid JSON format, we can parse them.
          if (action === 'PERFORM_ORAMA_SEARCH') {
            const jsonResult = JSON.parse(message.result)
            yield { action: 'PERFORM_ORAMA_SEARCH', message: jsonResult?.flat() }
            continue
          }

          yield message
        }
      }

      if (done) {
        break
      }
    }

    reader.releaseLock()
  }
}
