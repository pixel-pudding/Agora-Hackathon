import { NextRequest, NextResponse } from 'next/server';
import {
  startCloudRecording,
  stopCloudRecording,
  getRecordingStatus,
} from '@/lib/agoraRecording';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelName = searchParams.get('channel') || 'echoops-war-room';
  const status = getRecordingStatus(channelName);
  return NextResponse.json({
    channelName,
    isRecording: Boolean(status && status.status === 'recording'),
    session: status,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      channelName?: string;
      action: 'start' | 'stop';
      recordingUid?: string;
    };

    const channelName = body.channelName || 'echoops-war-room';
    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID || 'dummy_app_id';
    const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
    const recordingUid = body.recordingUid || '999999';

    if (body.action === 'start') {
      let token = '';
      if (appCertificate && appId !== 'dummy_app_id') {
        const expirationTime = Math.floor(Date.now() / 1000) + 3600;
        token = RtcTokenBuilder.buildTokenWithRtm(
          appId,
          appCertificate,
          channelName,
          recordingUid,
          RtcRole.PUBLISHER,
          expirationTime,
          expirationTime,
        );
      }

      const session = await startCloudRecording(appId, channelName, token, recordingUid);
      return NextResponse.json({
        success: true,
        action: 'start',
        session,
      });
    }

    if (body.action === 'stop') {
      const session = await stopCloudRecording(appId, channelName);
      return NextResponse.json({
        success: true,
        action: 'stop',
        session,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in /api/recording:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to manage recording' },
      { status: 500 },
    );
  }
}
