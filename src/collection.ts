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
import { OramaInterface } from './common.ts'
import { flattenZodSchema, formatDuration } from './lib/utils.ts'

export type CollectionManagerConfig = {
  url: string
  collectionID: string
  writeAPIKey?: string
  readAPIKey?: string
}

type AddHookConfig = {
  name: Hook
  collectionID: string
  code: string
}

type NewHookresponse = {
  hookID: string
  collectionID: string
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

export class CollectionManager {
  private url: string
  private collectionID: string
  private writeAPIKey?: string
  private readAPIKey?: string
  private oramaInterface: OramaInterface
  private profile: Profile

  constructor(config: CollectionManagerConfig) {
    this.url = config.url
    this.writeAPIKey = config.writeAPIKey
    this.readAPIKey = config.readAPIKey
    this.collectionID = config.collectionID
    this.oramaInterface = new OramaInterface({
      baseURL: this.url,
      writeAPIKey: this.writeAPIKey,
      readAPIKey: this.readAPIKey,
    })

    this.profile = new Profile({
      endpoint: this.url,
      apiKey: this.readAPIKey!,
    })
  }

  public async search<R = AnyObject>(query: SearchParams): Promise<SearchResult<R>> {
    const start = +new Date()
    const { datasourceIDs, indexes, ...restQuery } = query

    const result = await this.oramaInterface.request<Omit<SearchResult<R>, 'elapsed'>>({
      url: `/v1/collections/${this.collectionID}/search`,
      body: {
        ...restQuery,
        indexes: datasourceIDs || indexes,
      },
      method: 'POST',
      securityLevel: 'read-query',
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

  public NLPSearch<R = AnyObject>(params: NLPSearchParams): Promise<NLPSearchResult<R>[]> {
    return this.oramaInterface.request({
      method: 'POST',
      securityLevel: 'read-query',
      url: `/v1/collections/${this.collectionID}/nlp_search`,
      body: params,
    })
  }

public async *NLPSearchStream<R = AnyObject>(
  params: NLPSearchParams,
): AsyncGenerator<NLPSearchStreamResult<R>, void, unknown> {
  const body = {
    query: params.query,
    llm_config: params.LLMConfig ? { ...params.LLMConfig } : undefined,
  }

  const response = await this.oramaInterface.requestStream<NLPSearchParams>({
    method: 'POST',
    securityLevel: 'read-query',
    url: `/v1/collections/${this.collectionID}/nlp_search_stream`,
    body: body,
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

  public getStats(collectionID: string): Promise<AnyObject> {
    return this.oramaInterface.request<AnyObject>({
      url: `/v1/collections/${collectionID}/stats`,
      method: 'GET',
      securityLevel: 'read-query',
    })
  }

  public async createIndex(config: CreateIndexParams): Promise<void> {
    const body: AnyObject = {
      id: config.id,
      embedding: config.embeddings,
    }

    await this.oramaInterface.request<void>({
      url: `/v1/collections/${this.collectionID}/indexes/create`,
      body,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public async deleteIndex(indexID: string): Promise<void> {
    await this.oramaInterface.request<void>({
      url: `/v1/collections/${this.collectionID}/indexes/delete`,
      body: { index_id_to_delete: indexID },
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public setIndex(id: string): Index {
    return new Index(this.collectionID, id, this.url, this.writeAPIKey, this.readAPIKey)
  }

  public getAllDocsInCollection(id: string): Promise<AnyObject[]> {
    return this.oramaInterface.request<AnyObject[]>({
      url: `/v1/collections/list`,
      method: 'POST',
      body: { id },
      securityLevel: 'write',
    })
  }

  public createAnswerSession(config?: CreateAnswerSessionConfig): AnswerSession {
    if (!this.readAPIKey) {
      throw new Error('Read API key is required to create an answer session')
    }

    return new AnswerSession({
      url: this.url,
      readAPIKey: this.readAPIKey || '',
      collectionID: this.collectionID,
      ...config,
    })
  }

  public async insertHook(config: AddHookConfig): Promise<NewHookresponse> {
    const body = {
      name: config.name,
      code: config.code,
    }

    await this.oramaInterface.request({
      url: `/v1/collections/${config.collectionID}/hooks/create`,
      body,
      method: 'POST',
      securityLevel: 'write',
    })

    return {
      hookID: body.name,
      collectionID: config.collectionID,
      code: body.code,
    }
  }

  public insertSegment(segment: InsertSegmentBody): Promise<InsertSegmentResponse> {
    return this.oramaInterface.request<InsertSegmentResponse>({
      url: `/v1/collections/${this.collectionID}/segments/insert`,
      body: segment,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public getSegment(id: string): Promise<{ segment: Segment }> {
    return this.oramaInterface.request<{ segment: Segment }>({
      url: `/v1/collections/${this.collectionID}/segments/get`,
      body: { segment_id: id },
      method: 'GET',
      securityLevel: 'read-query',
    })
  }

  public getAllSegments(): Promise<{ segments: Segment[] }> {
    return this.oramaInterface.request<{ segments: Segment[] }>({
      url: `/v1/collections/${this.collectionID}/segments/all`,
      method: 'GET',
      securityLevel: 'read-query',
    })
  }

  public deleteSegment(id: string): Promise<{ success: boolean }> {
    return this.oramaInterface.request<{ success: boolean }>({
      url: `/v1/collections/${this.collectionID}/segments/delete`,
      body: { id },
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public updateSegment(segment: Segment): Promise<{ success: boolean }> {
    return this.oramaInterface.request<{ success: boolean }>({
      url: `/v1/collections/${this.collectionID}/segments/update`,
      body: segment,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public insertTrigger(trigger: InsertTriggerBody): Promise<InsertTriggerResponse> {
    if (!trigger.segment_id) {
      throw new Error('You cannot insert a trigger without a segment_id')
    }

    return this.oramaInterface.request<InsertTriggerResponse>({
      url: `/v1/collections/${this.collectionID}/triggers/insert`,
      body: trigger,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public getTrigger(id: string): Promise<{ trigger: Trigger }> {
    return this.oramaInterface.request<{ trigger: Trigger }>({
      url: `/v1/collections/${this.collectionID}/triggers/get`,
      body: { trigger_id: id },
      method: 'GET',
      securityLevel: 'read-query',
    })
  }

  public getAllTriggers(): Promise<{ triggers: Trigger[] }> {
    return this.oramaInterface.request<{ triggers: Trigger[] }>({
      url: `/v1/collections/${this.collectionID}/triggers/all`,
      method: 'GET',
      securityLevel: 'read-query',
    })
  }

  public deleteTrigger(id: string): Promise<{ success: boolean }> {
    return this.oramaInterface.request<{ success: boolean }>({
      url: `/v1/collections/${this.collectionID}/triggers/delete`,
      body: { id },
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public updateTrigger(trigger: Trigger): Promise<UpdateTriggerResponse> {
    return this.oramaInterface.request<UpdateTriggerResponse>({
      url: `/v1/collections/${this.collectionID}/triggers/update`,
      body: trigger,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public insertSystemPrompt(systemPrompt: InsertSystemPromptBody): Promise<{ success: boolean }> {
    return this.oramaInterface.request<UpdateTriggerResponse>({
      url: `/v1/collections/${this.collectionID}/system_prompts/insert`,
      body: systemPrompt,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public getSystemPrompt(id: string): Promise<{ system_prompt: SystemPrompt }> {
    return this.oramaInterface.request<{ system_prompt: SystemPrompt }>({
      url: `/v1/collections/${this.collectionID}/system_prompts/get`,
      body: { system_prompt_id: id },
      method: 'GET',
      securityLevel: 'read',
    })
  }

  public getAllSystemPrompts(): Promise<{ system_prompts: SystemPrompt[] }> {
    return this.oramaInterface.request<{ system_prompts: SystemPrompt[] }>({
      url: `/v1/collections/${this.collectionID}/system_prompts/all`,
      method: 'GET',
      securityLevel: 'read-query',
    })
  }

  public deleteSystemPrompt(id: string): Promise<{ success: boolean }> {
    return this.oramaInterface.request<{ success: boolean }>({
      url: `/v1/collections/${this.collectionID}/system_prompts/delete`,
      body: { id },
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public updateSystemPrompt(systemPrompt: SystemPrompt): Promise<{ success: boolean }> {
    return this.oramaInterface.request<{ success: boolean }>({
      url: `/v1/collections/${this.collectionID}/system_prompts/update`,
      body: systemPrompt,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public validateSystemPrompt(
    systemPrompt: SystemPrompt,
  ): Promise<{ result: SystemPromptValidationResponse }> {
    return this.oramaInterface.request<{ result: SystemPromptValidationResponse }>({
      url: `/v1/collections/${this.collectionID}/system_prompts/validate`,
      body: systemPrompt,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public insertTool(tool: InsertToolBody) {
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

    return this.oramaInterface.request<void>({
      url: `/v1/collections/${this.collectionID}/tools/insert`,
      body: {
        ...tool,
        parameters,
      },
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public getTool(id: string): Promise<{ tool: Tool }> {
    return this.oramaInterface.request<{ tool: Tool }>({
      url: `/v1/collections/${this.collectionID}/tools/get`,
      body: { tool_id: id },
      method: 'GET',
      securityLevel: 'read-query',
    })
  }

  public getAllTools(): Promise<{ tools: Tool[] }> {
    return this.oramaInterface.request<{ tools: Tool[] }>({
      url: `/v1/collections/${this.collectionID}/tools/all`,
      method: 'GET',
      securityLevel: 'read-query',
    })
  }

  public deleteTool(id: string): Promise<{ success: boolean }> {
    return this.oramaInterface.request<{ success: boolean }>({
      url: `/v1/collections/${this.collectionID}/tools/delete`,
      body: { id },
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public updateTool(tool: UpdateToolBody): Promise<{ success: boolean }> {
    return this.oramaInterface.request<{ success: boolean }>({
      url: `/v1/collections/${this.collectionID}/tools/update`,
      body: tool,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public async executeTools<Response = AnyObject>(
    tools: ExecuteToolsBody,
  ): Promise<ExecuteToolsParsedResponse<Response>> {
    const response = await this.oramaInterface.request<ExecuteToolsParsedResponse<string>>({
      url: `/v1/collections/${this.collectionID}/tools/run`,
      body: tools,
      method: 'POST',
      securityLevel: 'read',
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
    return this.profile.getIdentity()
  }

  public getUserId(): string {
    return this.profile.getUserId()
  }

  public getAlias(): string | undefined {
    return this.profile.getAlias()
  }

  public async identify(identity: string): Promise<void> {
    await this.profile.identify(identity)
  }

  public async alias(alias: string): Promise<void> {
    await this.profile.alias(alias)
  }

  public reset(): void {
    this.profile.reset()
  }
}

export class Index {
  private indexID: string
  private collectionID: string
  private oramaInterface: OramaInterface

  constructor(collectionID: string, indexID: string, url: string, writeAPIKey?: string, readAPIKey?: string) {
    this.indexID = indexID
    this.collectionID = collectionID
    this.oramaInterface = new OramaInterface({
      baseURL: url,
      writeAPIKey: writeAPIKey,
      readAPIKey: readAPIKey,
    })
  }

  public async reindex(): Promise<void> {
    await this.oramaInterface.request<void>({
      url: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/reindex`,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public async insertDocuments(documents: AnyObject | AnyObject[]): Promise<void> {
    await this.oramaInterface.request<void, AnyObject[]>({
      url: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/insert`,
      body: Array.isArray(documents) ? documents : [documents],
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public async deleteDocuments(documentIDs: string | string[]): Promise<void> {
    await this.oramaInterface.request<void, string[]>({
      url: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/delete`,
      body: Array.isArray(documentIDs) ? documentIDs : [documentIDs],
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public async upsertDocuments(documents: AnyObject[]): Promise<void> {
    await this.oramaInterface.request<void, AnyObject[]>({
      url: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/insert`,
      body: documents,
      method: 'POST',
      securityLevel: 'write',
    })
  }
}
