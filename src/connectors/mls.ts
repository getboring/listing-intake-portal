import { z } from "zod";

export interface MLSAuthConfig {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  scope?: string;
}

export interface MLSConnectionConfig {
  baseUrl: string;
  auth: MLSAuthConfig;
  resourceName: string; // usually "Property"
}

export interface MLSConnector {
  authenticate(): Promise<{ accessToken: string; expiresAt: number }>;
  createListing(payload: Record<string, unknown>): Promise<{ mlsListingKey?: string; success: boolean; errors?: string[] }>;
  updateListing(mlsListingKey: string, payload: Record<string, unknown>): Promise<{ success: boolean; errors?: string[] }>;
  deleteListing(mlsListingKey: string): Promise<{ success: boolean; errors?: string[] }>;
}

export class RESOWebAPIAdapter implements MLSConnector {
  private accessToken?: string;
  private expiresAt = 0;

  constructor(private config: MLSConnectionConfig) {}

  async authenticate(): Promise<{ accessToken: string; expiresAt: number }> {
    const params = new URLSearchParams();
    params.set("grant_type", "client_credentials");
    params.set("client_id", this.config.auth.clientId);
    params.set("client_secret", this.config.auth.clientSecret);
    if (this.config.auth.scope) {
      params.set("scope", this.config.auth.scope);
    }

    const res = await fetch(this.config.auth.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`MLS auth failed: ${res.status} ${await res.text()}`);
    }

    const raw = await res.json();
    const data = z.object({
      access_token: z.string(),
      expires_in: z.number(),
    }).parse(raw);
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
    return { accessToken: this.accessToken, expiresAt: this.expiresAt };
  }

  private async ensureAuth(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.expiresAt - 60_000) {
      await this.authenticate();
    }
    if (!this.accessToken) {
      throw new Error("MLS authentication unavailable");
    }
    return this.accessToken;
  }

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      "OData-Version": "4.01",
      "Content-Type": "application/json;odata.metadata=minimal",
      Accept: "application/json",
    };
  }

  async createListing(
    payload: Record<string, unknown>
  ): Promise<{ mlsListingKey?: string; success: boolean; errors?: string[] }> {
    const token = await this.ensureAuth();
    const url = `${this.config.baseUrl}/${this.config.resourceName}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(token),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 201 || res.status === 204) {
      const location = res.headers.get("Location");
      const mlsListingKey = location
        ? location.split("('").pop()?.replace("')", "")
        : undefined;
      return { success: true, mlsListingKey };
    }

    const text = await res.text();
    return { success: false, errors: [`${res.status}: ${text}`] };
  }

  async updateListing(
    mlsListingKey: string,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; errors?: string[] }> {
    const token = await this.ensureAuth();
    const url = `${this.config.baseUrl}/${this.config.resourceName}('${mlsListingKey}')`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: this.headers(token),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 200 || res.status === 204) {
      return { success: true };
    }

    const text = await res.text();
    return { success: false, errors: [`${res.status}: ${text}`] };
  }

  async deleteListing(
    mlsListingKey: string
  ): Promise<{ success: boolean; errors?: string[] }> {
    const token = await this.ensureAuth();
    const url = `${this.config.baseUrl}/${this.config.resourceName}('${mlsListingKey}')`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: this.headers(token),
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 200 || res.status === 204) {
      return { success: true };
    }

    const text = await res.text();
    return { success: false, errors: [`${res.status}: ${text}`] };
  }
}

export function createMLSConnector(config: MLSConnectionConfig): MLSConnector {
  return new RESOWebAPIAdapter(config);
}
