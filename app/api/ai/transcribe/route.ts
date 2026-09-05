import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as Blob | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file uploaded' }, { status: 400 });
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (openAiKey) {
      const openAiFormData = new FormData();
      openAiFormData.append('file', audioFile, 'recording.webm');
      openAiFormData.append('model', 'whisper-1');
      openAiFormData.append('language', 'en');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiKey}`,
        },
        body: openAiFormData,
      });

      if (whisperRes.ok) {
        const whisperData = (await whisperRes.json()) as { text?: string };
        return NextResponse.json({
          text: whisperData.text || '',
          source: 'whisper',
        });
      }
    }

    return NextResponse.json({
      text: '',
      error: 'Audio received, but Whisper/STT API key is not configured in environment.',
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to transcribe audio' },
      { status: 500 },
    );
  }
}
