import type { ImplicitEnumTypeStrategy, PinningRuleInsertObject } from '../src/lib/types.ts'

import { z } from 'npm:zod@3.24.3'
import { assert, assertEquals, assertFalse, assertNotEquals } from 'jsr:@std/assert'
import { CollectionManager, OramaCoreManager, ShelfInsertObject, ShelfWithDocument } from '../src/index.ts'
import { createRandomString } from '../src/lib/utils.ts'

const manager = new OramaCoreManager({
  url: 'http://localhost:8080',
  masterAPIKey: 'my-master-api-key',
})

const id = createRandomString(32)
const indexID = createRandomString(32)
const readAPIKey = 'read_api_key'
const writeAPIKey = 'write_api_key'

await manager.collection.create({
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
  await collectionManager.index.create({
    id: indexID,
  })
})

Deno.test('CollectionManager: create an index with explicit type strategy', async () => {
  await collectionManager.index.create({
    id: indexID,
    typeStrategy: {
      enum: 'explicit',
    },
  })

  const stats = await collectionManager.collections.getStats(id)

  assertEquals(stats.indexes_stats[0].type_parsing_strategies?.enum_strategy, 'Explicit')
})

Deno.test('CollectionManager: create an index with implicit type strategy', async () => {
  await collectionManager.index.create({
    id: indexID + '2',
    typeStrategy: {
      enum: 'string(50)',
    },
  })

  const stats = await collectionManager.collections.getStats(id)
  const strategy = stats.indexes_stats[1].type_parsing_strategies?.enum_strategy as ImplicitEnumTypeStrategy

  assertEquals(strategy.StringLength, 50)
  assertNotEquals(stats.indexes_stats[1].type_parsing_strategies?.enum_strategy, 'Explicit')
})

Deno.test('CollectionManager: insert multiple documents', async () => {
  const docs = [
    { id: '1', name: 'John Doe', age: 30 },
    { id: '2', name: 'Jane Doe', age: 25 },
  ]

  try {
    const idx = collectionManager.index.set(indexID)
    await idx.insertDocuments(docs)
  } catch (error) {
    throw new Error(`Expected no error, but got: ${error}`)
  }
})

