import { EventsStreamTransformer, type SSEEvent } from "./lib/event-stream.ts";
import type { AnyObject } from "./lib/types.ts";
import dedent from "npm:dedent@1.5.3";

type OramaInterfaceConfig = {
  baseURL: string;
  masterAPIKey?: string;
  writeAPIKey?: string;
  readAPIKey?: string;
  collectionID?: string;
};

type SecurityLevel = "master" | "write" | "read" | "read-query";

type Method = "GET" | "POST" | "PUT" | "DELETE";

type RequestConfig<Body = AnyObject> = {
  url: string;
  method: Method;
  securityLevel: SecurityLevel;
  body?: Body;
  signal?: AbortSignal;
};

type JWTRequestResponse = {
  jwt: string;
  cluster_url: string;
};

export class OramaInterface {
  private baseURL: string;
  private masterAPIKey?: string;
  private writeAPIKey?: string;
  private readAPIKey?: string;
  private jwtToken?: string;
  private collectionID?: string;

  constructor(config: OramaInterfaceConfig) {
    this.baseURL = config.baseURL;
    this.collectionID = config.collectionID;
    this.masterAPIKey = config.masterAPIKey;
    this.writeAPIKey = config.writeAPIKey;
    this.readAPIKey = config.readAPIKey;
  }

  public async request<T = unknown, B = AnyObject>(
    config: RequestConfig<B>,
  ): Promise<T> {
    const remoteURL = new URL(config.url, this.baseURL);
    const headers = new Headers();

    headers.append("Content-Type", "application/json");

    const requestObject: Partial<RequestInit> = {
      method: config.method,
      headers,
    };

    if (config.body && config.method !== "GET") {
      requestObject.body = JSON.stringify(config.body);
    }

    if (config.body && config.method === "GET") {
      remoteURL.search = new URLSearchParams(config.body).toString();
    }

    const APIKey = this.getAPIKey(config.securityLevel);

    switch (true) {
      case config.securityLevel === "write":
        if (!this.jwtToken) {
          this.jwtToken = await this.getJwtToken(config);
        }
        headers.append("Authorization", `Bearer ${this.jwtToken}`);
        break;
      case config.method !== "GET" && config.securityLevel !== "read-query":
        headers.append("Authorization", `Bearer ${APIKey}`);
        break;
      case config.method === "GET" && config.securityLevel === "master":
        headers.append("Authorization", `Bearer ${APIKey}`);
        break;
      case config.method === "GET" || config.securityLevel === "read-query":
        remoteURL.searchParams.append("api-key", APIKey);
        break;
    }

    const request = await fetch(remoteURL.toString(), requestObject);

    if (!request.ok) {
      if (request.status === 401) {
        this.jwtToken = await this.getJwtToken(config);
        headers.append("Authorization", this.jwtToken);
        return await this.request(config);
      }

      throw new Error(
        dedent(`
                Request to "${config.url}" failed with status ${request.status}:
                ${await request.text()}
            `),
      );
    }

    return request.json() as Promise<T>;
  }

  public async requestStream<B = AnyObject>(
    config: RequestConfig<B>,
  ): Promise<ReadableStream<SSEEvent>> {
    const remoteURL = new URL(config.url, this.baseURL);
    const headers = new Headers();
    headers.append("Content-Type", "application/json");

    const APIKey = this.getAPIKey(config.securityLevel);
    remoteURL.searchParams.append("api-key", APIKey);

    const response = await fetch(remoteURL.toString(), {
      body: JSON.stringify(config.body),
      headers,
      method: config.method,
    });

    if (!response.ok) {
      throw new Error(
        dedent(`
                Request to "${config.url}" failed with status ${response.status}:
                ${await response.text()}
            `),
      );
    }

    if (response.body === null) {
      throw new Error(`Response body is null for "${config.url}"`);
    }

    return response.body?.pipeThrough(new EventsStreamTransformer());
  }

  private getAPIKey(securityLevel: SecurityLevel): string {
    switch (securityLevel) {
      case "master":
        if (!this.masterAPIKey) {
          throw new Error("Master API key is required for this operation");
        }
        return this.masterAPIKey;
      case "write":
        if (!this.writeAPIKey) {
          throw new Error("Write API key is required for this operation");
        }
        return this.writeAPIKey;
      case "read":
      case "read-query":
        if (!this.readAPIKey) {
          throw new Error("Read API key is required for this operation");
        }
        return this.readAPIKey;
    }
  }

  private async getJwtToken<T = unknown, B = AnyObject>(
    config: RequestConfig<B>,
  ): Promise<string> {
    const issuer = "https://cloud.orama.com/api/user/jwt"; // Should somehow be stable and/or extacted from some initial request to the main node
    const headers = {
      "Content-Type": "application/json",
    };
    const payload = {
      scope: "write",
      collectionId: this.collectionID,
      privateKey: this.getAPIKey(config.securityLevel),
    };
    const request = await fetch(issuer, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!request.ok) {
      throw new Error(
        dedent(`
                JWT request to ${request.url} failed with status ${request.status}:
                ${await request.text()}
            `),
      );
    }

    const response = (await request.json()) as JWTRequestResponse;
    return response.jwt;
  }
}

export function safeJSONParse<T = unknown>(data: string, silent = true): T {
  try {
    return JSON.parse(data);
  } catch (error) {
    if (!silent) {
      console.warn("Recovered from failed JSON parsing with error:", error);
    }
    return data as unknown as T;
  }
}
