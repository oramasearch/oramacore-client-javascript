import type { Nullable } from './lib/types.ts'

export type CloudManagerConfig = {
  url: string
  collectionID: string
  privateAPIKey: string
}

export type GetTransactionResponse = {
  transactionId: Nullable<string>
}

export type StartTransactionResponse = {
  transactionId: string
}

export type InsertResponse = {
  docsToInsert: number
}

export class CloudManager {
  private readonly url: string
  private readonly collectionID: string
  private readonly privateAPIKey: string
  private datasourceID: Nullable<string> = null
  private transactionID: Nullable<string> = null

  constructor(config: CloudManagerConfig) {
    this.url = config.url
    this.collectionID = config.collectionID
    this.privateAPIKey = config.privateAPIKey
  }

  public setDataSource(id: string): Transaction {
    this.datasourceID = id

    const transaction = new Transaction({
      collectionID: this.collectionID,
      privateAPIKey: this.privateAPIKey,
      url: this.url,
      datasourceID: id,
    })

    return transaction
  }

  async hasOpenTransaction(): Promise<boolean> {
    const response = await this.checkTransaction()
    return response.transactionId !== null
  }

  async getOpenTransaction(): Promise<Transaction | null> {
    const response = await this.checkTransaction()

    if (response.transactionId) {
      this.transactionID = response.transactionId
      return response as unknown as Transaction
    }

    return null
  }

  async getTransactionID(): Promise<Nullable<string>> {
    await this.checkTransaction()

    return this.transactionID
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

  async deleteAllDocuments(): Promise<Transaction> {
    // Check datasourceID is set
    if (!this.datasourceID) {
      throw new Error('No datasource ID set. Use setDataSource to set a datasource ID.')
    }

    // Check we don't have an open transaction before starting a new one
    if (await this.transactionExists()) {
      throw new Error('A transaction is already open. Use rollbackTransaction to rollback the transaction.')
    }

    // Start a new transaction
    await this.startTransaction()

    await request<void>(
      `/api/v2/transaction/${this.transactionID}/clear`,
      {},
      this.privateAPIKey,
      this.url,
    )

    // Commit the transaction
    await this.commit()

    return this
  }

  async insertDocuments(data: object[] | object): Promise<Transaction> {
    if (!this.datasourceID) {
      throw new Error('No datasource ID set. Use setDataSource to set a datasource ID.')
    }

    const formattedData = Array.isArray(data) ? data : [data]
    await request<void>(
      `/api/v2/direct/${this.collectionID}/${this.datasourceID}/insert`,
      formattedData,
      this.privateAPIKey,
      this.url,
    )

    return this
  }

  // TODO: Double check if we need this, or we can just keep the insertDocuments method
  // async updateDocuments(data: object[] | object): Promise<Transaction> {
  //   if (!await this.transactionExists()) {
  //     throw new Error('No open transaction to update documents.')
  //   }
  //   const formattedData = Array.isArray(data) ? data : [data]
  //   await request<void>(
  //     `/api/v2/transaction/${this.transactionID}/insert`, // "insert" is actually an "upsert" operation in the context of transactions
  //     formattedData,
  //     this.privateAPIKey,
  //     this.url,
  //   )
  //   return this
  // }

  async deleteDocuments(documents: string[]): Promise<Transaction> {
    if (!this.datasourceID) {
      throw new Error('No datasource ID set. Use setDataSource to set a datasource ID.')
    }
    await request<void>(
      `/api/v2/direct/${this.collectionID}/${this.datasourceID}/delete`,
      documents,
      this.privateAPIKey,
      this.url,
    )

    return this
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

  private async startTransaction(): Promise<Transaction> {
    if (!this.datasourceID) {
      throw new Error('No datasource ID set. Use setDataSource to set a datasource ID.')
    }

    const response = await request<StartTransactionResponse>(
      `/api/v2/collection/${this.collectionID}/${this.datasourceID}/start-transaction`,
      {},
      this.privateAPIKey,
      this.url,
    )

    this.transactionID = response.transactionId
    return this
  }

  private async commit(): Promise<void> {
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

  const respText = await resp.text()

  if (!respText) {
    return null as R
  }

  let respBody: any
  try {
    respBody = JSON.parse(respText)
  } catch (error) {
    throw new Error(`Invalid JSON Error: ${error}`)
  }

  if (respBody?.error) {
    throw new Error(`Request failed: ${respBody.error}`)
  }

  return respBody as R
}
