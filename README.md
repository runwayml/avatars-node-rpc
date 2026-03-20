# @runwayml/avatars-node-rpc

Node.js handler for backend RPC tool calls in [Runway](https://runwayml.com) avatar sessions.

This package joins a LiveKit room as a hidden participant and dispatches incoming tool call requests from the avatar worker to your handler functions via LiveKit RPC.

## Installation

```bash
npm install @runwayml/avatars-node-rpc
```

Requires Node.js 18 or later.

## Usage

### With API key and session ID

The package calls the `/connect_backend` endpoint and joins the room automatically:

```typescript
import { createRpcHandler } from '@runwayml/avatars-node-rpc';

const handler = await createRpcHandler({
  apiKey: process.env.RUNWAYML_API_SECRET!,
  sessionId: 'your-session-id',
  tools: {
    lookup_trivia: async (args) => {
      const question = await db.getRandomQuestion(args.category as string);
      return { question: question.text, options: question.choices };
    },
  },
  onConnected: () => console.log('Connected to session'),
  onDisconnected: () => console.log('Session ended'),
  onError: (err) => console.error('RPC error:', err),
});

await handler.close();
```

### With pre-fetched credentials

If you already called `/connect_backend` yourself:

```typescript
const handler = await createRpcHandler({
  credentials: {
    url: 'wss://livekit.example.com',
    token: '<jwt>',
    roomName: '<session-id>',
  },
  tools: {
    lookup_trivia: async (args) => {
      return { answer: 'The mitochondria is the powerhouse of the cell' };
    },
  },
});
```

## API

### `createRpcHandler(options): Promise<RpcHandler>`

Connects to a LiveKit room and starts handling tool call requests.

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `apiKey` | `string` | Runway API key. Required if `credentials` is not provided. |
| `sessionId` | `string` | Session ID. Required if `credentials` is not provided. |
| `baseUrl` | `string` | Base URL for the Runway API. Defaults to `https://api.dev.runwayml.com`. |
| `credentials` | `{ url, token, roomName }` | Pre-fetched LiveKit credentials. Alternative to `apiKey` + `sessionId`. |
| `tools` | `Record<string, ToolHandler>` | Tool handler functions keyed by tool name. |
| `onConnected` | `() => void` | Called when connected to the LiveKit room. |
| `onDisconnected` | `() => void` | Called when disconnected. |
| `onError` | `(error: Error) => void` | Called on errors (handler exceptions, publish failures). |

**`ToolHandler`:** `(args: Record<string, unknown>) => Promise<Record<string, unknown>>`

Each tool handler receives the arguments from the LLM and returns a result object. If a handler throws, the error message is sent back to the worker so it doesn't hang until timeout.

### `RpcHandler`

| Property/Method | Type | Description |
|-----------------|------|-------------|
| `close()` | `Promise<void>` | Disconnect from the room and clean up. |
| `connected` | `boolean` | Whether currently connected to the room. |

## License

MIT
