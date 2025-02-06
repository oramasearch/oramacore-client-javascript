import { OramaInterface } from './common.ts'
import type { AnyObject, Hook, Nullable, SearchParams, SearchResult } from './lib/types.ts'

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

  public async delete(documentIDs: string[]): Promise<void> {
    await this.oramaInterface.request({
      url: `/v1/collections/${this.collectionID}/delete`,
      body: { documentIDs },
      method: 'POST',
      securityLevel: 'write',
    })
  }

  public search<R = AnyObject>(query: SearchParams): Promise<SearchResult<R>> {
    return this.oramaInterface.request<SearchResult<R>>({
      url: `/v1/collections/${this.collectionID}/search`,
      body: query,
      method: 'POST',
      securityLevel: 'read',
    })
  }
}
