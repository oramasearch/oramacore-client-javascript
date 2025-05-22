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
  transactionID: string
}

export type InsertResponse = {
  docsToInsert: number
}

export class CloudManager {
  private url: string
  private collectionID: string
  private privateAPIKey: string
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

    // TODO: Check this, probably we don't need to return a new Transaction instance when calling the getOpenTransaction, but just retrun the current one if exists or null
    // return new Transaction({
    //   collectionID: this.collectionID,
    //   privateAPIKey: this.privateAPIKey,
    //   url: this.url,
    //   datasourceID: this.datasourceID,
    // })
  }

  async getTransactionID(): Promise<Nullable<string>> {
    await this.checkTransaction()

    return this.transactionID
  }

  // TODO: Do we really need this? Double check if we can remove it or we still need to call the /start-transaction endpoint
  // public async startTransaction(): Promise<void> {
  //   if (!this.transaction) {
  //     if (!this.defaultDataSource) {
  //       throw new Error(
  //         'No datasource ID set. Use defaultDataSource in the constructor to set a default datasource ID.',
  //       )
  //     } else {
  //       this.setDataSource(this.defaultDataSource)
  //     }
  //     return
  //   }

  //   await this.transaction.startTransaction()
  // }

  // TODO: as we're using the setDataSource method to return a transaction with a specific datasourceID, we might not need this on CloudManager class, but only on Transaction class
  // public insertDocuments(data: object[] | object): Promise<InsertResponse> {
  //   return request<InsertResponse>(
  //     `/api/v2/direct/${this.collectionID}/${this.datasourceID}/insert`,
  //     data,
  //     this.privateAPIKey,
  //     this.url,
  //   )
  // }

  // TODO: Double check if we need this, or we can just keep the insertDocuments method
  // Updates in OramaCore are actually upserts
  // public upsertDocuments(data: object[] | object): Promise<InsertResponse> {
  //   return this.insertDocuments(data)
  // }

  // TODO: as we're using the setDataSource method to return a transaction with a specific datasourceID, we might not need this on CloudManager class, but only on Transaction class
  // public deleteDocuments(documents: string[]): Promise<void> {
  //   return request<void>(
  //     `/api/v2/direct/${this.collectionID}/${this.datasourceID}/delete`,
  //     documents,
  //     this.privateAPIKey,
  //     this.url,
  //   )
  // }

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

  // TODO: What are the cased we need to call this method? Double check if the users need to start a transaction manually or if we can just call the checkTransaction method to get the current transaction
  // async startTransaction(): Promise<Transaction> {
  //   const response = await request<StartTransactionResponse>(
  //     `/api/v2/collection/${this.collectionID}/${this.datasourceID}/start-transaction`,
  //     {},
  //     this.privateAPIKey,
  //     this.url,
  //   )

  //   this.transactionID = response.transactionID
  //   return this
  // }

  // TODO: there is no reference to the datasourceID, does it delete all documents in the collection?
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
    // TODO: double check if we need to create a new transaction if one doesn't exist
    if (!await this.transactionExists()) {
      throw new Error('No open transaction to insert documents.')
    }

    const formattedData = Array.isArray(data) ? data : [data]
    await request<void>(
      `/api/v2/direct/${this.collectionID}/${this.transactionID}/insert`,
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
    // TODO: double check if we need to create a new transaction if one doesn't exist
    if (!await this.transactionExists()) {
      throw new Error('No open transaction to delete documents.')
    }

    await request<void>(
      `/api/v2/direct/${this.collectionID}/${this.transactionID}/delete`,
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
