import { Room, RoomEvent, RpcError } from '@livekit/rtc-node';
import type { RpcInvocationData } from '@livekit/rtc-node';
import { connectBackend } from './api.js';
import type { CreateRpcHandlerOptions, RpcHandler } from './types.js';

export async function createRpcHandler(
  options: CreateRpcHandlerOptions,
): Promise<RpcHandler> {
  const { tools, onConnected, onDisconnected, onError } = options;

  const credentials = options.credentials
    ? options.credentials
    : await resolveCredentials(options);

  const room = new Room();

  room.on(RoomEvent.Disconnected, () => {
    onDisconnected?.();
  });

  await room.connect(credentials.url, credentials.token);

  if (!room.localParticipant) {
    throw new Error('LocalParticipant not available after connect');
  }
  const localParticipant = room.localParticipant;

  for (const toolName of Object.keys(tools)) {
    localParticipant.registerRpcMethod(toolName, async (data: RpcInvocationData) => {
      if (!data.callerIdentity.startsWith('worker:')) {
        throw new RpcError(
          RpcError.ErrorCode.APPLICATION_ERROR,
          `Unauthorized caller: ${data.callerIdentity}`,
        );
      }

      if (options.debug) {
        console.log(`[avatars-node] RPC "${toolName}" from ${data.callerIdentity}:`, data.payload);
      }

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(data.payload);
      } catch {
        throw new RpcError(
          RpcError.ErrorCode.APPLICATION_ERROR,
          'Invalid JSON payload',
        );
      }

      try {
        const result = await tools[toolName](args);
        return JSON.stringify(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError?.(err instanceof Error ? err : new Error(message));
        throw new RpcError(RpcError.ErrorCode.APPLICATION_ERROR, message);
      }
    });
  }

  if (options.debug) {
    console.log(`[avatars-node] Local identity: ${localParticipant.identity}`);
    console.log(`[avatars-node] Registered RPC methods: ${Object.keys(tools).join(', ')}`);
    console.log(`[avatars-node] Remote participants: ${[...room.remoteParticipants.keys()].join(', ') || '(none)'}`);
  }

  onConnected?.();

  return {
    async close() {
      for (const toolName of Object.keys(tools)) {
        localParticipant.unregisterRpcMethod(toolName);
      }
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
