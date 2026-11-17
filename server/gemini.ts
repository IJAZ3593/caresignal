import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import { WebSocketServer, type WebSocket } from 'ws';
import { extractMapsGroundingPlaces, type MapsGroundingResponse } from '../src/lib/mapsHelpers';
import { APPOINTMENT_TYPES } from '../src/lib/appointments';
import { loadDatabase } from './store';

const MAPS_GROUNDING_MODEL = 'gemini-4-hydrogen';
const LIVE_VOICE_MODEL = 'gemini-3.8-live';

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'MY_GEMINI_API_KEY' || key.startsWith('REPLACE_')) {
    return null;
  }
  return key;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class GeminiHttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function mapGeminiError(err: unknown): GeminiHttpError {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return new GeminiHttpError(
      429,
      'Gemini API quota limit reached (RESOURCE_EXHAUSTED). Please try again shortly or upgrade your key in Settings > Secrets.'
    );
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return new GeminiHttpError(
      403,
      'Gemini API key could not be verified. Check GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  return new GeminiHttpError(502, `Gemini request failed: ${raw}`);
}

export async function queryMapsGrounding(params: {
  query: string;
  lat?: number;
  lng?: number;
}): Promise<MapsGroundingResponse> {
  const ai = createGeminiClient();
  if (!ai) {
    throw new GeminiHttpError(
      503,
      'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.'
    );
  }

  const sanitizedQuery = params.query
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  if (!sanitizedQuery) {
    throw new GeminiHttpError(400, 'Please enter a clinic or pharmacy location query.');
  }

  const hasValidCoords =
    typeof params.lat === 'number' &&
    typeof params.lng === 'number' &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng) &&
    Math.abs(params.lat) <= 90 &&
    Math.abs(params.lng) <= 180;

  try {
    const response = await ai.models.generateContent({
      model: MAPS_GROUNDING_MODEL,
      contents: sanitizedQuery,
      config: {
        systemInstruction:
          'You are a concise clinic and pharmacy navigation assistant for CareSignal. Help users locate pharmacies, vaccination centers, clinics, or transit options using Google Maps grounding. Keep guidance factual and operational; never diagnose or give medical advice.',
        tools: [{ googleMaps: {} }],
        ...(hasValidCoords
          ? {
              toolConfig: {
                retrievalConfig: {
                  latLng: {
                    latitude: params.lat!,
                    longitude: params.lng!,
                  },
                },
              },
            }
          : {}),
      },
    });

    const answerText = (response.text ?? '').trim() || 'Here are the grounded locations found via Google Maps.';
    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const places = extractMapsGroundingPlaces(rawChunks);

    return {
      answerText,
      places,
    };
  } catch (err) {
    throw mapGeminiError(err);
  }
}

function buildVoiceSystemInstruction(): string {
  const db = loadDatabase();
  const openSlots = db.appointmentSlots
    .filter((s) => s.status === 'open')
    .slice(0, 10)
    .map((s) => `${s.date} at ${s.time} with ${s.clinicianLabel} (${s.allowedTypes.join(', ')})`)
    .join('; ');

  return [
    `You are the CareSignal real-time voice scheduling helper for ${db.settings.clinicName}.`,
    `Clinic details: Phone ${db.settings.phone}, Address ${db.settings.address}, Hours ${db.settings.hours}.`,
    `Allowed non-diagnostic visit types: ${APPOINTMENT_TYPES.join(', ')}.`,
    `Current open clinic schedule slots: ${openSlots || 'None currently published — advise calling the front desk.'}.`,
    'Strict safety boundaries:',
    '1. Only help callers navigate visit types, check published open slots above, or find the clinic hours/address.',
    '2. NEVER diagnose, interpret symptoms, recommend treatments/medications, or invent unlisted slots.',
    '3. If someone describes an emergency (chest pain, trouble breathing, severe bleeding), immediately tell them to call 911.',
    '4. Keep spoken responses warm, natural, and concise (2 to 3 sentences per turn).',
  ].join('\n');
}

export function attachLiveVoiceServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname !== '/api/live-voice') {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    const ai = createGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          message:
            'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.',
        })
      );
      clientWs.close();
      return;
    }

    let closed = false;
    let sessionRef: Awaited<ReturnType<typeof ai.live.connect>> | null = null;

    const sendSafe = (payload: Record<string, unknown>) => {
      if (!closed && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    try {
      const session = await ai.live.connect({
        model: LIVE_VOICE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
          systemInstruction: buildVoiceSystemInstruction(),
        },
        callbacks: {
          onopen: () => {
            sendSafe({ type: 'ready', model: LIVE_VOICE_MODEL });
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              sendSafe({
                type: 'inputTranscript',
                text: content.inputTranscription.text,
              });
            }
            if (content?.outputTranscription?.text) {
              sendSafe({
                type: 'outputTranscript',
                text: content.outputTranscription.text,
              });
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendSafe({
                  type: 'audio',
                  audio: part.inlineData.data,
                });
              }
            }
            if (content?.interrupted) {
              sendSafe({ type: 'interrupted' });
            }
            if (content?.turnComplete) {
              sendSafe({ type: 'turnComplete' });
            }
          },
          onerror: (err) => {
            const mapped = mapGeminiError(err);
            sendSafe({ type: 'error', message: mapped.message });
          },
          onclose: () => {
            if (!closed) {
              closed = true;
              clientWs.close();
            }
          },
        },
      });

      sessionRef = session;

      clientWs.on('message', (raw) => {
        if (closed || !sessionRef) return;
        try {
          const parsed = JSON.parse(raw.toString()) as {
            audio?: string;
            text?: string;
          };
          if (typeof parsed.audio === 'string' && parsed.audio.length > 0) {
            sessionRef.sendRealtimeInput({
              audio: {
                data: parsed.audio,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
            sessionRef.sendRealtimeInput({
              text: parsed.text.trim().slice(0, 400),
            });
          }
        } catch {
          // Ignore malformed client audio frames
        }
      });

      clientWs.on('close', () => {
        closed = true;
        try {
          sessionRef?.close();
        } catch {
          // Ignore close cleanup errors
        }
      });

      clientWs.on('error', () => {
        closed = true;
        try {
          sessionRef?.close();
        } catch {
          // Ignore close cleanup errors
        }
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      sendSafe({ type: 'error', message: mapped.message });
      closed = true;
      clientWs.close();
    }
  });
}
