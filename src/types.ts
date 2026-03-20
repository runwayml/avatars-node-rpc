export interface LiveKitCredentials {
  url: string;
  token: string;
  roomName: string;
}

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export interface CreateRpcHandlerOptions {
  /** Runway API key (required if credentials not provided) */
  apiKey?: string;
  /** Session ID (required if credentials not provided) */
  sessionId?: string;
  /** Base URL for the Runway API */
  baseUrl?: string;
  /** Pre-fetched LiveKit credentials (alternative to apiKey + sessionId) */
  credentials?: LiveKitCredentials;
  /** Tool handler functions keyed by tool name */
  tools: Record<string, ToolHandler>;
  /** Called when connected to the LiveKit room */
  onConnected?: () => void;
  /** Called when disconnected */
  onDisconnected?: () => void;
  /** Called on errors */
  onError?: (error: Error) => void;
  /** Log all data channel messages for debugging */
  debug?: boolean;
}

export interface RpcHandler {
  /** Disconnect from the room and clean up */
  close(): Promise<void>;
  /** Whether currently connected */
  readonly connected: boolean;
}
