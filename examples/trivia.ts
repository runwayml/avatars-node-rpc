/**
 * Trivia host example: a single backend_rpc tool that returns trivia questions.
 *
 * The avatar acts as a trivia host. When the user asks for a question,
 * the avatar calls `lookup_trivia` which is handled by this backend process.
 *
 * Environment variables:
 *   RUNWAYML_API_SECRET  — Runway API key (required)
 *   RUNWAY_AVATAR_ID     — Avatar ID (required)
 *   RUNWAY_BASE_URL      — API base URL (optional, defaults to https://api.dev.runwayml.com)
 *
 * Usage:
 *   RUNWAYML_API_SECRET=... RUNWAY_AVATAR_ID=... npx tsx examples/trivia.ts
 *
 * Then open http://localhost:3000 in your browser, enable your microphone,
 * and ask the avatar for a trivia question.
 */

import { createServer } from 'node:http';
import { createRpcHandler } from '../src/index.js';

const API_KEY = requireEnv('RUNWAYML_API_SECRET');
const AVATAR_ID = requireEnv('RUNWAY_AVATAR_ID');
const BASE_URL = process.env.RUNWAY_BASE_URL ?? 'https://api.dev.runwayml.com';

const API_VERSION = '2024-11-06';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;
const FRONTEND_PORT = 3_000;

async function main() {
  const sessionId = await createSession();
  console.log(`Session created: ${sessionId}`);

  const { sessionKey } = await pollUntilReady(sessionId);
  console.log('Session ready');

  const frontendCreds = await consumeSession(sessionId, sessionKey);

  const handler = await createRpcHandler({
    apiKey: API_KEY,
    sessionId,
    baseUrl: BASE_URL,
    tools: {
      lookup_trivia: async (args) => {
        console.log('[lookup_trivia] called with:', JSON.stringify(args));
        return {
          question: 'What is the powerhouse of the cell?',
          options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi apparatus'],
          answer: 'Mitochondria',
        };
      },
    },
    onConnected: () => console.log('Backend RPC handler connected'),
    onDisconnected: () => {
      console.log('Disconnected');
      process.exit(0);
    },
    onError: (err) => console.error('Error:', err.message),
  });

  startFrontendServer(frontendCreds);
  console.log(`\nFrontend: http://localhost:${FRONTEND_PORT}`);
  console.log('Ask the avatar for a trivia question to trigger the tool call.\n');

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await handler.close();
    process.exit(0);
  });
}


function apiHeaders(auth: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${auth}`,
    'X-Runway-Version': API_VERSION,
  };
}

async function createSession(): Promise<string> {
  const response = await fetch(`${BASE_URL}/v1/realtime_sessions`, {
    method: 'POST',
    headers: apiHeaders(API_KEY),
    body: JSON.stringify({
      model: 'gwm1_avatars',
      avatar: { type: 'custom', avatarId: AVATAR_ID },
      instructions:
        'You are a trivia host. When the user asks for a trivia question, ' +
        'call the lookup_trivia tool to get one, then present it to the user.',
      tools: [
        {
          type: 'backend_rpc',
          name: 'lookup_trivia',
          description: 'Look up a trivia question from the database',
          parameters: [
            { name: 'category', type: 'string', description: 'Question category' },
          ],
          timeoutSeconds: 8,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Create session failed: ${response.status} ${await response.text()}`);
  }

  return ((await response.json()) as { id: string }).id;
}

async function pollUntilReady(sessionId: string) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await fetch(`${BASE_URL}/v1/realtime_sessions/${sessionId}`, {
      headers: apiHeaders(API_KEY),
    });

    if (!response.ok) {
      throw new Error(`Get session failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { status: string; sessionKey: string };

    if (data.status === 'READY' || data.status === 'RUNNING') {
      return data;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Session not ready within ${POLL_TIMEOUT_MS / 1_000}s`);
}

