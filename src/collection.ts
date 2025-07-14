import { ZodType } from 'npm:zod@3.24.3'
import type { SSEEvent } from './lib/event-stream.ts'

import type {
  AnyObject,
  GeneratedQuery,
  Hook,
  InsertSegmentBody,
  InsertSegmentResponse,
  InsertTriggerBody,
  NLPSearchResult,
  NLPSearchStreamResult,
  NLPSearchStreamStatus,
  SearchParams,
  SearchResult,
  Segment,
  Trigger,
} from './lib/types.ts'
import type {
  ExecuteToolsBody,
  ExecuteToolsParsedResponse,
  ExecuteToolsResult,
  InsertSystemPromptBody,
  InsertToolBody,
  InsertTriggerResponse,
  SystemPrompt,
  SystemPromptValidationResponse,
  Tool,
  UpdateToolBody,
  UpdateTriggerResponse,
} from './index.ts'
import type { Interaction, Message } from './answer-session.ts'

import { Profile } from './profile.ts'
import { AnswerSession } from './answer-session.ts'
import { Auth, Client, type ClientConfig, type ClientRequestInit } from './common.ts'
import { flattenZodSchema, formatDuration } from './lib/utils.ts'

type AddHookConfig = {
  name: Hook
  code: string
}

type NewHookresponse = {
  hookID: string
  code: string
}

export type NLPSearchParams = {
  query: string
  LLMConfig?: LLMConfig
}

export type LLMConfig = {
  provider: 'openai' | 'fireworks' | 'together' | 'google'
  model: string
}

export type CreateAnswerSessionConfig = {
  LLMConfig?: LLMConfig
  initialMessages?: Message[]
  events?: {
    onStateChange: (state: Interaction[]) => void
  }
}

export type CreateIndexParams = {
  id?: string
  embeddings?: 'automatic' | 'all_properties' | string[]
}

const DEFAULT_READER_URL = 'https://collections.orama.com'
const DEAFULT_JWT_URL = 'https://app.orama.com/api/user/jwt'

export interface CollectionManagerConfig {
  cluster?: {
    writerURL?: string
    readURL?: string
  }
  collectionID: string
  apiKey: string
  authJwtURL?: string
}

export class CollectionManager {
  // private url: string
  private collectionID: string
  private apiKey: string
  // private writeAPIKey?: string
  // private readAPIKey?: string
  private client: Client
  private profile?: Profile

  constructor(config: CollectionManagerConfig) {
    let auth: Auth

    if (config.apiKey.startsWith('p_')) {
      // OramaCore Cloud Private Api Key (JWT flow)
      auth = new Auth({
        type: 'jwt',
        authJwtURL: config.authJwtURL ?? DEAFULT_JWT_URL,
        collectionID: config.collectionID,
        privateApiKey: config.apiKey,
        readerURL: config.cluster?.readURL ?? DEFAULT_READER_URL,
        writerURL: config.cluster?.writerURL,
      })
    } else {
      auth = new Auth({
        type: 'apiKey',
        readerURL: config.cluster?.readURL ?? DEFAULT_READER_URL,
        writerURL: config.cluster?.writerURL,
        apiKey: config.apiKey,
      })
      this.profile = new Profile({
        endpoint: config.cluster?.readURL ?? DEFAULT_READER_URL,
        apiKey: config.apiKey,
      })
    }
    const commonConfig: ClientConfig = {
      auth,
    }

    this.collectionID = config.collectionID
    this.client = new Client(commonConfig)
    this.apiKey = config.apiKey
  }

  public async search<R = AnyObject>(query: SearchParams, init?: ClientRequestInit): Promise<SearchResult<R>> {
    const start = +new Date()
    const { datasourceIDs, indexes, ...restQuery } = query

    const result = await this.client.request<Omit<SearchResult<R>, 'elapsed'>>({
      path: `/v1/collections/${this.collectionID}/search`,
      body: {
        ...restQuery,
        indexes: datasourceIDs || indexes,
      },
      method: 'POST',
      params: undefined,
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })

    const elapsed = +new Date() - start

    return {
      ...result,
      elapsed: {
        raw: elapsed,
        formatted: formatDuration(elapsed),
      },
    }
  }

