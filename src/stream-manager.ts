import type { AdvancedAutoqueryEvent, AnswerEvent } from 'npm:@orama/oramacore-events-parser@0.0.4'
import type { AnyObject, Nullable, SearchParams, SearchResult } from './index.ts'
import type { Client, ClientRequestInit } from './common.ts'

import { createId } from 'npm:@orama/cuid2@2.2.3'
import { parseAnswerStream } from 'npm:@orama/oramacore-events-parser@0.0.5'
import { hasLocalStorage, isServerRuntime } from './lib/utils.ts'
import { DEFAULT_SERVER_USER_ID, LOCAL_STORAGE_USER_ID_KEY } from './constants.ts'
import { safeJSONParse } from './common.ts'
import { dedupe } from './index.ts'

export type AnswerSessionConfig = {
  collectionID: string
  initialMessages?: Message[]
  events?: CreateAnswerSessionConfig['events']
  sessionID?: string
  LLMConfig?: CreateAnswerSessionConfig['LLMConfig']
  common: Client
}

export type AnswerConfig = {
  query: string
  interactionID?: string
  visitorID?: string
  sessionID?: string
  messages?: Message[]
  related?: Nullable<RelatedQuestionsConfig>
  datasourceIDs?: string[]
  min_similarity?: number
  max_documents?: number
  ragat_notation?: string
}

export type Message = {
  role: Role
  content: string
}

export type RelatedQuestionsConfig = {
  enabled?: Nullable<boolean>
  size?: Nullable<number>
  format?: Nullable<'question' | 'query'>
}

export type Role = 'system' | 'assistant' | 'user'

export type AnswerStep = AnswerEvent['type']
export type NLPQueryStep = AdvancedAutoqueryEvent['type']

export type Interaction<D = AnyObject> = {
  id: string
  query: string
  optimizedQuery: Nullable<SearchParams>
  response: string
  sources: Nullable<D>
  loading: boolean
  error: boolean
  errorMessage: Nullable<string>
  aborted: boolean
  related: Nullable<string>
  currentStep: Nullable<string>
  currentStepVerbose: Nullable<string>
  selectedLLM: Nullable<LLMConfig>
  advancedAutoquery: Nullable<{
    // Basic optimized queries
    optimizedQueries?: Nullable<string[]>

    // Selected properties - array of objects, not keyed object
    selectedProperties?: Nullable<AnyObject[]>

    // Properties with values (keeping existing structure)
    selectedPropertiesWithValues?: {
      [key: string]: {
        collection: string
        properties: string[]
      }
    }

    // Combined queries and properties
    queriesAndProperties?: Nullable<{
      query: string
      properties: AnyObject
      filter_properties: AnyObject
    }[]>

    // Tracked queries with detailed information
    trackedQueries?: Nullable<{
      index: number
      original_query: string
      generated_query_text: string
      search_params: SearchParams
    }[]>

    // Search results from executed queries
    searchResults?: Nullable<{
      original_query: string
      generated_query: string
      search_params: SearchParams
      results: SearchResult[]
      query_index: number
    }[]>

    // Final processed results
    results?: Nullable<{
      original_query: string
      generated_query: string
      search_params: SearchParams
      results: SearchResult[]
      query_index: number
    }[]>
  }>
}

export type LLMConfig = {
  provider: 'openai' | 'fireworks' | 'together' | 'google'
  model: string
}

export type CreateAnswerSessionConfig = {
  LLMConfig?: LLMConfig
  initialMessages?: Message[]
  events?: {
    onStateChange?: (state: Interaction[]) => void
    onEnd?: (state: Interaction[]) => void
    onIncomingEvent?: (event: any) => void
  }
}

export class OramaCoreStream {
  private collectionID: string
  private oramaInterface: Client
  private abortController?: AbortController
  private events?: CreateAnswerSessionConfig['events']
  private LLMConfig?: CreateAnswerSessionConfig['LLMConfig']
  private sessionID?: string
  private lastInteractionParams?: AnswerConfig

  public messages: Message[]
  public state: Interaction[] = []

  constructor(config: AnswerSessionConfig) {
    this.collectionID = config.collectionID
    this.oramaInterface = config.common

    this.LLMConfig = config.LLMConfig
    this.messages = config.initialMessages || []
    this.events = config.events
    this.sessionID = config.sessionID || createId()
  }

  public async answer(data: AnswerConfig, init?: ClientRequestInit): Promise<string> {
    const stream = this.answerStream(data, init)
    let result = ''
    for await (const chunk of stream) {
      result = chunk
    }
    return result
  }

