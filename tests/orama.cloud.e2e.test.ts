import 'jsr:@std/dotenv/load'
import {expect} from 'jsr:@std/expect';
import { expect } from 'jsr:@std/expect'
import {CloudManager, CollectionManager} from '../src/index.ts'

const managerURL = Deno.env.get('ORAMA_CLOUD_URL')
const collectionID = Deno.env.get('ORAMA_CLOUD_COLLECTION_ID')
const datasourceID = Deno.env.get('ORAMA_CLOUD_DATASOURCE_ID')
const privateAPIKey = Deno.env.get('ORAMA_CLOUD_PRIVATE_API_KEY')

const collectionURL = Deno.env.get('ORAMA_CLOUD_COLLECTION_URL')
const collectionReadAPIKey = Deno.env.get('ORAMA_CLOUD_COLLECTION_READ_API_KEY')

const mockDocuments = [
  {id: '1', title: 'Document 1', content: 'Content of document 1'},
  {id: '2', title: 'Document 2', content: 'Content of document 2'},
]

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

	Deno.test('CloudManager - insertDocuments', async () => {
		const cloudManager = new CloudManager({
			url: managerURL!,
			collectionID: collectionID!,
			privateAPIKey: privateAPIKey!,
		})

		const collection = new CollectionManager({
			url: collectionURL!,
			collectionID: collectionID!,
			readAPIKey: collectionReadAPIKey!
		});

		const datasource = cloudManager.setDataSource(datasourceID!)

		await datasource.insertDocuments(mockDocuments)

		const results = await collection.search({
			term: 'Document',
		})

		expect(results.hits).toHaveLength(2)
	})

  Deno.test('CloudManager - deleteDocuments', async () => {
    const cloudManager = new CloudManager({
      url: managerURL!,
      collectionID: collectionID!,
      privateAPIKey: privateAPIKey!,
    })


    const collection = new CollectionManager({
      url: collectionURL!,
      collectionID: collectionID!,
      readAPIKey: collectionReadAPIKey!
    });

    const datasource = cloudManager.setDataSource(datasourceID!)

    await datasource.insertDocuments(mockDocuments)

    await datasource.deleteDocuments(['1'])

    const results = await collection.search({
      term: 'Document',
    })

    expect(results.hits).toHaveLength(1)
    expect(results.hits[0]).toBeDefined()
    expect(results.hits[0].document.id).toBeDefined()
    expect(results.hits[0].document.id).toBe('2')
  })

  Deno.test('CloudManager - deleteAllDocuments', async () => {
    const cloudManager = new CloudManager({
      url: managerURL!,
      collectionID: collectionID!,
      privateAPIKey: privateAPIKey!,
    })

    const collection = new CollectionManager({
      url: collectionURL!,
      collectionID: collectionID!,
      readAPIKey: collectionReadAPIKey!
    });

    const datasource = cloudManager.setDataSource(datasourceID!)

    await datasource.insertDocuments(mockDocuments)

    await datasource.deleteAllDocuments()

    const results = await collection.search({
      term: 'Document',
    })

    expect(results.hits).toHaveLength(0)
  })
}
