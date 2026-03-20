export interface ToolRequest {
  type: 'tool_event';
  event_type: 'tool_request';
  tool_name: string;
  data: Record<string, unknown>;
  request_id: string;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function parseToolRequest(payload: Uint8Array): ToolRequest | null {
  try {
    const message = JSON.parse(decoder.decode(payload));
    if (
      message?.type === 'tool_event' &&
      message.event_type === 'tool_request' &&
      typeof message.tool_name === 'string' &&
      typeof message.request_id === 'string' &&
      message.data != null &&
      typeof message.data === 'object'
    ) {
      return message as ToolRequest;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeToolResponse(
  requestId: string,
  data: Record<string, unknown>,
): Uint8Array {
  return encoder.encode(
    JSON.stringify({
      type: 'tool_response',
      request_id: requestId,
      data,
    }),
  );
}
