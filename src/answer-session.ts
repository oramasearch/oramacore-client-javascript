import { createId } from 'npm:@orama/cuid2@2.2.3'
import { OramaInterface, safeJSONParse } from './common.ts'
import { knownActionsArray } from './const.ts'
import type { AnyObject, Nullable } from './index.ts'
import type { CreateAnswerSessionConfig } from './collection.ts'

export type AnswerSessionConfig = {
  url: string
  readAPIKey: string
  collectionID: string
  initialMessages?: Message[]
  events?: CreateAnswerSessionConfig['events']
}

type SSEMEssage = {
  type: string
  message: string
}

type SSEActionMessage = {
  action: string
  result: string
  done: boolean
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

export type PlanExecution = {
  [key: string]: {
    instruction: string
    result: string
    done: boolean
  }
}

export type Segment = {
  id: string
  name: string
  probability?: number
}

export type Trigger = {
  id: string
  name: string
  probability?: number
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
  planExecution: PlanExecution
  errorMessage: Nullable<string>
  aborted: boolean
  segment: Nullable<Segment>
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
      readAPIKey: this.readAPIKey,
    })

    this.messages = config.initialMessages || []
    this.events = config.events
  }

  public async *answerStream(data: AnswerConfig): AsyncGenerator<string> {
    // Resets the abort controller. This is necessary to avoid aborting the previous request if there is one.
    this.abortController = new AbortController()

    // Add the question to the messages list.
    // Also add a new, empty assistant message to the conversation.
    this.messages.push({ role: 'user', content: data.query })
    this.messages.push({ role: 'assistant', content: '' })

    // New interaction ID. This identifies a single interaction between the AI and the user.
    // Question and answer will be linked by this ID.
    const interactionID = data.interactionID || createId()

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
      planned: false,
      plan: null,
      planExecution: {},
      segment: null,
    })

    // The current state index. We'll need to frequently access the last state to update it,
    // so it might be worth it to simplify the process by storing the index.
    // The same goes for the current message index.
    const currentStateIndex = this.state.length - 1
    const currentMessageIndex = this.messages.length - 1

    const body = {
      interaction_id: interactionID,
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
        const data = safeJSONParse<any>(value.data)

        if (data.type === 'response') {
          const { action, result } = safeJSONParse<any>(data.message)

          switch (action) {
            case 'GET_SEGMENT': {
              if (result !== null) {
                const segment = safeJSONParse<Segment>(result)

                // Sometimes the server can send corrupted data due to hallucinations.
                // We need to check if the segment is valid before updating the state.
                if (!segment) {
                  break
                }

                this.state[currentStateIndex].segment = {
                  id: segment.id,
                  name: segment.name,
                }
                this.pushState()
              }

              break
            }
            case 'GET_TRIGGER': {
              if (result !== null) {
                const trigger = safeJSONParse<Trigger>(result)

                // Sometimes the server can send corrupted data due to hallucinations.
                // We need to check if the segment is valid before updating the state.
                if (!trigger) {
                  break
                }

                this.state[currentStateIndex].segment = trigger
                this.pushState()
              }
              break
            }
            case 'OPTIMIZING_QUERY':
              // @todo: understand if we want to expose this to the user.
              break
            case 'SEARCH_RESULTS': {
              const sources = safeJSONParse<any>(result)
              this.state[currentStateIndex].sources = sources
              this.pushState()
              break
            }
            case 'ANSWER_RESPONSE': {
              this.state[currentStateIndex].response += result
              this.messages[currentMessageIndex].content = this.state[currentStateIndex].response

              yield this.state[currentStateIndex].response

              this.pushState()
              break
            }
            default:
              break
          }
        }
      }

      if (done) {
        this.state[currentStateIndex].loading = false
        this.pushState()

        break
      }
    }

    reader.releaseLock()
  }

  public async answer(data: AnswerConfig): Promise<string> {
    let acc = ''

    for await (const value of this.answerStream(data)) {
      acc = value
    }

    return acc
  }

  public async *reasonStream(
    data: AnswerConfig,
  ): AsyncGenerator<string> {
    for await (const _ of this.fetchPlannedAnswer(data)) {
      yield this.state[this.state.length - 1].response
    }
  }

  public async reason(data: AnswerConfig): Promise<string> {
    // deno-lint-ignore no-empty
    for await (const _ of this.fetchPlannedAnswer(data)) {}

    return this.state[this.state.length - 1].response
  }

  private async *fetchPlannedAnswer(
    data: AnswerConfig,
  ): AsyncGenerator<PlannedAnswerResponse> {
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
      planExecution: {},
      segment: null,
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

        const data = safeJSONParse<SSEMEssage>(value.data)

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

          const message = safeJSONParse<SSEActionMessage>(data.message)
          const action = message.action

          // As a first message, the server will send the action plan.
          // This action plan contains the list of actions that the server will perform to answer the query.
          if (action === 'ACTION_PLAN') {
            const jsonPlan = safeJSONParse<any>(message.result)

            // Updates the current state with the new plan.
            this.state[currentStateIndex].plan = jsonPlan

            // Updates the current state's planExecution with the new plan.
            const planExecution: PlanExecution = {}

            for (const step of jsonPlan) {
              planExecution[step.step] = {
                instruction: step.description,
                result: '',
                done: false,
              }
            }

            this.state[currentStateIndex].planExecution = planExecution

            // Push the new state.
            this.pushState()

            yield { action: 'ACTION_PLAN', message: jsonPlan }
            continue
          }

          // During the RAG process, the server will send the search results.
          // Since we know they will always be in a valid JSON format, we can parse them.
          if (action === 'PERFORM_ORAMA_SEARCH') {
            const jsonResult = JSON.parse(message.result)

            // Updates the current state with the new sources.
            this.state[currentStateIndex].sources = jsonResult

            // Updates the current state's planExecution with the new result.
            if ('PERFORM_ORAMA_SEARCH' in this.state[currentStateIndex].planExecution) {
              this.state[currentStateIndex].planExecution.PERFORM_ORAMA_SEARCH.result = jsonResult
              this.state[currentStateIndex].planExecution.PERFORM_ORAMA_SEARCH.done = true
            }

            // Push the new state.
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

            this.state[currentStateIndex].planExecution[action].result += message.result
            this.state[currentStateIndex].planExecution[action].done = message.done

            this.pushState()

            yield { action, message: message.result }
            continue
          }

          // GET_SEGMENT needs to be handled separately.
          // It's a special action that will be used to get the segment of the user.
          if (action === 'GET_SEGMENT') {
            this.state[currentStateIndex].segment = {
              id: (message.result as unknown as Segment).id,
              name: (message.result as unknown as Segment).name,
            }
            this.pushState()
          }

          // SELECT_SEGMENT_PROBABILITY needs to be handled separately.
          // Sometimes the server will not send this, so we need to check this separately.
          if (action === 'SELECT_SEGMENT_PROBABILITY') {
            if (this.state[currentStateIndex].segment) {
              const probability = (message.result as unknown as Segment).probability
              this.state[currentStateIndex].segment.probability = probability
              this.pushState()
            }
          }

          // Just like with the segment, we need to handle the triggers separately.
          if (action === 'GET_TRIGGER') {
            this.state[currentStateIndex].segment = {
              id: (message.result as unknown as Trigger).id,
              name: (message.result as unknown as Trigger).name,
            }
            this.pushState()
          }

          // And just like SELECT_SEGMENT_PROBABILITY, we need to handle SELECT_TRIGGER_PROBABILITY separately.
          if (action === 'SELECT_TRIGGER_PROBABILITY') {
            if (this.state[currentStateIndex].segment) {
              const probability = (message.result as unknown as Trigger).probability
              this.state[currentStateIndex].segment.probability = probability
              this.pushState()
            }
          }

          if (!knownActionsArray.includes(action)) {
            this.state[currentStateIndex].planExecution[action].result += message.result
            this.state[currentStateIndex].planExecution[action].done = message.done
            this.pushState()
          }

          yield message as unknown as PlannedAnswerResponse
        }
      }

      if (done) {
        break
      }
    }

    reader.releaseLock()

    // The server has finished sending messages.
    // We can now mark the interaction as not loading anymore.
    this.state[currentStateIndex].loading = false
    this.pushState()
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