  public async *answerStream(data: AnswerConfig, init?: ClientRequestInit): AsyncGenerator<string> {
    this.lastInteractionParams = { ...data }

    data = this._enrichConfig(data)

    this.abortController = new AbortController()

    // Connect the abort signal to the request
    const requestInit = init ?? {}
    requestInit.signal = this.abortController.signal

    this.messages.push({ role: 'user', content: data.query })
    this.messages.push({ role: 'assistant', content: '' })

    const interactionID = data.interactionID || createId()

    this.state.push({
      id: interactionID,
      query: data.query,
      optimizedQuery: null,
      response: '',
      sources: null,
      loading: true,
      error: false,
      aborted: false,
      errorMessage: null,
      related: data.related?.enabled ? '' : null,
      currentStep: 'starting',
      currentStepVerbose: null,
      selectedLLM: null,
      advancedAutoquery: null,
    })

    this._pushState()

    const currentStateIndex = this.state.length - 1
    const currentMessageIndex = this.messages.length - 1

    try {
      const body = {
        interaction_id: interactionID,
        query: data.query,
        visitor_id: data.visitorID,
        conversation_id: data.sessionID,
        messages: this.messages.slice(0, -1), // Send conversation history excluding the empty assistant message
        llm_config: null as Nullable<CreateAnswerSessionConfig['LLMConfig']>,
        related: data.related,
        min_similarity: data.min_similarity,
        max_documents: data.max_documents,
        ragat_notation: data.ragat_notation,
      }

      if (this.LLMConfig) {
        body.llm_config = this.LLMConfig
      }

      const reqStream = await this.oramaInterface.getResponse({
        method: 'POST',
        path: `/v1/collections/${this.collectionID}/generate/answer`,
        body,
        init: requestInit,
        apiKeyPosition: 'query-params',
        target: 'reader',
      })

      if (!reqStream.body) {
        throw new Error('No response body')
      }

      const emitter = parseAnswerStream(reqStream.body)

      let finished = false
      let lastYielded = ''

      emitter.on('answer_token', (event) => {
        this.state[currentStateIndex].response += event.token
        this.messages[currentMessageIndex].content = this.state[currentStateIndex].response
        this._pushState()
      })

      emitter.on('selected_llm', (event) => {
        this.state[currentStateIndex].selectedLLM = {
          provider: event.provider as LLMConfig['provider'],
          model: event.model,
        }
        this._pushState()
      })

      emitter.on('optimizing_query', (event) => {
        this.state[currentStateIndex].optimizedQuery = safeJSONParse<SearchParams>(event.optimized_query)
        this._pushState()
      })

      emitter.on('search_results', (event) => {
        this.state[currentStateIndex].sources = event.results as unknown as AnyObject
        this._pushState()
      })

      emitter.on('related_queries', (event) => {
        this.state[currentStateIndex].related = event.queries
        this._pushState()
      })

      emitter.onStateChange((event) => {
        this.state[currentStateIndex].currentStep = event.state
        this._pushState()
      })

      emitter.on('state_changed', (event) => {
        this.events?.onIncomingEvent?.(event)

        const eventData = event.data as any

        // Handle advanced autoquery state updates
        if (event.state === 'advanced_autoquery_query_optimized' && eventData?.optimized_queries) {
          if (!this.state[currentStateIndex].advancedAutoquery) {
            this.state[currentStateIndex].advancedAutoquery = {}
          }
          this.state[currentStateIndex].advancedAutoquery!.optimizedQueries = eventData.optimized_queries
          const verboseMessage = this.state[currentStateIndex].advancedAutoquery!.optimizedQueries?.join('\nAlso, ')!
          const deduped = dedupe(verboseMessage)
          if (deduped) {
            this.state[currentStateIndex].currentStepVerbose = verboseMessage
            this._pushState()
          }
        }

        if (event.state === 'advanced_autoquery_properties_selected' && eventData?.selected_properties) {
          if (!this.state[currentStateIndex].advancedAutoquery) {
            this.state[currentStateIndex].advancedAutoquery = {}
          }
          this.state[currentStateIndex].advancedAutoquery!.selectedProperties = eventData.selected_properties
          const filters = this.state[currentStateIndex].advancedAutoquery!.selectedProperties?.map(Object.values).flat()
            .map((x) => x.selected_properties).flat().map((x) => `${x.property}`).join(', ')
          const verboseMessage = `Filtering by ${filters}`
          const deduped = dedupe(verboseMessage)
          if (deduped) {
            this.state[currentStateIndex].currentStepVerbose = verboseMessage
            this._pushState()
          }
        }

        if (event.state === 'advanced_autoquery_combine_queries' && eventData?.queries_and_properties) {
          if (!this.state[currentStateIndex].advancedAutoquery) {
            this.state[currentStateIndex].advancedAutoquery = {}
          }
          this.state[currentStateIndex].advancedAutoquery!.queriesAndProperties = eventData.queries_and_properties
          this._pushState()
        }

        if (event.state === 'advanced_autoquery_tracked_queries_generated' && eventData?.tracked_queries) {
          if (!this.state[currentStateIndex].advancedAutoquery) {
            this.state[currentStateIndex].advancedAutoquery = {}
          }
          this.state[currentStateIndex].advancedAutoquery!.trackedQueries = eventData.tracked_queries
          this._pushState()
        }

        if (event.state === 'advanced_autoquery_search_results' && eventData?.search_results) {
          if (!this.state[currentStateIndex].advancedAutoquery) {
            this.state[currentStateIndex].advancedAutoquery = {}
          }
          this.state[currentStateIndex].advancedAutoquery!.searchResults = eventData.search_results

          const resultsCount = eventData.search_results.reduce(
            (acc: number, curr: any) => acc + curr.results[0].count,
            0,
          )
          const resultText = eventData.search_results.map((x: any) => JSON.parse(x.generated_query).term).join(', ')
          const verboseMessage = `Found ${resultsCount} result${resultsCount === 1 ? '' : 's'} for "${resultText}"`
          const deduped = dedupe(verboseMessage)
          if (deduped) {
            this.state[currentStateIndex].currentStepVerbose = verboseMessage
            this._pushState()
          }
        }

        if (event.state === 'advanced_autoquery_completed' && eventData?.results) {
          if (!this.state[currentStateIndex].advancedAutoquery) {
            this.state[currentStateIndex].advancedAutoquery = {}
          }
          this.state[currentStateIndex].advancedAutoquery!.results = eventData.results
          this.state[currentStateIndex].currentStepVerbose = null
          this._pushState()
        }

        if (event.state === 'completed') {
          finished = true
          this.state[currentStateIndex].loading = false
          this._pushState()
        }

        if (this.events?.onEnd) {
          this.events.onEnd(this.state)
        }
      })

      while (!finished) {
        const response = this.state[currentStateIndex].response
        if (response !== lastYielded) {
          lastYielded = response
          yield response
        } else if (!finished) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }
    } catch (error) {
      // Handle AbortError gracefully
      if (error instanceof Error && error.name === 'AbortError') {
        // Stream was aborted - this is expected behavior, don't throw
        this.state[currentStateIndex].loading = false
        this.state[currentStateIndex].aborted = true
        this._pushState()
        return // Exit the generator gracefully
      }

      // Handle other errors
      this.state[currentStateIndex].loading = false
      this.state[currentStateIndex].error = true
      this.state[currentStateIndex].errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this._pushState()
      throw error // Re-throw non-abort errors
    }
  }

