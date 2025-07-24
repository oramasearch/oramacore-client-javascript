import { z } from 'npm:zod@3.24.3'
import { assert, assertEquals, assertFalse, assertNotEquals } from 'jsr:@std/assert'
import { CollectionManager, OramaCoreManager } from '../src/index.ts'
import { createRandomString } from '../src/lib/utils.ts'

const manager = new OramaCoreManager({
  url: 'http://localhost:8080',
  masterAPIKey: 'my-master-api-key',
})

const id = createRandomString(32)
const indexID = createRandomString(32)
const readAPIKey = 'read_api_key'
const writeAPIKey = 'write_api_key'

await manager.createCollection({
  id,
  readAPIKey,
  writeAPIKey,
})

const collectionManager = new CollectionManager({
  cluster: {
    readURL: 'http://localhost:8080',
    writerURL: 'http://localhost:8080',
  },
  collectionID: id,
  apiKey: writeAPIKey,
})

Deno.test('CollectionManager: create an index', async () => {
  await collectionManager.createIndex({
    id: indexID,
  })
})

Deno.test('CollectionManager: insert multiple documents', async () => {
  const docs = [
    { id: '1', name: 'John Doe', age: 30 },
    { id: '2', name: 'Jane Doe', age: 25 },
  ]

  try {
    const idx = collectionManager.setIndex(indexID)
    await idx.insertDocuments(docs)
  } catch (error) {
    throw new Error(`Expected no error, but got: ${error}`)
  }
})

Deno.test('CollectionManager: insert single document', async () => {
  const doc = { id: '3', name: 'Johnathan Doe', age: 35 }

  try {
    const idx = collectionManager.setIndex(indexID)
    await idx.insertDocuments(doc)
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
  const idx = collectionManager.setIndex(indexID)
  await idx.deleteDocuments('3')

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

Deno.test('CollectionManager: can insert and retrieve a tool', async () => {
  await collectionManager.insertTool({
    id: 'run_division',
    description: 'Run a mathematical division',
    parameters: z.object({
      dividend: z.number().describe('The number to be divided'),
      divisor: z.number().describe('The number to divide by'),
    }),
  })
  const retrievedTool = await collectionManager.getTool('run_division')

  assertEquals(retrievedTool.tool.id, 'run_division')
  assertEquals(retrievedTool.tool.description, 'Run a mathematical division')
  assertEquals(
    retrievedTool.tool.parameters,
    '{"type":"object","properties":{"dividend":{"type":"number","description":"The number to be divided"},"divisor":{"type":"number","description":"The number to divide by"}},"required":["dividend","divisor"],"additionalProperties":false}',
  )
})

Deno.test('CollectionManager: can get all tools', async () => {
  await collectionManager.insertTool({
    id: 'run_multiplication',
    description: 'Run a mathematical multiplication',
    parameters: z.object({
      multiplicand: z.number().describe('The number to be multiplied'),
      multiplier: z.number().describe('The number to multiply by'),
    }),
  })

  const tools = await collectionManager.getAllTools()

  assertEquals(tools.tools.length, 2) // Considering the tools created in the previous tests
})

Deno.test('CollectionManager: can delete a tool', async () => {
  await collectionManager.insertTool({
    id: 'run_addition',
    description: 'Run a mathematical addition',
    parameters: z.object({
      augend: z.number().describe('The first number to be added'),
      addend: z.number().describe('The second number to be added'),
    }),
  })

  const result = await collectionManager.deleteTool('run_addition')
  const checkTool = await collectionManager.getTool('run_addition')

  assertEquals(result.success, true)
  assertEquals(checkTool.tool, null)
})

Deno.test.ignore('CollectionManager: can update a tool', async () => {
  await collectionManager.insertTool({
    id: 'run_subtraction',
    description: 'Run a mathematical subtraction',
    parameters: z.object({
      minuend: z.number().describe('The number from which another number is subtracted'),
      subtrahend: z.number().describe('The number to be subtracted'),
    }),
  })

  const updatedTool = await collectionManager.updateTool({
    id: 'run_subtraction',
    description: 'Run a mathematical subtraction with updated parameters',
    parameters: z.object({
      minuend: z.number().describe('Updated description for the number from which another number is subtracted'),
      subtrahend: z.number().describe('Updated description for the number to be subtracted'),
    }),
  })

  const checkUpdatedTool = await collectionManager.getTool('run_subtraction')

  assertEquals(updatedTool.success, true)
  assertEquals(checkUpdatedTool.tool.description, 'Run a mathematical subtraction with updated parameters')
})

Deno.test('CollectionManager: can set hook', async () => {
  const hooksBefore = await collectionManager.listHooks()

  assertEquals(hooksBefore.BeforeAnswer, null)
  assertEquals(hooksBefore.BeforeRetrieval, null)

  await collectionManager.insertHook({
    name: 'BeforeAnswer',
    code: `
async function beforeAnswer(a, b) {
}

export default { beforeAnswer };
`,
  })

  const hooksAfter = await collectionManager.listHooks()

  assertNotEquals(hooksAfter.BeforeAnswer, null)
  assertEquals(hooksAfter.BeforeRetrieval, null)

  await collectionManager.deleteHook('BeforeAnswer')

  const hooksAfterAfter = await collectionManager.listHooks()

  assertEquals(hooksAfterAfter.BeforeAnswer, null)
  assertEquals(hooksAfterAfter.BeforeRetrieval, null)
})

Deno.test('CollectionManager: stream logs', async () => {
  await collectionManager.insertHook({
    name: 'BeforeRetrieval',
    code: `
async function beforeRetrieval(searchParams) {
  console.log('Before retrieval hook executed', searchParams);
  return searchParams;
}

export default { beforeRetrieval };
`,
  })

  const ev = await collectionManager.streamLogs()

  const logs: string[] = []
  ev.addEventListener('message', (event) => {
    logs.push(event.data)
  })

  const idx = collectionManager.setIndex(indexID)
  idx.insertDocuments([
    { id: '1', name: 'Alice', age: 28 },
    { id: '2', name: 'Bob', age: 32 },
  ])

  await new Promise((resolve) => setTimeout(resolve, 1000)) // Wait for the hook to be executed

  const session = collectionManager.createAnswerSession({})
  const output = await session.answer({
    query: 'How old is Alice?',
  })

  assert(/28/.test(output)) // alice age
  assertFalse(/32/.test(output)) // bob age

  assert(logs[0], 'Connected')
  assert(/\{/.test(logs[1]))
  assert(/mode/.test(logs[1]))
  assert(/\}/.test(logs[1]))

  ev.close()
})
