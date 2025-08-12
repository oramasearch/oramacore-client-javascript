import type { AnyObject, SearchParams, SearchResult } from './lib/types.ts'
import type { Index } from './collection.ts'
import type { OramaCloudSearchParams } from './lib/types.ts'

import { CollectionManager } from './collection.ts'

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

  // Expose all namespaces from CollectionManager
  public identity: CollectionManager['identity']
  public ai: CollectionManager['ai']
  public collections: CollectionManager['collections']
  public index: CollectionManager['index']
  public hooks: CollectionManager['hooks']
  public logs: CollectionManager['logs']
  public systemPrompts: CollectionManager['systemPrompts']
  public tools: CollectionManager['tools']

  constructor(config: ProjectManagerConfig) {
    this.client = new CollectionManager({
      ...config,
      collectionID: config.projectId,
    })

    // Delegate to CollectionManager namespaces
    this.identity = this.client.identity
    this.ai = this.client.ai
    this.collections = this.client.collections
    this.index = this.client.index
    this.hooks = this.client.hooks
    this.logs = this.client.logs
    this.systemPrompts = this.client.systemPrompts
    this.tools = this.client.tools
  }

  search(params: OramaCloudSearchParams): Promise<SearchResult> {
    const { datasources, ...rest } = params
    return this.client.search({ ...rest, indexes: datasources })
  }

  dataSource(id: string) {
    const index = this.client.index.set(id)
    return new DataSourceNamespace(index)
  }
}

class DataSourceNamespace {
  private index: Index

  constructor(index: Index) {
    this.index = index
  }

  reindex(): Promise<void> {
    return this.index.reindex()
  }

  insertDocuments(documents: AnyObject | AnyObject[]): Promise<void> {
    return this.index.insertDocuments(documents)
  }

  deleteDocuments(documentIDs: string | string[]): Promise<void> {
    return this.index.deleteDocuments(documentIDs)
  }

  upsertDocuments(documents: AnyObject[]): Promise<void> {
    return this.index.upsertDocuments(documents)
  }
}
