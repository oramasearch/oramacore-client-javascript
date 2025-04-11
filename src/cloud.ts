import type { Nullable } from './lib/types.ts'

export type CloudManagerConfig = {
  url: string
  collectionID: string
  privateAPIKey: string
  defaultIndex?: string
}

export type GetTransactionResponse = {
  transactionID: Nullable<string>
}

export type StartTransactionResponse = {
  transactionID: string
}

export type InsertResponse = {
  docsToInsert: number
}

export class CloudManager {
  private url: string
  private collectionID: string
  private privateAPIKey: string
  private index: Nullable<string>
  private transactionID: Nullable<string> = null

  constructor(config: CloudManagerConfig) {
    this.url = config.url
    this.collectionID = config.collectionID
    this.privateAPIKey = config.privateAPIKey
    this.index = config.defaultIndex ?? null
  }

  async setIndex(id: string) {
    const isTransactionOpen = await this.checkTransaction()

    if (isTransactionOpen.transactionID) {
      this.transactionID = isTransactionOpen.transactionID
    }

    if (this.transactionID) {
      throw new Error('Cannot set index while inside a transaction')
    }

    this.index = id
  }

  async startTransaction(): Promise<StartTransactionResponse> {
    const response = await this.request<StartTransactionResponse>(
      `/api/v2/collection/${this.collectionID}/start-transaction`,
    )

    this.transactionID = response.transactionID

    return response
  }

  async insert(data: object[] | object): Promise<InsertResponse> {
    this.ensureIndexExists('inserting data')
    await this.ensureTransactionExists()

    const formattedData = Array.isArray(data) ? data : [data]
    return this.request<InsertResponse>(`/api/v2/transaction/${this.transactionID}/insert`, formattedData)
  }

  async delete(documents: string[]): Promise<void> {
    this.ensureIndexExists('deleting data')
    await this.ensureTransactionExists()

    return this.request<void>(`/api/v2/transaction/${this.transactionID}/delete`, documents)
  }

  clear(): Promise<void> {
    return this.request<void>(`/api/v2/collection/${this.collectionID}/clear`)
  }

  commit(): Promise<void> {
    this.ensureTransactionExists(false)
    return this.request<void>(`/api/v2/transaction/${this.transactionID}/commit`)
  }

  private async checkTransaction(): Promise<GetTransactionResponse> {
    const response = await this.request<GetTransactionResponse>(
      `/api/v2/collection/${this.collectionID}/get-open-transaction`,
      undefined,
      'GET',
    )

    if (response.transactionID) {
      this.transactionID = response.transactionID
    }

    return response
  }

  private ensureIndexExists(operation: string): void {
    if (!this.index) {
      throw new Error(`No index set. Please set an index before ${operation}.`)
    }
  }

  private async ensureTransactionExists(checkExisting: boolean = true): Promise<void> {
    if (!this.transactionID && checkExisting) {
      await this.checkTransaction()
    }

    if (!this.transactionID) {
      throw new Error('No active transaction found. Please start a transaction first.')
    }
  }

  private async request<R = unknown>(path: string, body = {}, method = 'POST'): Promise<R> {
    const reqParams: Partial<RequestInit> = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `x-api-key ${this.privateAPIKey}`,
      },
    }

    const reqURL = new URL(path, this.url)

    if (method === 'GET') {
      for (const key in body) {
        reqURL.searchParams.append(key, JSON.stringify((body as any)[key]))
      }
    }

    if (method === 'POST') {
      reqParams.body = JSON.stringify(body)
    }

    const resp = await fetch(reqURL.toString(), reqParams)

    if (!resp.ok) {
      const errorText = await resp.text()
      throw new Error(`Request failed: ${resp.status} ${errorText}`)
    }

    const respBody = await resp.json()

    if (respBody.error) {
      throw new Error(`Request failed: ${respBody.error}`)
    }

    return respBody as R
  }
}
