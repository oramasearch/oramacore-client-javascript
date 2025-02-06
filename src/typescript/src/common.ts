import type { Nullable, AnyObject } from './lib/types'
import dedent from 'dedent'

type OramaInterfaceConfig = {
  baseURL: string
  masterAPIKey?: Nullable<string>
  writeAPIKey?: Nullable<string>
  readAPIKey?: Nullable<string>
}

type SecurityLevel = 'master' | 'write' | 'read'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

type RequestConfig = {
  url: string
  method: Method
  securityLevel: SecurityLevel
  body?: AnyObject
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

  public async request<T = unknown>(config: RequestConfig): Promise<T> {
    const remoteURL = new URL(config.url, this.baseURL)
    const headers = new Headers()

    headers.append('Content-Type', 'application/json')

    if (config.method !== 'GET') {
      const APIKey = this.getAPIKey(config.securityLevel)
      headers.append('Authorization', `Bearer ${APIKey}`)
    }

    if (config.method === 'GET' && config.securityLevel === 'master') {
      const APIKey = this.getAPIKey(config.securityLevel)
      headers.append('Authorization', `Bearer ${APIKey}`)
    }

    if (config.method === 'GET') {
      remoteURL.searchParams.append('api-key', this.getAPIKey(config.securityLevel))
    }

    const requestObject: Partial<RequestInit> = {
      method: config.method,
      headers
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
            `)
      )
    }

    return request.json()
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
        if (!this.readAPIKey) {
          throw new Error('Read API key is required for this operation')
        }
        return this.readAPIKey
    }
  }
}
