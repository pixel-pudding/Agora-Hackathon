import { NextRequest } from 'next/server';
import { wsHub, EchoOpsWebSocketMessage } from '@/lib/wsHub';
import { getOrCreateIncident } from '@/lib/incidentStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel') || 'echoops-war-room';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial state.update on connect
      const currentIncident = getOrCreateIncident(channel);
      const initialMessage: EchoOpsWebSocketMessage = {
        event: 'state.update',
        timestamp: new Date().toISOString(),
        data: currentIncident,
      };
      controller.enqueue(
        encoder.encode(`event: message\ndata: ${JSON.stringify(initialMessage)}\n\n`),
      );

      // 2. Subscribe to real-time event broadcasts
      const listener = (msg: EchoOpsWebSocketMessage) => {
        try {
          controller.enqueue(
            encoder.encode(`event: message\ndata: ${JSON.stringify(msg)}\n\n`),
          );
        } catch {
          // Stream might be closed by client
        }
      };

      wsHub.on('broadcast', listener);

      // Keep-alive heartbeat every 15 seconds
      const heartbeat = setInterval(() => {
        try {
          const ping: EchoOpsWebSocketMessage = {
            event: 'ping',
            timestamp: new Date().toISOString(),
            data: { status: 'alive' },
          };
          controller.enqueue(
            encoder.encode(`event: ping\ndata: ${JSON.stringify(ping)}\n\n`),
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        wsHub.off('broadcast', listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
