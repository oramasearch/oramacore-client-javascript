import { assertEquals } from 'jsr:@std/assert'
import { CollectionManager, OramaCoreManager } from '../src/index.ts'
import { createRandomString } from '../src/lib/utils.ts'

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

Deno.test('CollectionManager: create a segment', async () => {
  const segment = await collectionManager.insertSegment({
    name: 'Test Segment',
    description: 'This is a test segment',
    goal: 'This is a test goal',
  })

  assertEquals(segment.segment.name, 'Test Segment')
  assertEquals(segment.segment.description, 'This is a test segment')
  assertEquals(segment.segment.goal, 'This is a test goal')
  assertEquals(segment.success, true)
})

Deno.test('CollectionManager: get a segment', async () => {
  const newSegment = await collectionManager.insertSegment({
    name: 'A new test segment',
    description: 'This is a new test segment',
  })

  const segment = await collectionManager.getSegment(newSegment.id)

  assertEquals(segment.segment.name, 'A new test segment')
  assertEquals(segment.segment.description, 'This is a new test segment')
  assertEquals(segment.segment.goal, null)
})

Deno.test('CollectionManager: get all segments', async () => {
  const segments = await collectionManager.getAllSegments()

  assertEquals(segments.segments.length, 2)
})

Deno.test('CollectionManager: delete a segment', async () => {
  const newSegment = await collectionManager.insertSegment({
    name: 'A new test segment',
    description: 'This is a new test segment',
  })

  const result = await collectionManager.deleteSegment(newSegment.id)

  const checkSegment = await collectionManager.getSegment(newSegment.id)

  assertEquals(result.success, true)
  assertEquals(checkSegment.segment, null)
})

Deno.test('CollectionManager: update a segment', async () => {
  const newSegment = await collectionManager.insertSegment({
    name: 'A new test segment',
    description: 'This is a new test segment',
  })

  const updatedSegment = await collectionManager.updateSegment({
    id: newSegment.id,
    name: 'Updated test segment',
    description: 'This is an updated test segment',
  })

  const checkUpdatedSegment = await collectionManager.getSegment(newSegment.id)

  assertEquals(updatedSegment.success, true)
  assertEquals(checkUpdatedSegment.segment.name, 'Updated test segment')
  assertEquals(checkUpdatedSegment.segment.description, 'This is an updated test segment')
})

Deno.test('CollectionManager: create a trigger', async () => {
  const trigger = await collectionManager.insertTrigger({
    name: 'Test Trigger',
    description: 'This is a test trigger',
    response: 'This is a test response',
  })

  assertEquals(trigger.trigger.name, 'Test Trigger')
  assertEquals(trigger.trigger.description, 'This is a test trigger')
  assertEquals(trigger.trigger.response, 'This is a test response')
  assertEquals(trigger.success, true)
})

Deno.test('CollectionManager: get a trigger', async () => {
  const newTrigger = await collectionManager.insertTrigger({
    name: 'A new test trigger',
    description: 'This is a new test trigger',
    response: 'This is a new test response',
  })

  const trigger = await collectionManager.getTrigger(newTrigger.id)

  assertEquals(trigger.trigger.name, 'A new test trigger')
  assertEquals(trigger.trigger.description, 'This is a new test trigger')
  assertEquals(trigger.trigger.response, 'This is a new test response')
})

Deno.test('CollectionManager: get all triggers', async () => {
  const triggers = await collectionManager.getAllTriggers()

  assertEquals(triggers.triggers.length, 2)
})

Deno.test('CollectionManager: delete a trigger', async () => {
  const newTrigger = await collectionManager.insertTrigger({
    name: 'A new test trigger',
    description: 'This is a new test trigger',
    response: 'This is a new test response',
  })

  const result = await collectionManager.deleteTrigger(newTrigger.id)

  const checkTrigger = await collectionManager.getTrigger(newTrigger.id)

  assertEquals(result.success, true)
  assertEquals(checkTrigger.trigger, null)
})

Deno.test('CollectionManager: update a trigger', async () => {
  const newTrigger = await collectionManager.insertTrigger({
    name: 'A new test trigger',
    description: 'This is a new test trigger',
    response: 'This is a new test response',
  })

  const updatedTrigger = await collectionManager.updateTrigger({
    id: newTrigger.id,
    name: 'Updated test trigger',
    description: 'This is an updated test trigger',
    response: 'This is an updated test response',
  })

  const checkUpdatedTrigger = await collectionManager.getTrigger(newTrigger.id)

  assertEquals(updatedTrigger.success, true)
  assertEquals(checkUpdatedTrigger.trigger.name, 'Updated test trigger')
  assertEquals(checkUpdatedTrigger.trigger.description, 'This is an updated test trigger')
  assertEquals(checkUpdatedTrigger.trigger.response, 'This is an updated test response')
})
