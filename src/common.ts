import { EventsStreamTransformer, type SSEEvent } from './lib/event-stream.ts'

type JWTRequestResponse = {
  jwt: string
  writerURL: string
  readerApiKey: string
  readerURL: string
  expiresIn: number // not used for now
}

export type ApiKeyPosition = 'header' | 'query-params'
export type ClientRequestInit = Omit<RequestInit, 'method' | 'headers' | 'body'>

type ReadWriteAuth = {
  readerURL?: string
  writerURL?: string
}

type ApiKeyAuth = {
  type: 'apiKey'
  apiKey: string
}

type JwtAuth = {
  type: 'jwt'
  authJwtURL: string
  collectionID: string
  privateApiKey: string
}

type AuthConfig =
  & ReadWriteAuth
  & (ApiKeyAuth | JwtAuth)

export class Auth {
  private config: AuthConfig

  constructor(config: AuthConfig) {
    this.config = config
  }

  public async getRef(
    target: ClientRequest['target'],
    init?: ClientRequestInit,
  ): Promise<{
    bearer: string
    baseURL: string
  }> {
    let bearer: string
    let baseURL: string
    switch (this.config.type) {
      case 'apiKey': {
        bearer = this.config.apiKey
        if (target == 'writer' && !this.config.writerURL) {
          throw new Error(
            'Cannot perform a request to a writer without the writerURL. Use `cluster.writerURL` to configure it',
          )
        }
        if (target == 'reader' && !this.config.readerURL) {
          throw new Error(
            'Cannot perform a request to a writer without the writerURL. Use `cluster.readerURL` to configure it',
          )
        }
        baseURL = target == 'writer' ? this.config.writerURL! : this.config.readerURL!
        break
      }
      case 'jwt': {
        const ret = await getJwtToken(
          this.config.authJwtURL,
          this.config.collectionID,
          this.config.privateApiKey,
          'write',
          init,
        )
        // NB: This allow us to support at *client side* a way invocation to reader with private api key!!
        if (target == 'reader') {
          baseURL = this.config.readerURL ?? ret.readerURL
          bearer = ret.readerApiKey
        } else {
          bearer = ret.jwt
          baseURL = this.config.writerURL ?? ret.writerURL
        }
        break
      }
    }

    return {
      bearer,
      baseURL,
    }
  }
}

export type ClientRequest = {
  target: 'reader' | 'writer'
  method: 'GET' | 'POST'
  path: string
  body?: object
  params?: Record<string, string>
  init?: ClientRequestInit
  apiKeyPosition: ApiKeyPosition
}

export interface ClientConfig {
  auth: Auth
}

export class Client {
  private config: ClientConfig

  constructor(config: ClientConfig) {
    this.config = config
  }

  public async request<Output>(req: ClientRequest): Promise<Output> {
    const response = await this.getResponse(req)

    if (!response.ok) {
      let text
      try {
        text = await response.text()
      } catch (e) {
        text = `Unable to got response body ${e}`
      }
      throw new Error(
        `Request to "${req.path}?${
          new URLSearchParams(req.params ?? {}).toString()
        }" failed with status ${response.status}: ${text}`,
      )
    }

    return response.json() as Promise<Output>
  }

  public async requestStream(req: ClientRequest): Promise<ReadableStream<SSEEvent>> {
    const response = await this.getResponse(req)

    if (response.body === null) {
      throw new Error(`Response body is null for "${req.path}"`)
    }

    return response.body?.pipeThrough(new EventsStreamTransformer())
  }

  public async eventSource(req: ClientRequest) {
    if (req.apiKeyPosition !== 'query-params') {
      throw new Error(
        `EventSource only supports apiKeyPosition as 'query-params', but got ${req.apiKeyPosition}`,
      )
    }
    if (req.method !== 'GET') {
      throw new Error(
        `EventSource only supports GET requests, but got ${req.method}`,
      )
    }

    const {
      baseURL,
      bearer,
    } = await this.config.auth.getRef(req.target, req.init)
    const remoteURL = new URL(req.path, baseURL)

    req.params = req.params ?? {}
    req.params['api-key'] = bearer
    if (req.params) {
      remoteURL.search = new URLSearchParams(req.params).toString()
    }

    return new EventSource(remoteURL)
  }

  async getResponse({
    method,
    path,
    body,
    params,
    apiKeyPosition,
    init,
    target,
  }: ClientRequest): Promise<Response> {
    const {
      baseURL,
      bearer,
    } = await this.config.auth.getRef(target, init)

    const remoteURL = new URL(path, baseURL)
    const headers = new Headers()
    headers.append('Content-Type', 'application/json')

    if (apiKeyPosition === 'header') {
      headers.append('Authorization', `Bearer ${bearer}`)
    }
    if (apiKeyPosition === 'query-params') {
      params = params ?? {}
      params['api-key'] = bearer
    }

    const requestObject: Partial<RequestInit> = {
      method: method,
      headers,
      ...init,
    }

    if (body && method === 'POST') {
      requestObject.body = JSON.stringify(body)
    }

    if (params) {
      remoteURL.search = new URLSearchParams(params).toString()
    }

    const response = await fetch(remoteURL, requestObject)
    if (response.status === 401) {
      throw new Error(
        `Unauthorized: are you using the correct Api Key?`,
      )
    }
    if (response.status === 400) {
      const errorText = await response.text()
      throw new Error(
        `Bad Request: ${errorText} (path: ${remoteURL.toString()})`,
      )
    }
    return response
  }
}

async function getJwtToken(
  authJwtUrl: string,
  collectionId: string,
  privateApiKey: string,
  scope: 'write',
  init?: ClientRequestInit,
): Promise<JWTRequestResponse> {
  const payload = {
    collectionId,
    privateApiKey,
    scope,
  }
  const request = await fetch(authJwtUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    ...init,
  })

  if (!request.ok) {
    throw new Error(`JWT request to ${request.url} failed with status ${request.status}: ${await request.text()}`)
  }

  return request.json() as Promise<JWTRequestResponse>
}

export function safeJSONParse<T = unknown>(data: string, silent = true): T {
  try {
    return JSON.parse(data)
  } catch (error) {
    if (!silent) {
      console.warn('Recovered from failed JSON parsing with error:', error)
    }
    return data as unknown as T
  }
}
