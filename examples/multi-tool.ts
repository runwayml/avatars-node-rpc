/**
 * Multi-tool example: an avatar assistant with multiple backend_rpc tools.
 *
 * The avatar acts as a helpful assistant that can:
 *   - Look up the weather for a city
 *   - Convert between currencies
 *   - Look up a word definition
 *
 * Each tool is handled by a separate function in this backend process.
 *
 * Environment variables:
 *   RUNWAYML_API_SECRET  — Runway API key (required)
 *   RUNWAY_AVATAR_ID     — Avatar ID (required)
 *   RUNWAY_BASE_URL      — API base URL (optional, defaults to https://api.dev.runwayml.com)
 *
 * Usage:
 *   RUNWAYML_API_SECRET=... RUNWAY_AVATAR_ID=... npx tsx examples/multi-tool.ts
 *
 * Then open http://localhost:3000 in your browser, enable your microphone,
 * and ask the avatar about the weather, currency conversion, or word definitions.
 */

import { createServer } from 'node:http';
import { createRpcHandler } from '../src/index.js';

const API_KEY = requireEnv('RUNWAYML_API_SECRET');
const AVATAR_ID = requireEnv('RUNWAY_AVATAR_ID');
const BASE_URL = process.env.RUNWAY_BASE_URL ?? 'https://api.dev-stage.runwayml.com';

const API_VERSION = '2024-11-06';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;
const FRONTEND_PORT = 3_000;


async function getWeather(args: Record<string, unknown>) {
  const city = (args.city as string) ?? 'Unknown';
  console.log(`[get_weather] city=${city}`);

  const weather: Record<string, { temp: number; condition: string }> = {
    'new york': { temp: 72, condition: 'Partly cloudy' },
    'london': { temp: 59, condition: 'Overcast' },
    'tokyo': { temp: 81, condition: 'Sunny' },
    'paris': { temp: 64, condition: 'Light rain' },
    'sydney': { temp: 68, condition: 'Clear skies' },
  };

  const data = weather[city.toLowerCase()] ?? { temp: 70, condition: 'Clear' };

  return {
    city,
    temperature_f: data.temp,
    temperature_c: Math.round((data.temp - 32) * (5 / 9)),
    condition: data.condition,
  };
}

async function convertCurrency(args: Record<string, unknown>) {
  const amount = (args.amount as number) ?? 1;
  const from = ((args.from as string) ?? 'USD').toUpperCase();
  const to = ((args.to as string) ?? 'EUR').toUpperCase();
  console.log(`[convert_currency] ${amount} ${from} → ${to}`);

  const rates: Record<string, number> = {
    'USD-EUR': 0.92,
    'EUR-USD': 1.09,
    'USD-GBP': 0.79,
    'GBP-USD': 1.27,
    'USD-JPY': 149.5,
    'JPY-USD': 0.0067,
    'EUR-GBP': 0.86,
    'GBP-EUR': 1.16,
  };

  const key = `${from}-${to}`;
  const rate = rates[key] ?? 1;

  return {
    from,
    to,
    amount,
    converted: Math.round(amount * rate * 100) / 100,
    rate,
  };
}

async function defineWord(args: Record<string, unknown>) {
  const word = ((args.word as string) ?? '').toLowerCase();
  console.log(`[define_word] word=${word}`);

  const definitions: Record<string, { partOfSpeech: string; definition: string; example: string }> = {
    'serendipity': {
      partOfSpeech: 'noun',
      definition: 'The occurrence of events by chance in a happy or beneficial way.',
      example: 'A fortunate stroke of serendipity led to the discovery.',
    },
    'ephemeral': {
      partOfSpeech: 'adjective',
      definition: 'Lasting for a very short time.',
      example: 'The ephemeral beauty of cherry blossoms.',
    },
    'ubiquitous': {
      partOfSpeech: 'adjective',
      definition: 'Present, appearing, or found everywhere.',
      example: 'Smartphones have become ubiquitous in modern life.',
    },
  };

  const data = definitions[word];

  if (!data) {
    return {
      word,
      found: false,
      message: `No definition found for "${word}". Try serendipity, ephemeral, or ubiquitous.`,
    };
  }

  return { word, found: true, ...data };
}


const TOOLS_CONFIG = [
  {
    type: 'backend_rpc' as const,
    name: 'get_weather',
    description: 'Get the current weather for a city',
    parameters: [
      { name: 'city', type: 'string', description: 'The city name' },
    ],
    timeoutSeconds: 10,
  },
  {
    type: 'backend_rpc' as const,
    name: 'convert_currency',
    description: 'Convert an amount from one currency to another',
    parameters: [
      { name: 'amount', type: 'number', description: 'Amount to convert' },
      { name: 'from', type: 'string', description: 'Source currency code (e.g. USD)' },
      { name: 'to', type: 'string', description: 'Target currency code (e.g. EUR)' },
    ],
    timeoutSeconds: 10,
  },
  {
    type: 'backend_rpc' as const,
    name: 'define_word',
    description: 'Look up the definition of a word',
    parameters: [
      { name: 'word', type: 'string', description: 'The word to define' },
    ],
    timeoutSeconds: 10,
  },
];

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
      get_weather: getWeather,
      convert_currency: convertCurrency,
      define_word: defineWord,
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
  console.log('Try asking:');
  console.log('  "What\'s the weather in Tokyo?"');
  console.log('  "Convert 100 USD to EUR"');
  console.log('  "Define serendipity"\n');

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
        'You are a helpful assistant with access to three tools: weather lookup, ' +
        'currency conversion, and word definitions. Use the appropriate tool when ' +
        'the user asks about any of these topics. Be concise in your responses.',
      tools: TOOLS_CONFIG,
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
  <title>Runway Avatar — Multi-Tool Example</title>
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
  <h1>Runway Avatar — Multi-Tool Example</h1>
  <div id="status">Connecting…</div>
  <div id="video-container"></div>
  <button id="mic-btn" disabled>Enable Microphone</button>
  <div id="transcript"></div>

  <script src="https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js"></script>
  <script>
    const CREDS = ${JSON.stringify(creds)};
    const statusEl   = document.getElementById('status');
    const videoEl    = document.getElementById('video-container');
    const micBtn     = document.getElementById('mic-btn');
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

      room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
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
        append('Connected — try asking about weather, currency, or word definitions.', 't-system');
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
