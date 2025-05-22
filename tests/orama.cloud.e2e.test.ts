import 'jsr:@std/dotenv/load'
import { CloudManager } from '../src/cloud.ts'

const managerURL = Deno.env.get('ORAMA_CLOUD_URL')
const collectionID = Deno.env.get('ORAMA_CLOUD_COLLECTION_ID')
const datasourceID = Deno.env.get('ORAMA_CLOUD_DATASOURCE_ID')
const privateAPIKey = Deno.env.get('ORAMA_CLOUD_PRIVATE_API_KEY')

if (!managerURL || !collectionID || !datasourceID || !privateAPIKey) {
  console.log('Not running cloud tests, missing environment variables')
} else {
  Deno.test('CloudManager - setDataSource and get open transaction', async () => {
    const cloudManager = new CloudManager({
      url: managerURL!,
      collectionID: collectionID!,
      privateAPIKey: privateAPIKey!,
    })

    // Set the data source
    const mydatasource = cloudManager.setDataSource(datasourceID!)

    console.log('Datasource ID:', mydatasource, typeof mydatasource)

    // Insert documents into the specified data source
    const documents = await mydatasource.insertDocuments([
      {
          "id": "123",
          "title": "Orama",
          "description": "Orama is a powerful search engine that enables fast and accurate full-text search capabilities. It's designed to be easy to use while providing advanced features for developers.",
      },
      {
          "id": "456",
          "title": "Orama Cloud",
          "description": "Orama provides both cloud and self-hosted solutions, making it flexible for different deployment needs. It supports multiple programming languages and frameworks.",
      }
    ])

    console.log('Inserted documents:', documents)

    // Delete documents from the specified data source
    await mydatasource.deleteDocuments(["123"])

    // To delete all documents, you can use the following line:
    // Start a transaction
    await mydatasource.startTransaction()

    await mydatasource.deleteAllDocuments()

    // Close the transaction
    await mydatasource.commit()

    // Rollback the transaction
    await mydatasource.rollbackTransaction()

    // Check if there's an open transaction
    const hasOpenTransaction = await cloudManager.hasOpenTransaction()

    if (hasOpenTransaction) {
      throw new Error('Transaction should not be open')
    }

    // Get the full transaction
    const transaction = await cloudManager.getOpenTransaction()

    // Get the transaction ID of the current transaction
    const transactionID = await cloudManager.getTransactionID()

    if (transactionID === null) {
      throw new Error('Transaction should be null')
    }
  })
}
