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

export type SearchMode = 'fulltext' | 'vector' | 'hybrid'

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
}

export type Segment = {
  id: string
  name: string
  description: string
  goal?: string
}

export type InsertSegmentBody = {
  name: string
  description: string
  goal?: string
}

export type InsertTriggerBody = {
  name: string
  description: string
  response: string
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
