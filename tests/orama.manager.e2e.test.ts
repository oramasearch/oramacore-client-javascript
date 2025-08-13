import { assertEquals } from 'jsr:@std/assert'
import { OramaCoreManager } from '../src/index.ts'
import { createRandomString } from '../src/lib/utils.ts'

const manager = new OramaCoreManager({
  url: 'http://localhost:8080',
  masterAPIKey: 'my-master-api-key',
})

const id = createRandomString(32)
const readAPIKey = 'read_api_key'
const writeAPIKey = 'write_api_key'

Deno.test('Can create a new collection', async () => {
  const newCollection = await manager.collection.create({
    id,
    readAPIKey,
    writeAPIKey,
  })

  assertEquals(newCollection.id, id)
})

Deno.test('Can get a collection', async () => {
  const collection = await manager.collection.get(id)

  assertEquals(collection.id, id)
})

Deno.test('Can list collections', async () => {
  const collections = await manager.collection.list()
  const newCollectionExists = collections.find((c) => c.id === id)?.id

  assertEquals(collections.length > 1, true)
  assertEquals(newCollectionExists, id)
})
