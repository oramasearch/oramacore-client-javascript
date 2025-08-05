import type {
  AnyObject,
  Maybe,
  NLPSearchResult,
  NLPSearchStreamResult,
  SearchParams,
  SearchResult,
} from './lib/types.ts'
import type { NLPSearchParams } from './collection.ts'
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

  constructor(config: ProjectManagerConfig) {
    this.client = new CollectionManager({
      ...config,
      collectionID: config.projectId,
    })
  }

  search(params: OramaCloudSearchParams): Promise<SearchResult> {
    const { datasources, ...rest } = params
    return this.client.search({ ...rest, indexes: datasources })
  }

  dataSource(id: string) {
    const index = this.client.setIndex(id)

    return {
      reindex() {
        return index.reindex()
      },
      insertDocuments(documents: AnyObject | AnyObject[]) {
        return index.insertDocuments(documents)
      },
      deleteDocuments(documentIDs: string | string[]) {
        return index.deleteDocuments(documentIDs)
      },
      upsertDocuments(documents: AnyObject[]) {
        return index.upsertDocuments(documents)
      },
    }
  }

  get ai() {
    const client = this.client
    return {
      NLPSearch(params: NLPSearchParams): Promise<NLPSearchResult<AnyObject>[]> {
        return client.NLPSearch(params)
      },
      NLPSearchStream<R = AnyObject>(params: NLPSearchParams): AsyncGenerator<NLPSearchStreamResult<R>, void, unknown> {
        return client.NLPSearchStream(params)
      },
      createAISession(config: CreateAISessionConfig): OramaCoreStream {
        return client.createAISession(config)
      },
    }
  }

  get identity() {
    const client = this.client
    return {
      getIdentity(): Maybe<string> {
        return client.getIdentity()
      },
      getUserId(): Maybe<string> {
        return client.getUserId()
      },
      identify(userId: string): Promise<void> {
        return client.identify(userId)
      },
      alias(alias: string): Promise<void> {
        return client.alias(alias)
      },
      reset() {
        return client.reset()
      },
    }
  }
}
