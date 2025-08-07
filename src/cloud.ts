import type {
  AnyObject,
  Maybe,
  NLPSearchResult,
  NLPSearchStreamResult,
  SearchParams,
  SearchResult,
} from './lib/types.ts'
import type { Index, NLPSearchParams } from './collection.ts'
import type { CreateAISessionConfig, OramaCoreStream } from './stream-manager.ts'

import { CollectionManager } from './collection.ts'

type OramaCloudSearchParams = Omit<SearchParams, 'indexes'> & { datasources: string[] }

export interface ProjectManagerConfig {
  cluster?: {
    writerURL?: string
    readURL?: string
  }
  projectId: string
  apiKey: string
  authJwtURL?: string
}

export class OramaCloud {
  private client: CollectionManager

  public identity: IdentityNamespace
  public ai: AINamespace

  constructor(config: ProjectManagerConfig) {
    this.client = new CollectionManager({
      ...config,
      collectionID: config.projectId,
    })
    this.identity = new IdentityNamespace(this.client)
    this.ai = new AINamespace(this.client)
  }

  search(params: OramaCloudSearchParams): Promise<SearchResult> {
    const { datasources, ...rest } = params
    return this.client.search({ ...rest, indexes: datasources })
  }

  dataSource(id: string) {
    const index = this.client.setIndex(id)
    return new DataSourceNamespace(index)
  }
}

class DataSourceNamespace {
  private index: Index

  constructor(index: Index) {
    this.index = index
  }

  reindex(): Promise<Index> {
    return this.index.reindex()
  }
  insertDocuments(documents: AnyObject | AnyObject[]): Promise<Index> {
    return this.index.insertDocuments(documents)
  }
  deleteDocuments(documentIDs: string | string[]): Promise<Index> {
    return this.index.deleteDocuments(documentIDs)
  }
  upsertDocuments(documents: AnyObject[]): Promise<Index> {
    return this.index.upsertDocuments(documents)
  }
}

class IdentityNamespace {
  private client: CollectionManager

  constructor(client: CollectionManager) {
    this.client = client
  }

  getIdentity(): Maybe<string> {
    return this.client.getIdentity()
  }

  getUserId(): Maybe<string> {
    return this.client.getUserId()
  }

  identify(userId: string): Promise<void> {
    return this.client.identify(userId)
  }

  alias(alias: string): Promise<void> {
    return this.client.alias(alias)
  }

  reset() {
    return this.client.reset()
  }
}

class AINamespace {
  private client: CollectionManager

  constructor(client: CollectionManager) {
    this.client = client
  }

  NLPSearch(params: NLPSearchParams): Promise<NLPSearchResult<AnyObject>[]> {
    return this.client.NLPSearch(params)
  }

  NLPSearchStream<R = AnyObject>(params: NLPSearchParams): AsyncGenerator<NLPSearchStreamResult<R>, void, unknown> {
    return this.client.NLPSearchStream(params)
  }

  createAISession(config: CreateAISessionConfig): OramaCoreStream {
    return this.client.createAISession(config)
  }
}
