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

    await cloudManager.setDataSource(datasourceID!)

    const hasOpenTransaction = await cloudManager.hasOpenTransaction()

    if (hasOpenTransaction) {
      throw new Error('Transaction should not be open')
    }

    const transactionID = await cloudManager.getTransactionID()

    if (transactionID === null) {
      throw new Error('Transaction should be null')
    }
  })
}
