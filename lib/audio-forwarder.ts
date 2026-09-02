type ForwardPayload = {
  // If raw audio is available it can be included here (base64 or multipart in future).
  audio_stream?: unknown;
  text?: string;
  speaker_id?: string | number;
  channel?: string;
  ts?: number;
  [k: string]: unknown;
};

export async function forwardToAditi(payload: ForwardPayload) {
  const url = process.env.ADITI_PIPELINE_URL;
  if (!url) {
    // Fallback: log and return success for development.
    // Keep the same shape the production pipeline would expect.
    console.log('[audio-forwarder] ADITI_PIPELINE_URL not set — payload:', payload);
    return { forwarded: false, reason: 'ADITI_PIPELINE_URL not set' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return { forwarded: true, status: res.status, body: text };
  } catch (error) {
    console.error('[audio-forwarder] failed to forward to ADITI:', error);
    return { forwarded: false, error: (error as Error).message };
  }
}