  public NLPSearch<R = AnyObject>(params: NLPSearchParams, init?: ClientRequestInit): Promise<NLPSearchResult<R>[]> {
    return this.client.request({
      method: 'POST',
      path: `/v1/collections/${this.collectionID}/nlp_search`,
      body: params,
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public async *NLPSearchStream<R = AnyObject>(
    params: NLPSearchParams,
    init?: ClientRequestInit,
  ): AsyncGenerator<NLPSearchStreamResult<R>, void, unknown> {
    const body = {
      query: params.query,
      llm_config: params.LLMConfig ? { ...params.LLMConfig } : undefined,
    }

    const response = await this.client.requestStream({
      method: 'POST',
      path: `/v1/collections/${this.collectionID}/nlp_search_stream`,
      body: body,
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })

    // Get the reader from the ReadableStream
    const reader = response.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        if (value) {
          try {
            const streamResult = this.parseStreamResult<R>(value)
            if (streamResult) {
              yield streamResult
            }
          } catch (parseError) {
            // Log the error and break the stream
            console.warn('Failed to parse stream result:', parseError, 'Raw data:', value.data)
            yield { status: 'PARSE_ERROR' }
            break
          }
        }
      }
    } finally {
      // Always release the reader when done
      reader.releaseLock()
    }
  }

  private parseStreamResult<R = AnyObject>(result: SSEEvent) {
    if (!result.data) {
      return null
    }

    let parsedResult: unknown
    try {
      parsedResult = JSON.parse(result.data)
    } catch {
      // If it's not valid JSON, treat it as a status string
      return { status: result.data as NLPSearchStreamStatus }
    }

    // Handle simple string statuses (like "INIT", "OPTIMIZING_QUERY", "SEARCHING")
    if (typeof parsedResult === 'string') {
      return { status: parsedResult as NLPSearchStreamStatus }
    }

    // Handle object responses with data
    if (this.isValidObject(parsedResult)) {
      const entries = Object.entries(parsedResult)
      if (entries.length === 0) {
        return null
      }

      const [key, value] = entries[0]
      const status = key as NLPSearchStreamStatus

      // Return status-only for simple cases
      if (value === undefined || value === null) {
        return { status }
      }

      // Handle special case for GENERATED_QUERIES
      if (status === 'GENERATED_QUERIES') {
        return {
          status,
          data: this.parseGeneratedQueries(value) as R[] | GeneratedQuery[],
        }
      }

      // For all other cases with data, return as-is
      return {
        status,
        data: value as R | R[],
      }
    }

    return null
  }

  private isValidObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private parseGeneratedQueries(queries: any): GeneratedQuery[] {
    if (!Array.isArray(queries)) {
      console.warn('Expected array for GENERATED_QUERIES, got:', typeof queries)
      return []
    }

    return queries.map((data: any, index: number): GeneratedQuery => {
      try {
        let generatedQuery: any

        // Handle the generated_query_text parsing
        if (typeof data.generated_query_text === 'string') {
          generatedQuery = JSON.parse(data.generated_query_text)
        } else {
          generatedQuery = data.generated_query_text || {}
        }

        return {
          index: typeof data.index === 'number' ? data.index : index,
          original_query: data.original_query || '',
          generated_query: generatedQuery,
        }
      } catch (error) {
        console.warn(`Failed to parse generated query at index ${index}:`, error)
        return {
          index,
          original_query: data.original_query || '',
          generated_query: {
            term: '',
            mode: 'fulltext',
            properties: [],
          },
        }
      }
    })
  }

  public getStats(collectionID: string, init?: ClientRequestInit): Promise<AnyObject> {
    return this.client.request<AnyObject>({
      path: `/v1/collections/${collectionID}/stats`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public async createIndex(config: CreateIndexParams, init?: ClientRequestInit): Promise<void> {
    const body: AnyObject = {
      id: config.id,
      embedding: config.embeddings,
    }

    await this.client.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/create`,
      body,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public async deleteIndex(indexID: string, init?: ClientRequestInit): Promise<void> {
    await this.client.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/delete`,
      body: { index_id_to_delete: indexID },
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public setIndex(id: string): Index {
    return new Index(
      this.client,
      this.collectionID,
      id,
    )
  }

  public getAllDocsInCollection(id: string, init?: ClientRequestInit): Promise<AnyObject[]> {
    return this.client.request<AnyObject[]>({
      path: `/v1/collections/list`,
      method: 'POST',
      body: { id },
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public createAnswerSession(config?: CreateAnswerSessionConfig): AnswerSession {
    if (!this.apiKey) {
      throw new Error('Read API key is required to create an answer session')
    }

    return new AnswerSession({
      collectionID: this.collectionID,
      common: this.client,
      ...config,
    })
  }

  public async insertHook(config: AddHookConfig, init?: ClientRequestInit): Promise<NewHookresponse> {
    const body = {
      name: config.name,
      code: config.code,
    }

    await this.client.request({
      path: `/v1/collections/${this.collectionID}/hooks/set`,
      body,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })

    return {
      hookID: body.name,
      code: body.code,
    }
  }

  public async listHooks(init?: ClientRequestInit) {
    const res = await this.client.request<{ hooks: Record<Hook, string | null> }>({
      path: `/v1/collections/${this.collectionID}/hooks/list`,
      method: 'GET',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    });

    return res.hooks || {}
  }

  public async deleteHook(hook: Hook, init?: ClientRequestInit) {
    const body = {
      name_to_delete: hook,
    }

    await this.client.request({
      path: `/v1/collections/${this.collectionID}/hooks/delete`,
      body,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }


  public streamLogs(init?: ClientRequestInit) {
    return this.client.eventSource({
      path: `/v1/collections/${this.collectionID}/logs`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public insertSegment(segment: InsertSegmentBody, init?: ClientRequestInit): Promise<InsertSegmentResponse> {
    return this.client.request<InsertSegmentResponse>({
      path: `/v1/collections/${this.collectionID}/segments/insert`,
      body: segment,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public getSegment(id: string, init?: ClientRequestInit): Promise<{ segment: Segment }> {
    return this.client.request<{ segment: Segment }>({
      path: `/v1/collections/${this.collectionID}/segments/get`,
      params: { segment_id: id },
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public getAllSegments(init?: ClientRequestInit): Promise<{ segments: Segment[] }> {
    return this.client.request<{ segments: Segment[] }>({
      path: `/v1/collections/${this.collectionID}/segments/all`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public deleteSegment(id: string, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/segments/delete`,
      body: { id },
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public updateSegment(segment: Segment, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/segments/update`,
      body: segment,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public insertTrigger(trigger: InsertTriggerBody, init?: ClientRequestInit): Promise<InsertTriggerResponse> {
    if (!trigger.segment_id) {
      throw new Error('You cannot insert a trigger without a segment_id')
    }

    return this.client.request<InsertTriggerResponse>({
      path: `/v1/collections/${this.collectionID}/triggers/insert`,
      body: trigger,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public getTrigger(id: string, init?: ClientRequestInit): Promise<{ trigger: Trigger }> {
    return this.client.request<{ trigger: Trigger }>({
      path: `/v1/collections/${this.collectionID}/triggers/get`,
      params: { trigger_id: id },
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public getAllTriggers(init?: ClientRequestInit): Promise<{ triggers: Trigger[] }> {
    return this.client.request<{ triggers: Trigger[] }>({
      path: `/v1/collections/${this.collectionID}/triggers/all`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public deleteTrigger(id: string, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/triggers/delete`,
      body: { id },
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public updateTrigger(trigger: Trigger, init?: ClientRequestInit): Promise<UpdateTriggerResponse> {
    return this.client.request<UpdateTriggerResponse>({
      path: `/v1/collections/${this.collectionID}/triggers/update`,
      body: trigger,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public insertSystemPrompt(
    systemPrompt: InsertSystemPromptBody,
    init?: ClientRequestInit,
  ): Promise<{ success: boolean }> {
    return this.client.request<UpdateTriggerResponse>({
      path: `/v1/collections/${this.collectionID}/system_prompts/insert`,
      body: systemPrompt,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public getSystemPrompt(id: string, init?: ClientRequestInit): Promise<{ system_prompt: SystemPrompt }> {
    return this.client.request<{ system_prompt: SystemPrompt }>({
      path: `/v1/collections/${this.collectionID}/system_prompts/get`,
      params: { system_prompt_id: id },
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public getAllSystemPrompts(init?: ClientRequestInit): Promise<{ system_prompts: SystemPrompt[] }> {
    return this.client.request<{ system_prompts: SystemPrompt[] }>({
      path: `/v1/collections/${this.collectionID}/system_prompts/all`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public deleteSystemPrompt(id: string, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/system_prompts/delete`,
      body: { id },
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public updateSystemPrompt(systemPrompt: SystemPrompt, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/system_prompts/update`,
      body: systemPrompt,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public validateSystemPrompt(
    systemPrompt: SystemPrompt,
    init?: ClientRequestInit,
  ): Promise<{ result: SystemPromptValidationResponse }> {
    return this.client.request<{ result: SystemPromptValidationResponse }>({
      path: `/v1/collections/${this.collectionID}/system_prompts/validate`,
      body: systemPrompt,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public insertTool(tool: InsertToolBody, init?: ClientRequestInit) {
    let parameters: string

    switch (true) {
      case typeof tool.parameters === 'string': {
        parameters = tool.parameters
        break
      }
      case tool.parameters instanceof ZodType: {
        const flattenedSchema = flattenZodSchema(tool.parameters)
        parameters = JSON.stringify(flattenedSchema)
        break
      }
      case typeof tool.parameters === 'object': {
        parameters = JSON.stringify(tool.parameters)
        break
      }
      default:
        throw new Error('Invalid parameters type. Must be string, object or ZodType')
    }

    return this.client.request<void>({
      path: `/v1/collections/${this.collectionID}/tools/insert`,
      body: {
        ...tool,
        parameters,
      },
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public getTool(id: string, init?: ClientRequestInit): Promise<{ tool: Tool }> {
    return this.client.request<{ tool: Tool }>({
      path: `/v1/collections/${this.collectionID}/tools/get`,
      params: { tool_id: id },
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public getAllTools(init?: ClientRequestInit): Promise<{ tools: Tool[] }> {
    return this.client.request<{ tools: Tool[] }>({
      path: `/v1/collections/${this.collectionID}/tools/all`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public deleteTool(id: string, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/tools/delete`,
      body: { id },
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public updateTool(tool: UpdateToolBody, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/tools/update`,
      body: tool,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public async executeTools<Response = AnyObject>(
    tools: ExecuteToolsBody,
    init?: ClientRequestInit,
  ): Promise<ExecuteToolsParsedResponse<Response>> {
    const response = await this.client.request<ExecuteToolsParsedResponse<string>>({
      path: `/v1/collections/${this.collectionID}/tools/run`,
      body: tools,
      method: 'POST',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })

    if (response.results) {
      return {
        results: response.results.map((result): ExecuteToolsResult<Response> => {
          if ('functionResult' in result) {
            return {
              functionResult: {
                tool_id: result.functionResult.tool_id,
                result: JSON.parse(result.functionResult.result) as Response,
              },
            }
          }

          if ('functionParameters' in result) {
            return {
              functionParameters: {
                tool_id: result.functionParameters.tool_id,
                result: JSON.parse(result.functionParameters.result) as Response,
              },
            }
          }

          return result as unknown as ExecuteToolsResult<Response>
        }),
      }
    }

    return {
      results: null,
    }
  }

  public getIdentity(): string | undefined {
    if (!this.profile) {
      throw new Error('Profile is not defined')
    }
    return this.profile.getIdentity()
  }

  public getUserId(): string {
    if (!this.profile) {
      throw new Error('Profile is not defined')
    }
    return this.profile.getUserId()
  }

  public getAlias(): string | undefined {
    if (!this.profile) {
      throw new Error('Profile is not defined')
    }
    return this.profile.getAlias()
  }

  public async identify(identity: string): Promise<void> {
    if (!this.profile) {
      throw new Error('Profile is not defined')
    }
    await this.profile.identify(identity)
  }

  public async alias(alias: string): Promise<void> {
    if (!this.profile) {
      throw new Error('Profile is not defined')
    }
    await this.profile.alias(alias)
  }

  public reset(): void {
    if (!this.profile) {
      throw new Error('Profile is not defined')
    }
    this.profile.reset()
  }
}

export class Index {
  private indexID: string
  private collectionID: string
  private oramaInterface: Client

  constructor(
    oramaInterface: Client,
    collectionID: string,
    indexID: string,
  ) {
    this.indexID = indexID
    this.collectionID = collectionID
    this.oramaInterface = oramaInterface
  }

  public async reindex(init?: ClientRequestInit): Promise<void> {
    await this.oramaInterface.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/reindex`,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public async insertDocuments(documents: AnyObject | AnyObject[], init?: ClientRequestInit): Promise<void> {
    await this.oramaInterface.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/insert`,
      body: Array.isArray(documents) ? documents : [documents],
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public async deleteDocuments(documentIDs: string | string[], init?: ClientRequestInit): Promise<void> {
    await this.oramaInterface.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/delete`,
      body: Array.isArray(documentIDs) ? documentIDs : [documentIDs],
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public async upsertDocuments(documents: AnyObject[], init?: ClientRequestInit): Promise<void> {
    await this.oramaInterface.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/insert`,
      body: documents,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }
}
