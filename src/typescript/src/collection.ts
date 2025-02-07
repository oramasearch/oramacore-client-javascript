import { OramaInterface } from './common.ts'
import type { AnyObject, Hook, Nullable, SearchParams, SearchResult } from './lib/types.ts'
import { formatDuration } from './lib/utils.ts'
import { AnswerSession } from './answer-session.ts'

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

  public createAnswerSession(): AnswerSession {
    if (!this.readAPIKey) {
      throw new Error('Read API key is required to create an answer session')
    }

    return new AnswerSession({
      url: this.url,
      readAPIKey: this.readAPIKey || '',
      collectionID: this.collectionID,
    })
  }
}
