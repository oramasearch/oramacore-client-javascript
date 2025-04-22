import type { ZodType } from 'npm:zod@3.24.3'

import type { Message } from '../answer-session.ts'
import type { LLMConfig } from '../collection.ts'

export type Nullable<T = unknown> = T | null

export type Maybe<T = unknown> = T | undefined

export type AnyObject<T = unknown> = Record<string, T>

export type Language =
  | 'arabic'
  | 'bulgarian'
  | 'chinese'
  | 'danish'
  | 'dutch'
  | 'german'
  | 'greek'
  | 'english'
  | 'estonian'
  | 'spanish'
  | 'finnish'
  | 'french'
  | 'irish'
  | 'hindi'
  | 'hungarian'
  | 'armenian'
  | 'indonesian'
  | 'italian'
  | 'japanese'
  | 'korean'
  | 'lituanian'
  | 'nepali'
  | 'norwegian'
  | 'portuguese'
  | 'romanian'
  | 'russian'
  | 'sanskrit'
  | 'slovenian'
  | 'serbian'
  | 'swedish'
  | 'tamil'
  | 'turkish'
  | 'ukrainian'

export type EmbeddingsModel =
  | 'E5MultilangualSmall'
  | 'E5MultilangualBase'
  | 'E5MultilangualLarge'
  | 'BGESmall'
  | 'BGEBase'
  | 'BGELarge'

export type EmbeddingsConfig = {
  model: Nullable<EmbeddingsModel>
  documentFields: Nullable<string[]>
}

export type Hook = 'selectEmbeddingProperties'

export type SearchMode = 'fulltext' | 'vector' | 'hybrid' | 'auto'

export type SearchParams = {
  term: string
  mode?: SearchMode
  limit?: number
  offset?: number
  properties?: string[]
  where?: AnyObject
  facets?: AnyObject
}

export type Hit<T = AnyObject> = {
  id: string
  score: number
  document: T
}

export type SearchResult<T = AnyObject> = {
  count: number
  hits: Hit<T>[]
  facets?: AnyObject
  elapsed: {
    raw: number
    formatted: string
  }
}

export type Trigger = {
  id: string
  name: string
  description: string
  response: string
  segment_id?: string
}

export type Segment = {
  id: string
  name: string
  description: string
  goal?: string
}

export type InsertSegmentBody = {
  id?: string
  name: string
  description: string
  goal?: string
}

export type InsertTriggerBody = {
  id?: string
  name: string
  description: string
  response: string
  segment_id: string
}

export type InsertSegmentResponse = {
  success: boolean
  id: string
  segment: Segment
}

export type InsertTriggerResponse = {
  success: boolean
  id: string
  trigger: Trigger
}

export type UpdateTriggerResponse = {
  success: boolean
  trigger: Trigger
}

export type SystemPrompt = {
  id: string
  name: string
  prompt: string
  usage_mode: 'automatic' | 'manual'
}

export type InsertSystemPromptBody = {
  id?: string
  name: string
  prompt: string
  usage_mode: 'automatic' | 'manual'
}

export type SystemPromptValidationResponse = {
  security: {
    valid: boolean
    reason: string
    violations: string[]
  }
  technical: {
    valid: boolean
    reason: string
    instruction_count: number
  }
  overall_assessment: {
    valid: boolean
    summary: string
  }
}

export type Tool = {
  id: string
  name: string
  description: string
  parameters: string
}

export type InsertToolBody = {
  id: string
  description: string
  parameters: string | AnyObject | ZodType
  code?: string
}

export type UpdateToolBody = {
  id: string
  description?: string
  parameters?: string | AnyObject | ZodType
  code?: string
}

export type ExecuteToolsBody = {
  tool_ids?: string[]
  messages: Message[]
  llm_config?: LLMConfig
}

export type FunctionCall = {
  name: string
  arguments: string
}

export type FunctionCallParsed = {
  name: string
  arguments: AnyObject
}

export type ExecuteToolsResponse = {
  results: Nullable<FunctionCall[]>
}

export type ExecuteToolsFunctionResult<T = AnyObject> = {
  functionResult: {
    tool_id: string
    result: T
  }
}

export type ExecuteToolsParametersResult<T = AnyObject> = {
  functionParameters: {
    tool_id: string
    result: T
  }
}

export type ExecuteToolsResult<T = AnyObject> =
  | ExecuteToolsFunctionResult<T>
  | ExecuteToolsParametersResult<T>

export type ExecuteToolsParsedResponse<T = AnyObject> = {
  results: Nullable<ExecuteToolsResult<T>[]>
}