  public regenerateLast(
    { stream = true } = {},
    init?: ClientRequestInit,
  ): string | Promise<string> | AsyncGenerator<string> {
    if (this.state.length === 0 || this.messages.length === 0) {
      throw new Error('No messages to regenerate')
    }

    const isLastMessageAssistant = this.messages.at(-1)?.role === 'assistant'

    if (!isLastMessageAssistant) {
      throw new Error('Last message is not an assistant message')
    }

    // Remove the last assistant message and state
    this.messages.pop()
    this.state.pop()

    if (!this.lastInteractionParams) {
      throw new Error('No last interaction parameters available')
    }

    if (stream) {
      return this.answerStream(this.lastInteractionParams, init)
    }

    return this.answer(this.lastInteractionParams, init)
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

    const lastState = this.state[this.state.length - 1]
    lastState.aborted = true
    lastState.loading = false

    this._pushState()
  }

  public clearSession() {
    this.messages = []
    this.state = []

    this._pushState()
  }

  private _pushState() {
    this.events?.onStateChange?.(this.state)
  }

  private _enrichConfig(config: AnswerConfig) {
    if (!config.visitorID) {
      config.visitorID = getUserID()
    }

    if (!config.interactionID) {
      config.interactionID = createId()
    }

    if (!config.sessionID) {
      config.sessionID = this.sessionID
    }

    return config
  }
}

function getUserID() {
  if (isServerRuntime()) {
    return DEFAULT_SERVER_USER_ID
  }

  if (hasLocalStorage) {
    const id = localStorage.getItem(LOCAL_STORAGE_USER_ID_KEY)

    if (id) {
      return id
    }
  }

  return createId()
}