Deno.test('CollectionManager: insert single document', async () => {
  const doc = { id: '3', name: 'Johnathan Doe', age: 35 }

  try {
    const idx = collectionManager.index.set(indexID)
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
  const idx = collectionManager.index.set(indexID)
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

Deno.test('CollectionManager: can insert a system prompt', async () => {
  const systemPrompt = await collectionManager.systemPrompts.insert({
    id: '123',
    name: 'Test System Prompt',
    prompt: 'This is a test system prompt',
    usage_mode: 'automatic',
  })

  assertEquals(systemPrompt.success, true)
})

Deno.test('CollectionManager: can insert a system prompt without an id', async () => {
  const systemPrompt = await collectionManager.systemPrompts.insert({
    name: 'Test System Prompt without ID',
    prompt: 'This is a test system prompt without ID',
    usage_mode: 'automatic',
  })

  assertEquals(systemPrompt.success, true)
})

Deno.test('CollectionManager: can get a system prompt', async () => {
  await collectionManager.systemPrompts.insert({
    id: '456',
    name: 'Test System Prompt 123',
    prompt: 'This is a test system prompt 123',
    usage_mode: 'automatic',
  })

  const prompt = await collectionManager.systemPrompts.get('456')

  assertEquals(prompt.system_prompt.name, 'Test System Prompt 123')
  assertEquals(prompt.system_prompt.prompt, 'This is a test system prompt 123')
  assertEquals(prompt.system_prompt.usage_mode, 'automatic')
})

Deno.test('CollectionManager: can get all system prompts', async () => {
  const prompts = await collectionManager.systemPrompts.getAll()

  // Considering the system prompts created in the previous tests
  assertEquals(prompts.system_prompts.length, 3)
})

Deno.test('CollectionManager: can delete a system prompt', async () => {
  await collectionManager.systemPrompts.insert({
    id: 'xxx',
    name: 'A new test system prompt',
    prompt: 'This is a new test system prompt',
    usage_mode: 'automatic',
  })

  const result = await collectionManager.systemPrompts.delete('xxx')

  const checkPrompt = await collectionManager.systemPrompts.get('xxx')

  assertEquals(result.success, true)
  assertEquals(checkPrompt.system_prompt, null)
})

Deno.test('CollectionManager: can update a system prompt', async () => {
  await collectionManager.systemPrompts.insert({
    id: 'yyy',
    name: 'A new test system prompt',
    prompt: 'This is a new test system prompt',
    usage_mode: 'automatic',
  })

  const updatedPrompt = await collectionManager.systemPrompts.update({
    id: 'yyy',
    name: 'Updated test system prompt',
    prompt: 'This is an updated test system prompt',
    usage_mode: 'automatic',
  })

  const checkUpdatedPrompt = await collectionManager.systemPrompts.get('yyy')

  assertEquals(updatedPrompt.success, true)
  assertEquals(checkUpdatedPrompt.system_prompt.name, 'Updated test system prompt')
  assertEquals(checkUpdatedPrompt.system_prompt.prompt, 'This is an updated test system prompt')
  assertEquals(checkUpdatedPrompt.system_prompt.usage_mode, 'automatic')
})

Deno.test('CollectionManager: can insert and retrieve a tool', async () => {
  await collectionManager.tools.insert({
    id: 'run_division',
    description: 'Run a mathematical division',
    parameters: z.object({
      dividend: z.number().describe('The number to be divided'),
      divisor: z.number().describe('The number to divide by'),
    }),
  })
  const retrievedTool = await collectionManager.tools.get('run_division')

  assertEquals(retrievedTool.tool.id, 'run_division')
  assertEquals(retrievedTool.tool.description, 'Run a mathematical division')
  assertEquals(
    retrievedTool.tool.parameters,
    '{"type":"object","properties":{"dividend":{"type":"number","description":"The number to be divided"},"divisor":{"type":"number","description":"The number to divide by"}},"required":["dividend","divisor"],"additionalProperties":false}',
  )
})

Deno.test('CollectionManager: can get all tools', async () => {
  await collectionManager.tools.insert({
    id: 'run_multiplication',
    description: 'Run a mathematical multiplication',
    parameters: z.object({
      multiplicand: z.number().describe('The number to be multiplied'),
      multiplier: z.number().describe('The number to multiply by'),
    }),
  })

  const tools = await collectionManager.tools.getAll()

  assertEquals(tools.tools.length, 2) // Considering the tools created in the previous tests
})

Deno.test('CollectionManager: can delete a tool', async () => {
  await collectionManager.tools.insert({
    id: 'run_addition',
    description: 'Run a mathematical addition',
    parameters: z.object({
      augend: z.number().describe('The first number to be added'),
      addend: z.number().describe('The second number to be added'),
    }),
  })

  const result = await collectionManager.tools.delete('run_addition')
  const checkTool = await collectionManager.tools.get('run_addition')

  assertEquals(result.success, true)
  assertEquals(checkTool.tool, null)
})

Deno.test.ignore('CollectionManager: can update a tool', async () => {
  await collectionManager.tools.insert({
    id: 'run_subtraction',
    description: 'Run a mathematical subtraction',
    parameters: z.object({
      minuend: z.number().describe('The number from which another number is subtracted'),
      subtrahend: z.number().describe('The number to be subtracted'),
    }),
  })

  const updatedTool = await collectionManager.tools.update({
    id: 'run_subtraction',
    description: 'Run a mathematical subtraction with updated parameters',
    parameters: z.object({
      minuend: z.number().describe('Updated description for the number from which another number is subtracted'),
      subtrahend: z.number().describe('Updated description for the number to be subtracted'),
    }),
  })

  const checkUpdatedTool = await collectionManager.tools.get('run_subtraction')

  assertEquals(updatedTool.success, true)
  assertEquals(checkUpdatedTool.tool.description, 'Run a mathematical subtraction with updated parameters')
})

Deno.test('CollectionManager: can set hook', async () => {
  const hooksBefore = await collectionManager.hooks.list()

  assertEquals(hooksBefore.BeforeAnswer, null)
  assertEquals(hooksBefore.BeforeRetrieval, null)

  await collectionManager.hooks.insert({
    name: 'BeforeAnswer',
    code: `
async function beforeAnswer(a, b) {
}

export default { beforeAnswer };
`,
  })

  const hooksAfter = await collectionManager.hooks.list()

  assertNotEquals(hooksAfter.BeforeAnswer, null)
  assertEquals(hooksAfter.BeforeRetrieval, null)

  await collectionManager.hooks.delete('BeforeAnswer')

  const hooksAfterAfter = await collectionManager.hooks.list()

  assertEquals(hooksAfterAfter.BeforeAnswer, null)
  assertEquals(hooksAfterAfter.BeforeRetrieval, null)
})

Deno.test.ignore('CollectionManager: stream logs', async () => {
  await collectionManager.hooks.insert({
    name: 'BeforeRetrieval',
    code: `
async function beforeRetrieval(searchParams) {
  console.log('Before retrieval hook executed', searchParams);
  return searchParams;
}

export default { beforeRetrieval };
`,
  })

  const ev = await collectionManager.logs.stream()

  const logs: string[] = []
  ev.addEventListener('message', (event) => {
    logs.push(event.data)
  })

  const idx = collectionManager.index.set(indexID)
  idx.insertDocuments([
    { id: '1', name: 'Alice', age: 28 },
    { id: '2', name: 'Bob', age: 32 },
  ])

  await new Promise((resolve) => setTimeout(resolve, 1000)) // Wait for the hook to be executed

  const session = collectionManager.ai.createAISession({})
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

Deno.test('CollectionManager: can handle transaction', async () => {
  const newIndexId = createRandomString(32)

  await collectionManager.index.create({
    id: newIndexId,
  })

  const index = collectionManager.index.set(newIndexId)

  await index.insertDocuments([
    { id: '1', name: '123', number: 123 },
    { id: '2', name: '456', number: 456 },
  ])

  const docs = await collectionManager.search({
    term: '',
    indexes: [newIndexId],
  })

  const count = docs.count

  assertEquals(count, 2)

  await index.transaction.open()
  await index.transaction.insertDocuments([
    { id: '3', name: '789', number: 789 },
  ])
  await index.transaction.commit()

  const docsAfter = await collectionManager.search({
    term: '',
    indexes: [newIndexId],
  })

  const countAfter = docsAfter.count

  assertEquals(countAfter, 1)
  assertEquals(docsAfter.hits[0].document.id, '3')
})

Deno.test('CollectionManager: can handle pinning rules', async () => {
  const newIndexId = createRandomString(32)

  await collectionManager.index.create({
    id: newIndexId,
    embeddings: 'all_properties',
  })

  const index = collectionManager.index.set(newIndexId)

  await index.insertDocuments([
    { id: '1', name: 'Blue Jeans' },
    { id: '2', name: 'Red T-Shirt' },
    { id: '3', name: 'Green Hoodie' },
    { id: '4', name: 'Yellow Socks' },
  ])

  const pinningRule: PinningRuleInsertObject = {
    id: 'test_rule',
    conditions: [
      {
        anchoring: 'is',
        pattern: 'Blue Jeans',
      },
    ],
    consequence: {
      promote: [
        {
          doc_id: '2',
          position: 1,
        },
      ],
    },
  }

  await collectionManager.pinningRules.insert(pinningRule)

  const rules = await collectionManager.pinningRules.list()
  assertEquals(rules.length, 1)
  assertEquals(rules[0].id, 'test_rule')

  const result = await collectionManager.search({
    term: 'Blue Jeans',
    indexes: [newIndexId],
  })

  assertEquals(result.hits.length, 2)
  assertEquals(result.hits[0].document.id, '1')
  assertEquals(result.hits[1].document.id, '2')

  await collectionManager.pinningRules.delete('test_rule')

  const newRules = await collectionManager.pinningRules.list()
  assertEquals(newRules.length, 0)
})

Deno.test('CollectionManager: can handle shelves', async () => {
  const newIndexId = createRandomString(32)

  await collectionManager.index.create({
    id: newIndexId,
    embeddings: 'all_properties',
  })

  const index = collectionManager.index.set(newIndexId)

  await index.insertDocuments([
    { id: '1', name: 'Blue Jeans' },
    { id: '2', name: 'Red T-Shirt' },
    { id: '3', name: 'Green Hoodie' },
    { id: '4', name: 'Yellow Socks' },
  ])

  const shelf: ShelfInsertObject = {
    id: 'test_shelf',
    doc_ids: ['1', '3'],
  }

  await collectionManager.shelves.insert(shelf)

  const list = await collectionManager.shelves.list()
  assertEquals(list.length, 1)
  assertEquals(list[0], {
    id: 'test_shelf',
    doc_ids: ['1', '3'],
  })

  const result = await collectionManager.shelves.get('test_shelf')
  assertEquals(result.id, 'test_shelf')
  assertEquals(result.docs, [
    { id: '1', name: 'Blue Jeans' },
    { id: '3', name: 'Green Hoodie' },
  ])

  await collectionManager.shelves.delete('test_shelf')

  const newRules = await collectionManager.shelves.list()
  assertEquals(newRules.length, 0)
})

Deno.test('CollectionManager: can handle grouping', async () => {
  const newIndexId = createRandomString(32)

  await collectionManager.index.create({
    id: newIndexId,
  })

  const index = collectionManager.index.set(newIndexId)

  await index.insertDocuments([
    { id: '1', name: 'White t-shirt', tag: 'clothing' },
    { id: '2', name: 'Red and white t-shirt', tag: 'clothing' },
    { id: '3', name: 'Green t-shirt', tag: 'clothing' },
    { id: '4', name: 'Yellow socks', tag: 'clothing' },
    { id: '5', name: 'White shoes', tag: 'shoes' },
    { id: '6', name: 'White glasses', tag: 'accessories' },
    { id: '7', name: 'White rings', tag: 'accessories' },
  ])

  const result = await collectionManager.search({
    term: 'white',
    groupBy: {
      properties: ['tag'],
      max_results: 5,
    },
  })

  const shoesGroup = result.groups?.find((group) => group.values.includes('shoes'))
  const accessoriesGroup = result.groups?.find((group) => group.values.includes('accessories'))
  const clothingGroup = result.groups?.find((group) => group.values.includes('clothing'))

  assertEquals(result.groups!.length, 3)
  assertEquals(shoesGroup?.result.length, 1)
  assertEquals(accessoriesGroup?.result.length, 2)
  assertEquals(clothingGroup?.result.length, 2)
})

Deno.test('CollectionManager: can update the MCP description', async () => {
  const stats = await collectionManager.collections.getStats(id)
  const oldDescription = stats.mcp_description || ''

  const newDescription = oldDescription + 'Updated Once'

  await collectionManager.mcp.updateDescription(newDescription)

  const updatedStats = await collectionManager.collections.getStats(id)
  assertEquals(updatedStats.mcp_description, newDescription)

  const finalDescription = oldDescription + 'Updated Twice'

  await collectionManager.mcp.updateDescription(finalDescription)

  const finalStats = await collectionManager.collections.getStats(id)
  assertEquals(finalStats.mcp_description, finalDescription)
})
