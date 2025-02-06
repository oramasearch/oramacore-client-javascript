import type { AnyObject } from './lib/types'
import dedent from 'dedent'

type OramaInterfaceConfig = {
  baseURL: string
  masterAPIKey: string
  writeAPIKey: string
  readAPIKey: string
}

type SecurityLevel = 'master' | 'write' | 'read'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

type RequestConfig = {
  url: string
  body: AnyObject
  method: Method
  securityLevel: SecurityLevel
}

export class OramaInterface {
  private baseURL: string
  private masterAPIKey: string
  private writeAPIKey: string
  private readAPIKey: string

  constructor(config: OramaInterfaceConfig) {
    this.baseURL = config.baseURL
    this.masterAPIKey = config.masterAPIKey
    this.writeAPIKey = config.writeAPIKey
    this.readAPIKey = config.readAPIKey
  }

  public async request<T = unknown>(config: RequestConfig): Promise<T> {
    const remoteURL = new URL(config.url, this.baseURL)
    const headers = new Headers()

    headers.append('Content-Type', 'application/json')

    if (config.method !== 'GET') {
      const APIKey = this.getAPIKey(config.securityLevel)
      headers.append('Authorization', `Bearer ${APIKey}`)
    }

    if (config.method === 'GET') {
      remoteURL.searchParams.append('api-key', this.getAPIKey(config.securityLevel))
    }

    const request = await fetch(remoteURL.toString(), {
      method: config.method,
      body: JSON.stringify(config.body),
      headers
    })

    if (!request.ok) {
      throw new Error(
        dedent(`
                Request failed with status ${request.status}:

                ${await request.text()}
            `)
      )
    }

    return request.json()
  }

  private getAPIKey(securityLevel: SecurityLevel): string {
    switch (securityLevel) {
      case 'master':
        return this.masterAPIKey
      case 'write':
        return this.writeAPIKey
      case 'read':
        return this.readAPIKey
    }
  }
}
