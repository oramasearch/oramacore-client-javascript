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

Deno.test('CollectionManager: search documents with "auto" mode', async () => {
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
    id: '123',
    name: 'Test Trigger',
    description: 'This is a test trigger',
    response: 'This is a test response',
    segment_id: 'foo',
  })

  assertEquals(trigger.trigger.id, '123')
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
    segment_id: '123',
  })

  const trigger = await collectionManager.getTrigger(newTrigger.id)

  assertEquals(trigger.trigger.name, 'A new test trigger')
  assertEquals(trigger.trigger.description, 'This is a new test trigger')
  assertEquals(trigger.trigger.response, 'This is a new test response')
  assertEquals(trigger.trigger.segment_id, '123')
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
    segment_id: '123',
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
    segment_id: '123',
  })

  const updatedTrigger = await collectionManager.updateTrigger({
    id: newTrigger.id,
    name: 'Updated test trigger',
    description: 'This is an updated test trigger',
    response: 'This is an updated test response',
  })

  const checkUpdatedTrigger = await collectionManager.getTrigger(updatedTrigger.trigger.id)

  assertEquals(updatedTrigger.success, true)
  assertEquals(checkUpdatedTrigger.trigger.name, 'Updated test trigger')
  assertEquals(checkUpdatedTrigger.trigger.description, 'This is an updated test trigger')
  assertEquals(checkUpdatedTrigger.trigger.response, 'This is an updated test response')
  assertEquals(checkUpdatedTrigger.trigger.segment_id, '123')
})

Deno.test('CollectionManager: can insert a trigger with segment_id', async () => {
  const segment = await collectionManager.insertSegment({
    name: 'Test Segment',
    description: 'This is a test segment',
  })

  const trigger = await collectionManager.insertTrigger({
    name: 'Test Trigger',
    description: 'This is a test trigger',
    response: 'This is a test response',
    segment_id: segment.id,
  })

  assertEquals(segment.id, trigger.trigger.segment_id)
})

Deno.test('CollectionManager: can insert a system prompt', async () => {
  const systemPrompt = await collectionManager.insertSystemPrompt({
    id: '123',
    name: 'Test System Prompt',
    prompt: 'This is a test system prompt',
    usage_mode: 'automatic',
  })

  assertEquals(systemPrompt.success, true)
})

Deno.test('CollectionManager: can insert a system prompt without an id', async () => {
  const systemPrompt = await collectionManager.insertSystemPrompt({
    name: 'Test System Prompt without ID',
    prompt: 'This is a test system prompt without ID',
    usage_mode: 'automatic',
  })

  assertEquals(systemPrompt.success, true)
})

Deno.test('CollectionManager: can get a system prompt', async () => {
  await collectionManager.insertSystemPrompt({
    id: '456',
    name: 'Test System Prompt 123',
    prompt: 'This is a test system prompt 123',
    usage_mode: 'automatic',
  })

  const prompt = await collectionManager.getSystemPrompt('456')

  assertEquals(prompt.system_prompt.name, 'Test System Prompt 123')
  assertEquals(prompt.system_prompt.prompt, 'This is a test system prompt 123')
  assertEquals(prompt.system_prompt.usage_mode, 'automatic')
})

Deno.test('CollectionManager: can get all system prompts', async () => {
  const prompts = await collectionManager.getAllSystemPrompts()

  // Considering the system prompts created in the previous tests
  assertEquals(prompts.system_prompts.length, 3)
})

Deno.test('CollectionManager: can delete a system prompt', async () => {
  await collectionManager.insertSystemPrompt({
    id: 'xxx',
    name: 'A new test system prompt',
    prompt: 'This is a new test system prompt',
    usage_mode: 'automatic',
  })

  const result = await collectionManager.deleteSystemPrompt('xxx')

  const checkPrompt = await collectionManager.getSystemPrompt('xxx')

  assertEquals(result.success, true)
  assertEquals(checkPrompt.system_prompt, null)
})

Deno.test('CollectionManager: can update a system prompt', async () => {
  await collectionManager.insertSystemPrompt({
    id: 'yyy',
    name: 'A new test system prompt',
    prompt: 'This is a new test system prompt',
    usage_mode: 'automatic',
  })

  const updatedPrompt = await collectionManager.updateSystemPrompt({
    id: 'yyy',
    name: 'Updated test system prompt',
    prompt: 'This is an updated test system prompt',
    usage_mode: 'automatic',
  })

  const checkUpdatedPrompt = await collectionManager.getSystemPrompt('yyy')

  assertEquals(updatedPrompt.success, true)
  assertEquals(checkUpdatedPrompt.system_prompt.name, 'Updated test system prompt')
  assertEquals(checkUpdatedPrompt.system_prompt.prompt, 'This is an updated test system prompt')
  assertEquals(checkUpdatedPrompt.system_prompt.usage_mode, 'automatic')
})
