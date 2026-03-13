import { createHmac, randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

const azuriteAccountName = "devstoreaccount1";
const azuriteAccountKey =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";
const storageApiVersion = "2023-11-03";

type BlobStorageConfig = {
  accountName: string;
  accountKey: string;
  blobEndpoint: string;
  containerName: string;
};

export type StoredJsonArtifact = {
  uri: string;
  blobPath: string;
  contentType: string;
};

@Injectable()
export class AppAnalysisStorageService {
  private readonly logger = new Logger(AppAnalysisStorageService.name);
  private readonly config = this.resolveConfig();
  private containerEnsured = false;

  async storeJsonArtifact(args: {
    projectId: string;
    appId: string;
    artifactId: string;
    kind:
      | "contrib_inventory"
      | "contrib_catalog"
      | "contrib_evidence"
      | "flow_contract"
      | "trigger_binding_plan"
      | "trigger_binding_result"
      | "subflow_extraction_plan"
      | "subflow_extraction_result"
      | "subflow_inlining_plan"
      | "subflow_inlining_result"
      | "iterator_plan"
      | "iterator_result"
      | "retry_policy_plan"
      | "retry_policy_result"
      | "dowhile_plan"
      | "dowhile_result"
      | "error_path_plan"
      | "error_path_result"
      | "run_trace_plan"
      | "run_trace"
      | "replay_plan"
      | "replay_report"
      | "run_comparison_plan"
      | "run_comparison"
      | "mapping_preview"
      | "mapping_test"
      | "property_plan"
      | "descriptor"
      | "governance_report"
      | "composition_compare";
    payload: Record<string, unknown>;
  }): Promise<StoredJsonArtifact> {
    if (!this.config) {
      throw new Error("App analysis storage is not configured");
    }

    await this.ensureContainer();

    const blobPath = `app-analysis/${args.projectId}/${args.appId}/${args.kind}/${args.artifactId}.json`;
    const body = JSON.stringify(args.payload, null, 2);
    const url = this.buildBlobUrl(blobPath);
    const headers = this.createBaseHeaders(Buffer.byteLength(body).toString());
    headers.set("x-ms-blob-type", "BlockBlob");
    headers.set("Content-Type", "application/json");
    headers.set("Authorization", this.buildAuthorizationHeader("PUT", url, headers));

    const response = await fetch(url.toString(), {
      method: "PUT",
      headers,
      body
    });

    if (!response.ok) {
      const message = await response.text();
      this.logger.error(`Failed to upload app-analysis artifact ${blobPath}: ${message}`);
      throw new Error(`Failed to upload app-analysis artifact ${blobPath}: ${response.status}`);
    }

    return {
      uri: url.toString(),
      blobPath,
      contentType: "application/json"
    };
  }

  async loadJsonArtifact(blobPath: string): Promise<Record<string, unknown>> {
    if (!this.config) {
      throw new Error("App analysis storage is not configured");
    }

    await this.ensureContainer();

    const url = this.buildBlobUrl(blobPath);
    const headers = this.createBaseHeaders("0");
    headers.set("Authorization", this.buildAuthorizationHeader("GET", url, headers));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers
    });

    if (!response.ok) {
      const message = await response.text();
      this.logger.error(`Failed to load app-analysis artifact ${blobPath}: ${message}`);
      throw new Error(`Failed to load app-analysis artifact ${blobPath}: ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private resolveConfig(): BlobStorageConfig | undefined {
    const connectionString =
      process.env.APP_ANALYSIS_STORAGE_CONNECTION_STRING ??
      process.env.AZURITE_CONNECTION_STRING ??
      process.env.DURABLE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      return undefined;
    }

    const containerName = process.env.APP_ANALYSIS_STORAGE_CONTAINER ?? "flogo-analysis";
    if (connectionString.trim().toLowerCase() === "usedevelopmentstorage=true") {
      return {
        accountName: azuriteAccountName,
        accountKey: azuriteAccountKey,
        blobEndpoint: (process.env.APP_ANALYSIS_BLOB_ENDPOINT ?? "http://127.0.0.1:10000/devstoreaccount1").replace(/\/$/, ""),
        containerName
      };
    }

    const parts = Object.fromEntries(
      connectionString
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [key, ...rest] = entry.split("=");
          return [key, rest.join("=")];
        })
    );

    const accountName = parts.AccountName;
    const accountKey = parts.AccountKey;
    if (!accountName || !accountKey) {
      return undefined;
    }

    const blobEndpoint =
      parts.BlobEndpoint ??
      `${parts.DefaultEndpointsProtocol ?? "https"}://${accountName}.blob.${parts.EndpointSuffix ?? "core.windows.net"}`;

    return {
      accountName,
      accountKey,
      blobEndpoint: blobEndpoint.replace(/\/$/, ""),
      containerName
    };
  }

  private async ensureContainer() {
    if (this.containerEnsured || !this.config) {
      return;
    }

    const url = new URL(`${this.config.blobEndpoint}/${this.config.containerName}`);
    url.searchParams.set("restype", "container");
    const headers = this.createBaseHeaders("0");
    headers.set("Authorization", this.buildAuthorizationHeader("PUT", url, headers));

    const response = await fetch(url.toString(), {
      method: "PUT",
      headers
    });

    if (!response.ok && response.status !== 409) {
      const message = await response.text();
      this.logger.error(`Failed to ensure container ${this.config.containerName}: ${message}`);
      throw new Error(`Failed to ensure app-analysis container ${this.config.containerName}: ${response.status}`);
    }

    this.containerEnsured = true;
  }

  private buildBlobUrl(blobPath: string) {
    if (!this.config) {
      throw new Error("App analysis storage is not configured");
    }

    return new URL(`${this.config.blobEndpoint}/${this.config.containerName}/${encodeBlobPath(blobPath)}`);
  }

  private createBaseHeaders(contentLength: string) {
    const headers = new Headers();
    headers.set("x-ms-date", new Date().toUTCString());
    headers.set("x-ms-version", storageApiVersion);
    headers.set("x-ms-client-request-id", randomUUID());
    headers.set("Content-Length", contentLength);
    return headers;
  }

  private buildAuthorizationHeader(method: string, url: URL, headers: Headers) {
    if (!this.config) {
      throw new Error("App analysis storage is not configured");
    }

    const canonicalizedHeaders = Array.from(headers.entries())
      .filter(([name]) => name.toLowerCase().startsWith("x-ms-"))
      .map(([name, value]) => [name.toLowerCase(), value.trim()] as const)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}:${value}`)
      .join("\n");

    const canonicalizedResource = buildCanonicalizedResource(this.config.accountName, url);
    const contentLength = headers.get("Content-Length");
    const stringToSign = [
      method.toUpperCase(),
      "",
      "",
      contentLength && contentLength !== "0" ? contentLength : "",
      "",
      headers.get("Content-Type") ?? "",
      "",
      "",
      "",
      "",
      "",
      "",
      canonicalizedHeaders,
      canonicalizedResource
    ].join("\n");

    const signature = createHmac("sha256", Buffer.from(this.config.accountKey, "base64"))
      .update(stringToSign, "utf8")
      .digest("base64");

    return `SharedKey ${this.config.accountName}:${signature}`;
  }
}

function buildCanonicalizedResource(accountName: string, url: URL) {
  const querySegments = Array.from(url.searchParams.keys())
    .sort()
    .map((key) => {
      const values = url.searchParams.getAll(key).sort();
      return `${key.toLowerCase()}:${values.join(",")}`;
    });

  const base = `/${accountName}${url.pathname}`;
  return querySegments.length > 0 ? `${base}\n${querySegments.join("\n")}` : base;
}

function encodeBlobPath(blobPath: string) {
  return blobPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
