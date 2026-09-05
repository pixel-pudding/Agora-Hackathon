export type AiTurnMetrics = {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  t_llm: number;
  t_total: number;
};

type AiTurnMetricMarks = {
  t0: number;
  t1?: number;
  t2?: number;
  t3?: number;
};

function timestamp(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function startAiTurn(): {
  markLlmRequest: () => void;
  markLlmReady: () => void;
  markSpeakTriggered: () => AiTurnMetrics;
} {
  const marks: AiTurnMetricMarks = { t0: timestamp() };

  return {
    markLlmRequest: () => {
      marks.t1 = timestamp();
    },
    markLlmReady: () => {
      marks.t2 = timestamp();
    },
    markSpeakTriggered: () => {
      const t3 = timestamp();
      marks.t3 = t3;
      const t1 = marks.t1 ?? marks.t0;
      const t2 = marks.t2 ?? t3;
      const metrics: AiTurnMetrics = {
        t0: marks.t0,
        t1,
        t2,
        t3,
        t_llm: Math.max(0, t2 - t1),
        t_total: Math.max(0, t3 - marks.t0),
      };

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[EchoOps AI metrics]', {
          t_llm: `${Math.round(metrics.t_llm)} ms`,
          t_total: `${Math.round(metrics.t_total)} ms`,
        });
      }

      return metrics;
    },
  };
}