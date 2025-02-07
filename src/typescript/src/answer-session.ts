import { createId } from 'npm:@paralleldrive/cuid2@2.2.2'
import { OramaInterface } from './common.ts'
import type { AnyObject, Nullable } from './index.ts'
import type { SSEEvent } from './lib/event-stream.ts'
import type { CreateAnswerSessionConfig } from './collection.ts'

type AnswerSessionConfig = {
  url: string
  readAPIKey: string
  collectionID: string
  initialMessages?: Message[]
  events?: CreateAnswerSessionConfig['events']
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

export type PlanAction = {
  step: string
  description: string
}

export type Interaction<D = AnyObject> = {
  id: string
  query: string
  response: string
  sources: Nullable<D>
  loading: boolean
  error: boolean
  planned: boolean
  plan: Nullable<PlanAction[]>
  errorMessage: Nullable<string>
  aborted: boolean
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
  private abortController?: AbortController
  private events?: CreateAnswerSessionConfig['events']
  public messages: Message[]

  public state: Interaction[] = []

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

    this.messages = config.initialMessages || []
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
    // Resets the abort controller. This is necessary to avoid aborting the previous request if there is one.
    this.abortController = new AbortController()

    // Add the question to the messages list.
    // Also add a new, empty assistant message to the conversation.
    this.messages.push({ role: 'user', content: data.query })
    this.messages.push({ role: 'assistant', content: '' })

    // New interaction ID. This identifies a single interaction between the AI and the user.
    // Question and answer will be linked by this ID.
    const interactionID = createId()

    // Adds a new empty assistant message to the conversation.
    // We'll later update this message as new data from the server arrives.
    this.state.push({
      id: interactionID,
      query: data.query,
      response: '',
      sources: null,
      loading: true,
      error: false,
      aborted: false,
      errorMessage: null,
      planned: true,
      plan: null,
    })

    // The current state index. We'll need to frequently access the last state to update it,
    // so it might be worth it to simplify the process by storing the index.
    // The same goes for the current message index.
    const currentStateIndex = this.state.length - 1
    const currentMessageIndex = this.messages.length - 1

    // The actual request to the server.
    const reqStream = await this.oramaInterface.requestStream({
      method: 'POST',
      securityLevel: 'read-query',
      url: `/v1/collections/${this.collectionID}/planned_answer`,
      body: {
        interaction_id: data.interactionID,
        query: data.query,
        visitor_id: data.visitorID,
        conversation_id: data.sessionID,
        messages: data.messages || [],
      },
      signal: this.abortController?.signal,
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

            // Updates the current state with the new plan.
            this.state[currentStateIndex].plan = jsonPlan
            this.pushState()

            yield { action: 'ACTION_PLAN', message: jsonPlan }
            continue
          }

          // During the RAG process, the server will send the search results.
          // Since we know they will always be in a valid JSON format, we can parse them.
          if (action === 'PERFORM_ORAMA_SEARCH') {
            const jsonResult = JSON.parse(message.result)?.flat()

            // Updates the current state with the new sources.
            this.state[currentStateIndex].sources = jsonResult
            this.pushState()

            yield { action: 'PERFORM_ORAMA_SEARCH', message: jsonResult }
            continue
          }

          // ASK_FOLLOWUP and GIVE_REPLY are mutually exclusive.
          // When any of these actions are received, we'll need to store them into the current interaction response.
          if (action === 'ASK_FOLLOWUP' || action === 'GIVE_REPLY') {
            // This is a streamed message, so we'll need to accumulate.
            this.state[currentStateIndex].response += message.result
            this.messages[currentMessageIndex].content = this.state[currentStateIndex].response
            this.pushState()

            yield { action, message: message.result }
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

  public abort() {
    if (!this.abortController) {
      throw new Error('AbortController is not available.')
    }

    if (this.state.length === 0) {
      throw new Error('There is no active request to abort.')
    }

    this.abortController.abort()
    this.abortController = undefined
    this.state[this.state.length - 1].aborted = true
  }

  private pushState() {
    this.events?.onStateChange?.(this.state)
  }
}
