import { assertEquals } from 'jsr:@std/assert'
import { CollectionManager, OramaCoreManager } from '../src/index.ts'
import { createRandomString } from '../src/lib/utils.ts'
;(async () => {
  const manager = new OramaCoreManager({
    url: 'http://localhost:8080',
    masterAPIKey: 'my-master-api-key',
  })

  const id = createRandomString(32)
  const readAPIKey = 'read_api_key'
  const writeAPIKey = 'write_api_key'

  await manager.createCollection({
    id,
    readAPIKey,
    writeAPIKey,
  })

  const collectionManager = new CollectionManager({
    url: 'http://localhost:8080',
    collectionID: id,
    readAPIKey,
    writeAPIKey,
  })

  Deno.test('CollectionManager: insert multiple documents', async () => {
    const docs = [
      { id: '1', name: 'John Doe', age: 30 },
      { id: '2', name: 'Jane Doe', age: 25 },
    ]

    try {
      await collectionManager.insert(docs)
    } catch (error) {
      throw new Error(`Expected no error, but got: ${error}`)
    }
  })

  Deno.test('CollectionManager: insert single document', async () => {
    const doc = { id: '3', name: 'Johnathan Doe', age: 35 }

    try {
      await collectionManager.insert(doc)
    } catch (error) {
      throw new Error(`Expected no error, but got: ${error}`)
    }
  })

  Deno.test('CollectionManager: search documents', async () => {
    const result = await collectionManager.search({
      term: 'john',
      where: {
        age: {
          gt: 20,
        },
      },
    })

    assertEquals(result.count, 2)
  })

  Deno.test('CollectionManager: delete documents', async () => {
    await collectionManager.delete('3')

    const result = await collectionManager.search({
      term: 'john',
      where: {
        age: {
          gt: 20,
        },
      },
    })

    assertEquals(result.count, 1)
  })
})()
