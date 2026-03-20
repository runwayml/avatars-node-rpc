import type { LiveKitCredentials } from './types.js';

const DEFAULT_BASE_URL = 'https://api.dev.runwayml.com';

export async function connectBackend(
  apiKey: string,
  sessionId: string,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<LiveKitCredentials> {
  const url = `${baseUrl}/v1/realtime_sessions/${sessionId}/connect_backend`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': '2024-11-06',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to connect backend: ${response.status} ${errorText}`,
    );
  }

  return response.json() as Promise<LiveKitCredentials>;
}