async function consumeSession(sessionId: string, sessionKey: string) {
  const response = await fetch(`${BASE_URL}/v1/realtime_sessions/${sessionId}/consume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Consume session failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as { url: string; token: string; roomName: string };
}


function startFrontendServer(creds: { url: string; token: string; roomName: string }) {
  const html = buildFrontendHtml(creds);
  createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }).listen(FRONTEND_PORT);
}

function buildFrontendHtml(creds: { url: string; token: string; roomName: string }): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Runway Avatar — Backend RPC Example</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e4e4e7;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 32px 16px;
      gap: 20px;
    }
    h1 { font-size: 18px; font-weight: 500; color: #a1a1aa; }
    #status {
      font-size: 13px;
      padding: 6px 14px;
      border-radius: 6px;
      background: #18181b;
      color: #71717a;
    }
    #status.connected { background: #052e16; color: #4ade80; }
    #status.error { background: #450a0a; color: #f87171; }
    #video-container {
      width: 640px;
      max-width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
      border-radius: 10px;
      overflow: hidden;
    }
    #video-container video { width: 100%; height: 100%; object-fit: cover; }
    #mic-btn {
      padding: 10px 28px;
      font-size: 14px;
      border: none;
      border-radius: 6px;
      background: #3b82f6;
      color: #fff;
      cursor: pointer;
    }
    #mic-btn:hover { background: #2563eb; }
    #mic-btn.active { background: #dc2626; }
    #mic-btn:disabled { opacity: 0.4; cursor: default; }
    #transcript {
      width: 640px;
      max-width: 100%;
      max-height: 240px;
      overflow-y: auto;
      background: #18181b;
      border-radius: 8px;
      padding: 14px;
      font-size: 13px;
      line-height: 1.7;
    }
    .t-user { color: #a1a1aa; }
    .t-assistant { color: #e4e4e7; }
    .t-system { color: #71717a; font-style: italic; }
  </style>
</head>
<body>
  <h1>Runway Avatar — Backend RPC Example</h1>
  <div id="status">Connecting…</div>
  <div id="video-container"></div>
  <button id="mic-btn" disabled>Enable Microphone</button>
  <div id="transcript"></div>

  <script src="https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js"></script>
  <script>
    const CREDS = ${JSON.stringify(creds).replace(/</g, '\\u003c')};
    const statusEl  = document.getElementById('status');
    const videoEl   = document.getElementById('video-container');
    const micBtn    = document.getElementById('mic-btn');
    const transcript = document.getElementById('transcript');
    let micOn = false;

    function append(text, cls) {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      transcript.appendChild(d);
      transcript.scrollTop = transcript.scrollHeight;
    }

    (async () => {
      const room = new LivekitClient.Room();

      room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        const el = track.attach();
        if (track.kind === LivekitClient.Track.Kind.Video) {
          el.style.width = '100%';
          el.style.height = '100%';
          videoEl.appendChild(el);
        } else {
          el.style.display = 'none';
          document.body.appendChild(el);
        }
      });

      room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach(el => el.remove());
      });

      room.on(LivekitClient.RoomEvent.DataReceived, (payload) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          if (msg.type === 'transcription') {
            append(msg.role + ': ' + msg.text, 't-' + msg.role);
          }
        } catch {}
      });

      room.on(LivekitClient.RoomEvent.Disconnected, () => {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'error';
        micBtn.disabled = true;
        append('Session ended.', 't-system');
      });

      try {
        await room.connect(CREDS.url, CREDS.token);
        statusEl.textContent = 'Connected';
        statusEl.className = 'connected';
        micBtn.disabled = false;
        append('Connected — enable your mic and ask for a trivia question.', 't-system');
      } catch (err) {
        statusEl.textContent = 'Failed: ' + err.message;
        statusEl.className = 'error';
        return;
      }

      micBtn.onclick = async () => {
        micOn = !micOn;
        await room.localParticipant.setMicrophoneEnabled(micOn);
        micBtn.textContent = micOn ? 'Mute Microphone' : 'Enable Microphone';
        micBtn.className = micOn ? 'active' : '';
      };
    })();
  </script>
</body>
</html>`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
