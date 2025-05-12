import type { Nullable } from './lib/types.ts'

export type CloudManagerConfig = {
  url: string
  collectionID: string
  privateAPIKey: string
  defaultIndex?: string
}

export type GetTransactionResponse = {
  transactionId: Nullable<string>
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
  private datasourceID: Nullable<string>
  private transactionID: Nullable<string> = null

  constructor(config: CloudManagerConfig) {
    this.url = config.url
    this.collectionID = config.collectionID
    this.privateAPIKey = config.privateAPIKey
    this.datasourceID = config.defaultIndex ?? null
  }

  async setDataSource(id: string) {
    this.datasourceID = id

    this.newTransaction()
  }

  async hasOpenTransaction(): Promise<boolean> {
    const response = await this.checkTransaction()
    return response.transactionId !== null
  }

  async getOpenTransaction(): Promise<Transaction> {
    const response = await this.checkTransaction()

    if (response.transactionId) {
      this.transactionID = response.transactionId
    }

    return new Transaction({
      collectionID: this.collectionID,
      privateAPIKey: this.privateAPIKey,
      url: this.url,
      datasourceID: this.datasourceID,
    })
  }

  async getTransactionID(): Promise<Nullable<string>> {
    await this.checkTransaction()

    return this.transactionID
  }

  async newTransaction(): Promise<Transaction> {
    if (!this.datasourceID) {
      throw new Error('No datasource ID set. Use setDataSource() to set a datasource ID.')
    }

    const transaction = new Transaction({
      collectionID: this.collectionID,
      privateAPIKey: this.privateAPIKey,
      url: this.url,
      datasourceID: this.datasourceID,
    })

    await transaction.startTransaction()

    return transaction
  }

  private async checkTransaction(): Promise<GetTransactionResponse> {
    const response = await request<GetTransactionResponse>(
      `/api/v2/collection/${this.collectionID}/${this.datasourceID}/get-open-transaction`,
      {},
      this.privateAPIKey,
      this.url,
      'GET',
    )

    if (response.transactionId) {
      this.transactionID = response.transactionId
    }

    return response
  }
}

type TransactionConfig = {
  collectionID: string
  privateAPIKey: string
  url: string
  datasourceID: Nullable<string>
}

class Transaction {
  private transactionID: Nullable<string> = null
  private collectionID: string
  private privateAPIKey: string
  private url: string
  private datasourceID: Nullable<string>

  constructor(config: TransactionConfig) {
    this.collectionID = config.collectionID
    this.privateAPIKey = config.privateAPIKey
    this.url = config.url
    this.datasourceID = config.datasourceID
  }

  async startTransaction(): Promise<Transaction> {
    const response = await request<StartTransactionResponse>(
      `/api/v2/collection/${this.collectionID}/${this.datasourceID}/start-transaction`,
      {},
      this.privateAPIKey,
      this.url,
    )

    this.transactionID = response.transactionID
    return this
  }

  async deleteAllDocuments(): Promise<Transaction> {
    if (!await this.transactionExists()) {
      throw new Error('No open transaction to clean index.')
    }

    await request<void>(
      `/api/v2/transaction/${this.transactionID}/clear`,
      {},
      this.privateAPIKey,
      this.url,
    )

    return this
  }

  async insertDocuments(data: object[] | object): Promise<Transaction> {
    if (!await this.transactionExists()) {
      throw new Error('No open transaction to insert documents.')
    }

    const formattedData = Array.isArray(data) ? data : [data]
    await request<void>(
      `/api/v2/transaction/${this.transactionID}/insert`,
      formattedData,
      this.privateAPIKey,
      this.url,
    )

    return this
  }

  async updateDocuments(data: object[] | object): Promise<Transaction> {
    if (!await this.transactionExists()) {
      throw new Error('No open transaction to update documents.')
    }

    const formattedData = Array.isArray(data) ? data : [data]
    await request<void>(
      `/api/v2/transaction/${this.transactionID}/insert`, // "insert" is actually an "upsert" operation in the context of transactions
      formattedData,
      this.privateAPIKey,
      this.url,
    )
    return this
  }

  async deleteDocuments(documents: string[]): Promise<Transaction> {
    if (!await this.transactionExists()) {
      throw new Error('No open transaction to delete documents.')
    }

    await request<void>(
      `/api/v2/transaction/${this.transactionID}/delete`,
      documents,
      this.privateAPIKey,
      this.url,
    )

    return this
  }

  async commit(): Promise<void> {
    if (!await this.transactionExists()) {
      throw new Error('No open transaction to commit.')
    }

    await request<void>(
      `/api/v2/transaction/${this.transactionID}/commit`,
      {},
      this.privateAPIKey,
      this.url,
    )
  }

  async rollbackTransaction(): Promise<void> {
    if (!await this.transactionExists()) {
      throw new Error('No open transaction to rollback.')
    }

    await request<void>(
      `/api/v2/transaction/${this.transactionID}/rollback`,
      {},
      this.privateAPIKey,
      this.url,
    )
  }

  private async transactionExists(): Promise<boolean> {
    if (!this.transactionID) {
      const response = await this.checkTransaction()
      return response.transactionId !== null
    }

    return !!this.transactionID
  }

  private async checkTransaction(): Promise<GetTransactionResponse> {
    const response = await request<GetTransactionResponse>(
      `/api/v2/collection/${this.collectionID}/${this.datasourceID}/get-open-transaction`,
      {},
      this.privateAPIKey,
      this.url,
      'GET',
    )

    if (response.transactionId) {
      this.transactionID = response.transactionId
    }

    return response
  }
}

async function request<R = unknown>(path: string, body = {}, apiKey: string, url: string, method = 'POST'): Promise<R> {
  const reqParams: Partial<RequestInit> = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
  }

  const reqURL = new URL(path, url)

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
    throw new Error(`Request failed with status ${resp.status}. ${errorText}`)
  }

  const respBody = await resp.json()

  if (respBody.error) {
    throw new Error(`Request failed: ${respBody.error}`)
  }

  return respBody as R
}
