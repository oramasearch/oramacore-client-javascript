import type { Nullable, Language, EmbeddingsConfig, AnyObject } from './lib/types'
import { OramaInterface } from './common'
import { createRandomString } from './lib/utils'

type OramaCoreManagerConfig = {
  url: string
  masterAPIKey: string
}

type CreateCollectionParams = {
  id: string
  description: Nullable<string>
  writeAPIKey?: Nullable<string>
  readAPIKey?: Nullable<string>
  language?: Nullable<Language>
  embeddings?: Nullable<EmbeddingsConfig>
}

type NewCollectionResponse = {
  id: string
  description: Nullable<string>
  writeAPIKey: string
  readonlyAPIKey: string
}

type GetCollectionsResponse = {
  id: string
  description: Nullable<string>
  document_count: number
  fields: AnyObject
}

export class OramaCoreManager {
  private url: string
  private masterAPIKey: string
  private oramaInterface: OramaInterface

  constructor(config: OramaCoreManagerConfig) {
    this.url = config.url
    this.masterAPIKey = config.masterAPIKey
    this.oramaInterface = new OramaInterface({
      baseURL: this.url,
      masterAPIKey: this.masterAPIKey,
      writeAPIKey: this.masterAPIKey,
      readAPIKey: this.masterAPIKey
    })
  }

  public async createCollection(config: CreateCollectionParams): Promise<NewCollectionResponse> {
    const body = {
      id: config.id,
      description: config.description,
      write_api_key: config.writeAPIKey ?? createRandomString(32),
      read_api_key: config.readAPIKey ?? createRandomString(32),
      embeddings: config.embeddings
    }

    await this.oramaInterface.request({
      url: '/v1/collections/create',
      body,
      method: 'POST',
      securityLevel: 'master'
    })

    return {
      id: body.id,
      description: body.description,
      writeAPIKey: body.write_api_key,
      readonlyAPIKey: body.read_api_key
    }
  }

  public listCollections(): Promise<GetCollectionsResponse[]> {
    return this.oramaInterface.request<GetCollectionsResponse[]>({
      url: '/v1/collections',
      method: 'GET',
      securityLevel: 'master'
    })
  }

  public getCollection(collectionID: string): Promise<GetCollectionsResponse> {
    return this.oramaInterface.request<GetCollectionsResponse>({
      url: `/v1/collections/${collectionID}`,
      method: 'GET',
      securityLevel: 'master'
    })
  }
}
