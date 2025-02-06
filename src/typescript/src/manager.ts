import type { Nullable, Language, EmbeddingsConfig, Hook } from './lib/types'
import { OramaInterface } from './common'
import { createRandomString } from './lib/utils'

type OramaCoreManagerConfig = {
  url: string
  masterAPIKey: string
}

type CreateCollectionParams = {
  id: string
  description: Nullable<string>
  writeAPIKey: Nullable<string>
  readAPIKey: Nullable<string>
  language: Nullable<Language>
  embeddings: Nullable<EmbeddingsConfig>
}

type NewCollectionResponse = {
  id: string
  description: Nullable<string>
  writeAPIKey: string
  readonlyAPIKey: string
}

type AddHookConfig = {
  hookID: Hook
  collectionID: string
  code: string
}

type NewHookresponse = {
  hookID: string
  collectionID: string
  code: string
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
      url: '/v1/collections',
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

  public async addHook(config: AddHookConfig): Promise<NewHookresponse> {
    const body = {
      id: config.hookID,
      code: config.code
    }

    await this.oramaInterface.request({
      url: `/v1/collections/${config.collectionID}/hooks/add`,
      body,
      method: 'POST',
      securityLevel: 'master'
    })

    return {
      hookID: body.id,
      collectionID: config.collectionID,
      code: body.code
    }
  }
}
