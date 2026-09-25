import { buildNamespaces, type AgentGraphNamespaces } from "./api.js";
import { CONTRACT_API_VERSION } from "./generated/openapi.js";
import { createTransport, type RequestOptions, type Transport, type TransportOptions } from "./transport.js";

export type {
  AgentGraphNamespaces,
  ChatMessageRequest,
  CreateGraphRequest,
  CreatePolicyExceptionRequest,
  DatasetFromRunsRequest,
  ExtractSubgraphRequest,
  ImpactRequest,
  KnowledgeLineageRequest,
  PolicyRules,
  PublishReleaseRequest,
  ReleaseRunRequest,
  ResumeRunRequest,
  RoutingCompareReleaseRequest,
  RoutingCompareRequest,
  RoutingDatasetRequest,
  RunHandle,
  RunListRequest,
  StartRunRequest,
  UpdatePolicyExceptionRequest,
} from "./api.js";

/** SDK 1/7: transport options (injectable fetch, headers/auth, timeout,
 * retries, hooks) -- see transport.ts. SDK 3/7 adds `onVersionSkew`: called
 * (once per client) when the server's API version is ahead of the contract
 * this SDK was generated from; defaults to a console warning. Pass `false`
 * to silence it. */
export type AgentGraphClientOptions = TransportOptions & {
  onVersionSkew?: ((skew: VersionSkew) => void) | false;
};

export type VersionSkew = { serverVersion: string; clientVersion: string };

/** True when `server` is ahead of `client` by major or minor (x.y.z). */
export function isServerAhead(server: string, client: string): boolean {
  const parse = (version: string) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [sMajor, sMinor] = parse(server);
  const [cMajor, cMinor] = parse(client);
  return sMajor > cMajor || (sMajor === cMajor && sMinor > cMinor);
}

/**
 * The API client: one namespace per area (`graphs`, `runs`, `releases`,
 * `policies`, `routingLab`, `knowledge`, `analytics`, `providers`,
 * `runtimeTargets`, and the resource kinds). The flat methods deprecated in
 * SDK 4/7 were removed in 1.0.
 */
export type AgentGraphClient = AgentGraphNamespaces & {
  /** The same client with per-call options applied to every call made
   * through it -- e.g. `client.with({ signal }).graphs.get(id)`. */
  with(options: RequestOptions): AgentGraphClient;
};

function scopedClient(transport: Transport): AgentGraphClient {
  const api = buildNamespaces(transport);
  return { ...api, with: (options) => scopedClient(transport.with(options)) };
}

export function createAgentGraphClient(options: AgentGraphClientOptions = {}): AgentGraphClient {
  const { onVersionSkew, ...transportOptions } = options;
  let warned = false;
  const report =
    onVersionSkew === false
      ? undefined
      : (onVersionSkew ??
        ((skew: VersionSkew) =>
          console.warn(
            `[agent-graph-sdk] API server is at ${skew.serverVersion}, ahead of this SDK's contract ${skew.clientVersion}; upgrade the SDK for new fields and routes.`,
          )));
  return scopedClient(
    createTransport({
      ...transportOptions,
      onApiVersion: (serverVersion) => {
        transportOptions.onApiVersion?.(serverVersion);
        if (warned || !report || !isServerAhead(serverVersion, CONTRACT_API_VERSION)) return;
        warned = true;
        report({ serverVersion, clientVersion: CONTRACT_API_VERSION });
      },
    }),
  );
}
