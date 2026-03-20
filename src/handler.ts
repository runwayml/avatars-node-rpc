import { Room, RoomEvent } from '@livekit/rtc-node';
import { connectBackend } from './api.js';
import { parseToolRequest, serializeToolResponse } from './protocol.js';
import type { CreateRpcHandlerOptions, RpcHandler } from './types.js';

export async function createRpcHandler(
  options: CreateRpcHandlerOptions,
): Promise<RpcHandler> {
  const { tools, onConnected, onDisconnected, onError } = options;

  const credentials = options.credentials
    ? options.credentials
    : await resolveCredentials(options);

  const room = new Room();

  room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
    const request = parseToolRequest(payload);
    if (!request) return;

    void handleToolRequest(request.request_id, request.tool_name, request.data);
  });

  room.on(RoomEvent.Disconnected, () => {
    onDisconnected?.();
  });

  await room.connect(credentials.url, credentials.token);

  if (!room.localParticipant) {
    throw new Error('LocalParticipant not available after connect');
  }
  const localParticipant = room.localParticipant;

  onConnected?.();

  async function handleToolRequest(
    requestId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) {
    let responseData: Record<string, unknown>;

    try {
      const handler = tools[toolName];
      if (!handler) {
        responseData = { error: `Unknown tool: ${toolName}` };
      } else {
        responseData = await handler(args);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      responseData = { error: message };
      onError?.(err instanceof Error ? err : new Error(message));
    }

    try {
      await localParticipant.publishData(
        serializeToolResponse(requestId, responseData),
        { reliable: true },
      );
    } catch (err) {
      const publishError = err instanceof Error ? err : new Error(String(err));
      onError?.(publishError);
    }
  }

  return {
    async close() {
      await room.disconnect();
    },
    get connected() {
      return room.isConnected;
    },
  };
}

async function resolveCredentials(options: CreateRpcHandlerOptions) {
  if (!options.apiKey || !options.sessionId) {
    throw new Error(
      'Either "credentials" or both "apiKey" and "sessionId" must be provided',
    );
  }
  return connectBackend(options.apiKey, options.sessionId, options.baseUrl);
}
