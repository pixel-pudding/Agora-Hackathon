'use client';

type BotAudioVisualizerProps = {
  isSpeaking: boolean;
  botName?: string;
};

export function BotAudioVisualizer({
  isSpeaking,
  botName = 'EchoOps Copilot',
}: BotAudioVisualizerProps) {
  const barHeights = ['h-3', 'h-6', 'h-9', 'h-5', 'h-3'];

  return (
    <div
      className="flex h-24 w-48 flex-col items-center justify-center gap-3"
      role="img"
      aria-label={`${botName} is ${isSpeaking ? 'speaking' : 'listening'}`}
    >
      <div className="flex h-12 items-center gap-1.5" aria-hidden="true">
        {barHeights.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className={`${height} w-1.5 origin-center rounded-sm transition-colors duration-300 ${isSpeaking ? 'animate-[equalizer_1100ms_ease-in-out_infinite] bg-emerald-500' : 'bg-slate-800'}`}
            style={{ animationDelay: `${index * 120}ms` }}
          />
        ))}
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-900 px-3 py-1 text-xs font-medium text-muted-foreground">
        <span
          className={`h-1.5 w-1.5 rounded-full ${isSpeaking ? 'bg-emerald-500' : 'bg-slate-600'}`}
          aria-hidden="true"
        />
        {botName}: {isSpeaking ? 'Speaking...' : 'Listening'}
      </span>
    </div>
  );
}
