import { ZodType } from 'npm:zod@3.24.3'

import type {
  AnyObject,
  Hook,
  NLPSearchResult,
  NLPSearchStreamResult,
  NLPSearchStreamStatus,
  Nullable,
  PinningRule,
  PinningRuleInsertObject,
  SearchParams,
  SearchResult,
  TrainingSetInsertParameters,
} from './lib/types.ts'
import type {
  ExecuteToolsBody,
  ExecuteToolsParsedResponse,
  ExecuteToolsResult,
  InsertSystemPromptBody,
  InsertToolBody,
  SystemPrompt,
  SystemPromptValidationResponse,
  Tool,
  TrainingSetQueryOptimizer,
  UpdateToolBody,
  UpdateTriggerResponse,
} from './index.ts'
import type { CreateAISessionConfig } from './stream-manager.ts'
import type { ClientConfig, ClientRequestInit } from './common.ts'

import { Profile } from './profile.ts'
import { OramaCoreStream } from './stream-manager.ts'
import { Auth, Client } from './common.ts'
import { createRandomString, flattenZodSchema, formatDuration } from './lib/utils.ts'
import { parseNLPQueryStream } from 'npm:@orama/oramacore-events-parser@0.0.5'
import { dedupe } from './index.ts'

type AddHookConfig = {
  name: Hook
  code: string
}

type NewHookresponse = {
  hookID: string
  code: string
}

interface NLPStreamErrorEvent {
  type: 'error'
  error: string
  state: string
  is_terminal?: boolean
}

interface NLPStreamStateChangedEvent {
  type: 'state_changed'
  state: string
  message: string
  data?: unknown
  is_terminal?: boolean
}

interface NLPStreamSearchResultsEvent {
  type: 'search_results'
  results: any[]
}

export type NLPSearchParams = {
  query: string
  LLMConfig?: LLMConfig
  userID?: string
}

export type LLMConfig = {
  provider: 'openai' | 'fireworks' | 'together' | 'google' | 'groq'
  model: string
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

  public ai: AINamespace
  public collections: CollectionsNamespace
  public index: IndexNamespace
  public hooks: HooksNamespace
  public logs: LogsNamespace
  public systemPrompts: SystemPromptsNamespace
  public tools: ToolsNamespace
  public identity: IdentityNamespace
  public trainingSets: TrainingSetsNamespace

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

    // Initialize namespaces
    this.ai = new AINamespace(this.client, this.collectionID, this.profile)
    this.collections = new CollectionsNamespace(this.client, this.collectionID)
    this.index = new IndexNamespace(this.client, this.collectionID)
    this.hooks = new HooksNamespace(this.client, this.collectionID)
    this.logs = new LogsNamespace(this.client, this.collectionID)
    this.systemPrompts = new SystemPromptsNamespace(this.client, this.collectionID)
    this.tools = new ToolsNamespace(this.client, this.collectionID)
    this.identity = new IdentityNamespace(this.profile)
    this.trainingSets = new TrainingSetsNamespace(this.client, this.collectionID)
  }

  public async search<R = AnyObject>(query: SearchParams, init?: ClientRequestInit): Promise<SearchResult<R>> {
    const start = Date.now()
    const { datasourceIDs, indexes, ...restQuery } = query

    const result = await this.client.request<Omit<SearchResult<R>, 'elapsed'>>({
      path: `/v1/collections/${this.collectionID}/search`,
      body: {
        userID: this.profile?.getUserId() || undefined,
        ...restQuery, // restQuery can override `userID`
        indexes: datasourceIDs || indexes,
      },
      method: 'POST',
      params: undefined,
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })

    const elapsed = Date.now() - start

    return {
      ...result,
      elapsed: {
        raw: elapsed,
        formatted: formatDuration(elapsed),
      },
    }
  }
}

class AINamespace {
  private client: Client
  private collectionID: string
  private profile?: Profile

  constructor(client: Client, collectionID: string, profile?: Profile) {
    this.client = client
    this.collectionID = collectionID
    this.profile = profile
  }

