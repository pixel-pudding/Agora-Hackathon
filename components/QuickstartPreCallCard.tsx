'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type QuickstartPreCallCardProps = {
  isLoading: boolean;
  error: string | null;
  channelName: string;
  onChannelNameChange: (channelName: string) => void;
  onStartConversation: () => void;
};

export function QuickstartPreCallCard({
  isLoading,
  error,
  channelName,
  onChannelNameChange,
  onStartConversation,
}: QuickstartPreCallCardProps) {
  return (
    <div
      className="mx-auto flex w-[min(92vw,26.25rem)] animate-fade-up flex-col items-center rounded-[20px] border border-[#2b2b2b] px-10 py-10 text-center shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
      style={{
        backgroundImage:
          'linear-gradient(164.988deg, rgba(54,54,54,0.2) 1.0596%, rgba(0,0,0,0) 96.089%), linear-gradient(90deg, rgb(16,16,16) 0%, rgb(16,16,16) 100%)',
      }}
    >
      <h1 className="text-[28px] font-medium leading-[1.2] text-white">
        EchoOps Incident Room
      </h1>
      <p className="mt-[14px] text-sm font-medium leading-6 text-muted-foreground">
        Join an incident voice room with the EchoOps assistant.
      </p>

      <label className="mt-8 w-full text-left text-xs font-medium text-muted-foreground">
        Incident room name
        <input
          value={channelName}
          onChange={(event) => onChannelNameChange(event.target.value)}
          placeholder="incident-123"
          maxLength={64}
          autoComplete="off"
          className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          aria-describedby="room-name-help"
        />
      </label>
      <p id="room-name-help" className="mt-2 text-left text-xs text-muted-foreground">
        Use letters, numbers, hyphens, or underscores. Leave blank to create a new room.
      </p>

      <Button
        onClick={onStartConversation}
        disabled={isLoading}
        className="mt-8 h-10 w-full rounded-lg border border-primary bg-primary text-sm font-medium text-black hover:border-white hover:bg-white hover:text-black disabled:hover:border-primary disabled:hover:bg-primary disabled:hover:text-black"
        aria-label={
          isLoading
            ? 'Starting conversation with AI agent'
            : 'Start conversation with AI agent'
        }
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting...
          </>
        ) : (
          'Join Incident Room'
        )}
      </Button>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </div>
  );
}
