import type { AnyObject, EmbeddingsModel, Language, Maybe, Nullable } from './lib/types.ts'
import { OramaInterface } from './common.ts'
import { createRandomString } from './lib/utils.ts'

export type OramaCoreManagerConfig = {
  url: string
  masterAPIKey: string
}

export type CreateCollectionParams = {
  id: string
  description?: Nullable<string>
  writeAPIKey?: Nullable<string>
  readAPIKey?: Nullable<string>
  language?: Nullable<Language>
  embeddingsModel?: Nullable<EmbeddingsModel>
}

export type NewCollectionResponse = {
  id: string
  description?: Maybe<string>
  writeAPIKey: string
  readonlyAPIKey: string
}

export type CollectionIndexField = {
  field_id: string
  field_path: string
  is_array: boolean
  field_type: AnyObject
}

export type CollectionIndex = {
  id: string
  document_count: number
  fields: CollectionIndexField[]
  automatically_chosen_properties: AnyObject
}

export type GetCollectionsResponse = {
  id: string
  description: Maybe<string>
  document_count: number
  indexes: CollectionIndex[]
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
      readAPIKey: this.masterAPIKey,
    })
  }

  public async createCollection(config: CreateCollectionParams): Promise<NewCollectionResponse> {
    const body: AnyObject = {
      id: config.id,
      description: config.description,
      write_api_key: config.writeAPIKey ?? createRandomString(32),
      read_api_key: config.readAPIKey ?? createRandomString(32),
    }

    if (config.embeddingsModel) {
      body.embeddings_model = config.embeddingsModel
    }

    await this.oramaInterface.request({
      url: '/v1/collections/create',
      body,
      method: 'POST',
      securityLevel: 'master',
    })

    return {
      id: body.id,
      description: body.description,
      writeAPIKey: body.write_api_key,
      readonlyAPIKey: body.read_api_key,
    } as NewCollectionResponse
  }

  public listCollections(): Promise<GetCollectionsResponse[]> {
    return this.oramaInterface.request<GetCollectionsResponse[]>({
      url: '/v1/collections',
      method: 'GET',
      securityLevel: 'master',
    })
  }

  public getCollection(collectionID: string): Promise<GetCollectionsResponse> {
    return this.oramaInterface.request<GetCollectionsResponse>({
      url: `/v1/collections/${collectionID}`,
      method: 'GET',
      securityLevel: 'master',
    })
  }
}
