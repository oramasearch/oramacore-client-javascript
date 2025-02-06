import type { AnyObject, Nullable } from './lib/types.ts'
import dedent from 'npm:dedent@1.5.3'

type OramaInterfaceConfig = {
  baseURL: string
  masterAPIKey?: Nullable<string>
  writeAPIKey?: Nullable<string>
  readAPIKey?: Nullable<string>
}

type SecurityLevel = 'master' | 'write' | 'read' | 'read-query'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

type RequestConfig<Body = AnyObject> = {
  url: string
  method: Method
  securityLevel: SecurityLevel
  body?: Body
}

export class OramaInterface {
  private baseURL: string
  private masterAPIKey: Nullable<string>
  private writeAPIKey: Nullable<string>
  private readAPIKey: Nullable<string>

  constructor(config: OramaInterfaceConfig) {
    this.baseURL = config.baseURL
    this.masterAPIKey = config.masterAPIKey || null
    this.writeAPIKey = config.writeAPIKey || null
    this.readAPIKey = config.readAPIKey || null
  }

  public async request<T = unknown, B = AnyObject>(config: RequestConfig<B>): Promise<T> {
    const remoteURL = new URL(config.url, this.baseURL)
    const headers = new Headers()

    headers.append('Content-Type', 'application/json')

    const APIKey = this.getAPIKey(config.securityLevel)

    switch (true) {
      case config.method !== 'GET' && config.securityLevel !== 'read-query':
        headers.append('Authorization', `Bearer ${APIKey}`)
        break
      case config.method === 'GET' && config.securityLevel === 'master':
        headers.append('Authorization', `Bearer ${APIKey}`)
        break
      case config.method === 'GET' || config.securityLevel === 'read-query':
        remoteURL.searchParams.append('api-key', APIKey)
        break
    }

    const requestObject: Partial<RequestInit> = {
      method: config.method,
      headers,
    }

    if (config.body) {
      requestObject.body = JSON.stringify(config.body)
    }

    const request = await fetch(remoteURL.toString(), requestObject)

    if (!request.ok) {
      throw new Error(
        dedent(`
                Request to "${config.url}" failed with status ${request.status}:
                ${await request.text()}
            `),
      )
    }

    return request.json() as Promise<T>
  }

  private getAPIKey(securityLevel: SecurityLevel): string {
    switch (securityLevel) {
      case 'master':
        if (!this.masterAPIKey) {
          throw new Error('Master API key is required for this operation')
        }
        return this.masterAPIKey
      case 'write':
        if (!this.writeAPIKey) {
          throw new Error('Write API key is required for this operation')
        }
        return this.writeAPIKey
      case 'read':
      case 'read-query':
        if (!this.readAPIKey) {
          throw new Error('Read API key is required for this operation')
        }
        return this.readAPIKey
    }
  }
}
