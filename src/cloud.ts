import type { AnyObject, Maybe, NLPSearchResult, NLPSearchStreamResult, SearchParams, SearchResult } from './lib/types'
import type { NLPSearchParams } from './collection'
import type { CreateAISessionConfig, OramaCoreStream } from './stream-manager'

import { CollectionManager } from './collection'

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

  async search(params: OramaCloudSearchParams): Promise<SearchResult> {
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
    return {
      async NLPSearch(params: NLPSearchParams): Promise<NLPSearchResult<AnyObject>[]> {
        return this.client.NLPSearch(params)
      },
      NLPSearchStream<R = AnyObject>(params: NLPSearchParams): AsyncGenerator<NLPSearchStreamResult<R>, void, unknown> {
        return this.client.NLPSearchStream(params)
      },
      createAISession(config: CreateAISessionConfig): OramaCoreStream {
        return this.client.createAISession(config)
      },
    }
  }

  get identity() {
    return {
      getIdentity(): Maybe<string> {
        return this.client.getIdentity()
      },
      getUserId(): Maybe<string> {
        return this.client.getUserId()
      },
      identify(userId: string): Promise<void> {
        return this.client.identify(userId)
      },
      alias(alias: string): Promise<void> {
        return this.client.alias(alias)
      },
      reset(): Promise<void> {
        return this.client.reset()
      },
    }
  }
}
