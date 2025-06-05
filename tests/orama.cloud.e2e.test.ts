import 'jsr:@std/dotenv/load'
import { expect } from "jsr:@std/expect";
import { CloudManager } from '../src/cloud.ts'

const managerURL = Deno.env.get('ORAMA_CLOUD_URL')
const collectionID = Deno.env.get('ORAMA_CLOUD_COLLECTION_ID')
const datasourceID = Deno.env.get('ORAMA_CLOUD_DATASOURCE_ID')
const privateAPIKey = Deno.env.get('ORAMA_CLOUD_PRIVATE_API_KEY')

if (!managerURL || !collectionID || !datasourceID || !privateAPIKey) {
  console.log('Not running cloud tests, missing environment variables')
} else {
  Deno.test('CloudManager - setDataSource', async () => {
    const cloudManager = new CloudManager({
      url: managerURL!,
      collectionID: collectionID!,
      privateAPIKey: privateAPIKey!,
    })
    
    const datasource = cloudManager.setDataSource(datasourceID!)

    expect(datasource).toBeDefined()
    expect(datasource).toHaveProperty('datasourceID', datasourceID)
  })
}
