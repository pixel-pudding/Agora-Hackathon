import EventEmitter from 'events';
import type {
  IncidentState,
  IncidentActionItem,
  IncidentConflict,
} from '@/types/incident';

export type EchoOpsWebSocketEventType =
  | 'state.update'
  | 'action.assigned'
  | 'conflict.raised'
  | 'summary.spoken'
  | 'ping';

export type EchoOpsWebSocketMessage = {
  event: EchoOpsWebSocketEventType;
  timestamp: string;
  data: unknown;
};

// Global Event Emitter singleton across the Next.js runtime
class WebSocketEventHub extends EventEmitter {
  private static instance: WebSocketEventHub;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  public static getInstance(): WebSocketEventHub {
    if (!WebSocketEventHub.instance) {
      WebSocketEventHub.instance = new WebSocketEventHub();
    }
    return WebSocketEventHub.instance;
  }

  public broadcastStateUpdate(incident: IncidentState): void {
    this.emit('broadcast', {
      event: 'state.update',
      timestamp: new Date().toISOString(),
      data: incident,
    });
  }

  public broadcastActionAssigned(action: IncidentActionItem, incidentTitle: string): void {
    this.emit('broadcast', {
      event: 'action.assigned',
      timestamp: new Date().toISOString(),
      data: { action, incidentTitle },
    });
  }

  public broadcastConflictRaised(conflict: IncidentConflict): void {
    this.emit('broadcast', {
      event: 'conflict.raised',
      timestamp: new Date().toISOString(),
      data: conflict,
    });
  }

  public broadcastSummarySpoken(spokenText: string, incidentId: string): void {
    this.emit('broadcast', {
      event: 'summary.spoken',
      timestamp: new Date().toISOString(),
      data: { spokenText, incidentId },
    });
  }
}

export const wsHub = WebSocketEventHub.getInstance();
