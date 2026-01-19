import type { AnyObject, SearchResult } from './lib/types.ts'
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
  public shelves: CollectionManager['shelves']
  public pinningRules: CollectionManager['pinningRules']

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
    this.shelves = this.client.shelves
    this.pinningRules = this.client.pinningRules
  }

  search(params: OramaCloudSearchParams): Promise<SearchResult> {
    const { datasources, ...rest } = params
    return this.client.search({ ...rest, indexes: datasources })
  }

  dataSource(id: string): DataSourceNamespace {
    const index = this.client.index.set(id)
    return new DataSourceNamespace(
      index,
      this.client,
      undefined,
    )
  }
}

class DataSourceNamespace {
  private index: Index

  constructor(
    index: Index,
    private client: CollectionManager,
    private originalRuntimeIndexId?: string,
  ) {
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

  async createTemporaryIndex(): Promise<DataSourceNamespace> {
    if (this.originalRuntimeIndexId) {
      throw new Error('Cannot create a temporary index from a temporary index')
    }

    const runtimeIndexID = this.index.getIndexID()

    const temp_index_id = await this.index.createTemporaryIndex()

    const index = this.client.index.set(temp_index_id)
    return new DataSourceNamespace(
      index,
      this.client,
      runtimeIndexID,
    )
  }

  async swap(): Promise<void> {
    if (!this.originalRuntimeIndexId) {
      throw new Error('Cannot swap a non-temporary index')
    }
    const tempIndexId = this.index.getIndexID()

    if (tempIndexId === this.originalRuntimeIndexId) {
      throw new Error('Cannot swap the same index')
    }

    await this.index.swapTemporaryIndex(
      this.originalRuntimeIndexId,
      tempIndexId,
    )
  }
}
