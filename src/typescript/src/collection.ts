import { OramaInterface } from './common.ts'
import type {
  AnyObject,
  Hook,
  InsertSegmentBody,
  InsertSegmentResponse,
  InsertTriggerBody,
  Nullable,
  SearchParams,
  SearchResult,
  Segment,
  Trigger,
} from './lib/types.ts'
import { formatDuration } from './lib/utils.ts'
import { AnswerSession, type Interaction, type Message } from './answer-session.ts'
import type { InsertTriggerResponse, UpdateTriggerResponse } from './index.ts'

export type CollectionManagerConfig = {
  url: string
  collectionID: string
  writeAPIKey: Nullable<string>
  readAPIKey: Nullable<string>
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

export type CreateAnswerSessionConfig = {
  initialMessages?: Message[]
  events?: {
    onStateChange: (state: Interaction[]) => void
  }
}

export class CollectionManager {
  private url: string
  private collectionID: string
  private writeAPIKey: Nullable<string>
  private readAPIKey: Nullable<string>
  private oramaInterface: OramaInterface

  constructor(config: CollectionManagerConfig) {
    this.url = config.url
    this.writeAPIKey = config.writeAPIKey
    this.readAPIKey = config.readAPIKey
    this.collectionID = config.collectionID
    this.oramaInterface = new OramaInterface({
      baseURL: this.url,
      masterAPIKey: null,
      writeAPIKey: this.writeAPIKey || null,
      readAPIKey: this.readAPIKey || null,
    })
  }

  public async insert(documents: AnyObject[] | AnyObject): Promise<void> {
    if (!Array.isArray(documents)) {
      documents = [documents]
    }

    await this.oramaInterface.request<void, AnyObject[]>({
      url: `/v1/collections/${this.collectionID}/insert`,
      body: documents,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public async delete(documentIDs: string[] | string): Promise<void> {
    if (!Array.isArray(documentIDs)) {
      documentIDs = [documentIDs]
    }

    await this.oramaInterface.request({
      url: `/v1/collections/${this.collectionID}/delete`,
      body: documentIDs,
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public async search<R = AnyObject>(query: SearchParams): Promise<SearchResult<R>> {
    const start = +new Date()

    const result = await this.oramaInterface.request<Omit<SearchResult<R>, 'elapsed'>>({
      url: `/v1/collections/${this.collectionID}/search`,
      body: query,
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

  public async addHook(config: AddHookConfig): Promise<NewHookresponse> {
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
}