  public NLPSearch<R = AnyObject>(params: NLPSearchParams, init?: ClientRequestInit): Promise<NLPSearchResult<R>[]> {
    return this.client.request({
      method: 'POST',
      path: `/v1/collections/${this.collectionID}/nlp_search`,
      body: {
        userID: this.profile?.getUserId() || undefined,
        ...params,
      },
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
      llm_config: params.LLMConfig ? { ...params.LLMConfig } : undefined,
      userID: this.profile?.getUserId() || undefined,
      messages: [
        {
          role: 'user',
          content: params.query,
        },
      ],
    }

    const response = await this.client.getResponse({
      method: 'POST',
      path: `/v1/collections/${this.collectionID}/generate/nlp_query`,
      body: body,
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })

    if (!response.body) {
      throw new Error('No response body')
    }

    let finished = false
    let currentResult: Nullable<NLPSearchStreamResult<R>> = null

    const emitter = parseNLPQueryStream(response.body)

    emitter.on('error', (e: NLPStreamErrorEvent) => {
      if (e.is_terminal) {
        finished = true
      }
      throw new Error(e.error)
    })

    emitter.on('state_changed', (event: NLPStreamStateChangedEvent) => {
      currentResult = {
        status: event.state as NLPSearchStreamStatus,
        data: (event.data || []) as R[],
      }
    })

    emitter.on('search_results', (event: NLPStreamSearchResultsEvent) => {
      currentResult = {
        status: 'SEARCH_RESULTS',
        data: event.results as R[],
      }
      finished = true
    })

    // Yield results until we get search results
    while (!finished) {
      if (currentResult !== null) {
        const deduped = dedupe((currentResult as NLPSearchStreamResult<R>).status)
        if (deduped) {
          yield currentResult
        }
      }
      // Small delay to prevent busy waiting
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    // Yield the final search results
    if (currentResult !== null) {
      const deduped = dedupe((currentResult as NLPSearchStreamResult<R>).status)
      if (deduped) {
        yield currentResult
      }
    }
  }

  public createAISession(config?: CreateAISessionConfig): OramaCoreStream {
    return new OramaCoreStream({
      collectionID: this.collectionID,
      common: this.client,
      ...config,
    })
  }
}

class CollectionsNamespace {
  private client: Client
  private collectionID: string

  constructor(client: Client, collectionID: string) {
    this.client = client
    this.collectionID = collectionID
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

  public getAllDocs<T = AnyObject>(id: string, init?: ClientRequestInit): Promise<T[]> {
    return this.client.request<T[]>({
      path: `/v1/collections/list`,
      method: 'POST',
      body: { id },
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }
}

class IndexNamespace {
  private client: Client
  private collectionID: string

  constructor(client: Client, collectionID: string) {
    this.client = client
    this.collectionID = collectionID
  }

  public async create(config: CreateIndexParams, init?: ClientRequestInit): Promise<void> {
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

  public async delete(indexID: string, init?: ClientRequestInit): Promise<void> {
    await this.client.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/delete`,
      body: { index_id_to_delete: indexID },
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public set(id: string): Index {
    return new Index(
      this.client,
      this.collectionID,
      id,
    )
  }
}

class HooksNamespace {
  private client: Client
  private collectionID: string

  constructor(client: Client, collectionID: string) {
    this.client = client
    this.collectionID = collectionID
  }

  public async insert(config: AddHookConfig, init?: ClientRequestInit): Promise<NewHookresponse> {
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

  public async list(init?: ClientRequestInit) {
    const res = await this.client.request<{ hooks: Record<Hook, string | null> }>({
      path: `/v1/collections/${this.collectionID}/hooks/list`,
      method: 'GET',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })

    return res.hooks || {}
  }

  public async delete(hook: Hook, init?: ClientRequestInit) {
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
}

class PinningRulesNamespace {
  private client: Client
  private collectionID: string
  private indexID: string

  constructor(client: Client, collectionID: string, indexID: string) {
    this.client = client
    this.collectionID = collectionID
    this.indexID = indexID
  }

  public insert(rule: PinningRuleInsertObject): Promise<{ success: boolean }> {
    if (!rule.id) {
      rule.id = createRandomString(32)
    }

    return this.client.request<{ success: true }>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/pin_rules/insert`,
      body: rule,
      method: 'POST',
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public update(rule: PinningRuleInsertObject): Promise<{ success: boolean }> {
    if (!rule.id) {
      rule.id = createRandomString(32)
    }

    return this.insert(rule)
  }

  public async list(): Promise<PinningRule[]> {
    const results = await this.client.request<{ data: PinningRule[] }>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/pin_rules/list`,
      method: 'GET',
      apiKeyPosition: 'header',
      target: 'writer',
    })

    return results.data
  }

  public listIDs(): Promise<string[]> {
    return this.client.request<string[]>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/pin_rules/ids`,
      method: 'GET',
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public delete(id: string): Promise<{ success: boolean }> {
    return this.client.request<{ success: true }>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/pin_rules/delete`,
      method: 'POST',
      body: {
        pin_rule_id_to_delete: id,
      },
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }
}

class LogsNamespace {
  private client: Client
  private collectionID: string

  constructor(client: Client, collectionID: string) {
    this.client = client
    this.collectionID = collectionID
  }

  public stream(init?: ClientRequestInit) {
    return this.client.eventSource({
      path: `/v1/collections/${this.collectionID}/logs`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }
}

class SystemPromptsNamespace {
  private client: Client
  private collectionID: string

  constructor(client: Client, collectionID: string) {
    this.client = client
    this.collectionID = collectionID
  }

  public insert(
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

  public get(id: string, init?: ClientRequestInit): Promise<{ system_prompt: SystemPrompt }> {
    return this.client.request<{ system_prompt: SystemPrompt }>({
      path: `/v1/collections/${this.collectionID}/system_prompts/get`,
      params: { system_prompt_id: id },
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public getAll(init?: ClientRequestInit): Promise<{ system_prompts: SystemPrompt[] }> {
    return this.client.request<{ system_prompts: SystemPrompt[] }>({
      path: `/v1/collections/${this.collectionID}/system_prompts/all`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public delete(id: string, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/system_prompts/delete`,
      body: { id },
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public update(systemPrompt: SystemPrompt, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/system_prompts/update`,
      body: systemPrompt,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public validate(
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
}

class ToolsNamespace {
  private client: Client
  private collectionID: string

  constructor(client: Client, collectionID: string) {
    this.client = client
    this.collectionID = collectionID
  }

  public insert(tool: InsertToolBody, init?: ClientRequestInit) {
    let parameters: string

    switch (true) {
      case typeof tool.parameters === 'string': {
        parameters = tool.parameters
        break
      }
      case tool.parameters instanceof ZodType: {
        const flattenedSchema = flattenZodSchema(tool.parameters as ZodType)
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

  public get(id: string, init?: ClientRequestInit): Promise<{ tool: Tool }> {
    return this.client.request<{ tool: Tool }>({
      path: `/v1/collections/${this.collectionID}/tools/get`,
      params: { tool_id: id },
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public getAll(init?: ClientRequestInit): Promise<{ tools: Tool[] }> {
    return this.client.request<{ tools: Tool[] }>({
      path: `/v1/collections/${this.collectionID}/tools/all`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  public delete(id: string, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/tools/delete`,
      body: { id },
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public update(tool: UpdateToolBody, init?: ClientRequestInit): Promise<{ success: boolean }> {
    return this.client.request<{ success: boolean }>({
      path: `/v1/collections/${this.collectionID}/tools/update`,
      body: tool,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public async execute<Response = AnyObject>(
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
}

class IdentityNamespace {
  private profile?: Profile

  constructor(profile?: Profile) {
    this.profile = profile
  }

  public get(): string | undefined {
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

class TrainingSetsNamespace {
  private client: Client
  private collectionID: string

  constructor(client: Client, collectionID: string) {
    this.client = client
    this.collectionID = collectionID
  }

  async get(trainingSetId: string, init?: ClientRequestInit): Promise<{ training_sets: TrainingSetQueryOptimizer }> {
    const response = await this.client.request<{ training_sets: Nullable<string> }>({
      path: `/v1/collections/${this.collectionID}/training_sets/${trainingSetId}/get`,
      method: 'GET',
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })

    const trainingSets = response.training_sets && JSON.parse(response.training_sets)
    return { training_sets: trainingSets }
  }

  generate(trainingSetId: string, LLMConfig?: LLMConfig, init?: ClientRequestInit): Promise<TrainingSetQueryOptimizer> {
    return this.client.request<TrainingSetQueryOptimizer>({
      path: `/v1/collections/${this.collectionID}/training_sets/${trainingSetId}/generate`,
      method: 'POST',
      body: {
        llm_config: LLMConfig ? { ...LLMConfig } : undefined,
      },
      init,
      apiKeyPosition: 'query-params',
      target: 'reader',
    })
  }

  insert(
    trainingSetId: string,
    trainingSet: TrainingSetInsertParameters,
    init?: ClientRequestInit,
  ): Promise<{ inserted: true }> {
    return this.client.request<{ inserted: true }>({
      path: `/v1/collections/${this.collectionID}/training_sets/${trainingSetId}/insert`,
      method: 'POST',
      body: {
        training_set: trainingSet,
      },
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  delete(trainingSetId: string, init?: ClientRequestInit): Promise<{ deleted: true }> {
    return this.client.request<{ deleted: true }>({
      path: `/v1/collections/${this.collectionID}/training_sets/${trainingSetId}/delete`,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }
}

export class Index {
  private indexID: string
  private collectionID: string
  private oramaInterface: Client
  public transaction: Transaction
  public pinningRules: PinningRulesNamespace

  constructor(oramaInterface: Client, collectionID: string, indexID: string) {
    this.indexID = indexID
    this.collectionID = collectionID
    this.oramaInterface = oramaInterface
    this.transaction = new Transaction(oramaInterface, collectionID, indexID)
    this.pinningRules = new PinningRulesNamespace(oramaInterface, collectionID, indexID)
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

  public async insertDocuments<T = AnyObject | AnyObject[]>(documents: T, init?: ClientRequestInit): Promise<void> {
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

  public async upsertDocuments<T = AnyObject[]>(documents: T, init?: ClientRequestInit): Promise<void> {
    await this.oramaInterface.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/upsert`,
      body: documents as AnyObject[],
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }
}

export class Transaction {
  private indexID: string
  private collectionID: string
  private tempIndexID: string
  private oramaInterface: Client

  constructor(oramaInterface: Client, collectionID: string, indexID: string, tempIndexID = createRandomString(16)) {
    this.oramaInterface = oramaInterface
    this.collectionID = collectionID
    this.indexID = indexID
    this.tempIndexID = tempIndexID
  }

  public open(init?: ClientRequestInit): Promise<void> {
    return this.oramaInterface.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.indexID}/create-temporary-index`,
      method: 'POST',
      body: {
        id: this.tempIndexID,
      },
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public insertDocuments(documents: AnyObject | AnyObject[], init?: ClientRequestInit): Promise<void> {
    return this.oramaInterface.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.tempIndexID}/insert`,
      body: Array.isArray(documents) ? documents : [documents],
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public commit(init?: ClientRequestInit): Promise<void> {
    return this.oramaInterface.request<void>({
      path: `/v1/collections/${this.collectionID}/replace-index`,
      method: 'POST',
      body: {
        target_index_id: this.indexID,
        temp_index_id: this.tempIndexID,
      },
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public rollback(init?: ClientRequestInit): Promise<void> {
    return this.oramaInterface.request<void>({
      path: `/v1/collections/${this.collectionID}/indexes/${this.tempIndexID}/delete`,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }
}
