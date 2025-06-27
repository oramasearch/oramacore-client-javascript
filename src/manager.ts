import type { AnyObject, EmbeddingsModel, Language, Maybe, Nullable } from './lib/types.ts'
import { Auth, Client, ClientRequestInit } from './common.ts'
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
  private client: Client

  constructor(config: OramaCoreManagerConfig) {
    this.client = new Client({
      auth: new Auth({
        type: 'apiKey',
        apiKey: config.masterAPIKey,
        writerURL: config.url,
        readerURL: undefined,
      }),
    })
  }

  public async createCollection(
    config: CreateCollectionParams,
    init?: ClientRequestInit,
  ): Promise<NewCollectionResponse> {
    const body: AnyObject = {
      id: config.id,
      description: config.description,
      write_api_key: config.writeAPIKey ?? createRandomString(32),
      read_api_key: config.readAPIKey ?? createRandomString(32),
    }

    if (config.embeddingsModel) {
      body.embeddings_model = config.embeddingsModel
    }

    await this.client.request({
      path: '/v1/collections/create',
      body,
      method: 'POST',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })

    return {
      id: body.id,
      description: body.description,
      writeAPIKey: body.write_api_key,
      readonlyAPIKey: body.read_api_key,
    } as NewCollectionResponse
  }

  public listCollections(init?: ClientRequestInit): Promise<GetCollectionsResponse[]> {
    return this.client.request<GetCollectionsResponse[]>({
      path: '/v1/collections',
      method: 'GET',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public getCollection(collectionID: string, init?: ClientRequestInit): Promise<GetCollectionsResponse> {
    return this.client.request<GetCollectionsResponse>({
      path: `/v1/collections/${collectionID}`,
      method: 'GET',
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }

  public deleteCollection(collectionID: string, init?: ClientRequestInit): Promise<null> {
    return this.client.request<null>({
      path: `/v1/collections/delete`,
      method: 'POST',
      body: {
        collection_id_to_delete: collectionID,
      },
      init,
      apiKeyPosition: 'header',
      target: 'writer',
    })
  }
}
