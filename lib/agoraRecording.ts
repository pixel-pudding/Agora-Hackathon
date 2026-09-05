export type RecordingMode = 'individual' | 'mix';

export type AgoraRecordingSession = {
  channelName: string;
  resourceId: string;
  sid: string;
  status: 'starting' | 'recording' | 'stopped' | 'error';
  recordingUid: string;
  startedAt: string;
  stoppedAt?: string;
  fileList?: string[];
  simulated: boolean;
};

// In-memory registry of active cloud recording sessions
const activeRecordings = new Map<string, AgoraRecordingSession>();

function getBasicAuthHeader(): string | null {
  const customerKey = process.env.AGORA_CUSTOMER_KEY;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  if (!customerKey || !customerSecret) return null;
  return `Basic ${Buffer.from(`${customerKey}:${customerSecret}`).toString('base64')}`;
}

export async function acquireRecordingResource(
  appId: string,
  channelName: string,
  uid: string,
): Promise<{ resourceId: string; simulated: boolean }> {
  const auth = getBasicAuthHeader();
  if (auth) {
    try {
      const res = await fetch(
        `https://api.agora.io/v1/apps/${appId}/cloud_recording/acquire`,
        {
          method: 'POST',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cname: channelName,
            uid,
            clientRequest: {
              resourceExpiredHour: 24,
              scene: 0,
            },
          }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { resourceId: string };
        return { resourceId: data.resourceId, simulated: false };
      }
    } catch (err) {
      console.warn('Agora Cloud Recording acquire API call failed:', err);
    }
  }

  return {
    resourceId: `res-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    simulated: true,
  };
}

export async function startCloudRecording(
  appId: string,
  channelName: string,
  token: string,
  recordingUid = '999999',
): Promise<AgoraRecordingSession> {
  const existing = activeRecordings.get(channelName);
  if (existing && existing.status === 'recording') {
    return existing;
  }

  const { resourceId, simulated } = await acquireRecordingResource(
    appId,
    channelName,
    recordingUid,
  );

  const auth = getBasicAuthHeader();
  let sid = `sid-${Date.now().toString(36)}`;
  let realStarted = false;

  if (auth && !simulated) {
    try {
      const res = await fetch(
        `https://api.agora.io/v1/apps/${appId}/cloud_recording/resourceid/${resourceId}/mode/mix/start`,
        {
          method: 'POST',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cname: channelName,
            uid: recordingUid,
            clientRequest: {
              token,
              recordingConfig: {
                maxIdleTime: 30,
                streamTypes: 0, // Audio only
                audioProfile: 2, // High quality music
              },
            },
          }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { sid: string };
        sid = data.sid;
        realStarted = true;
      }
    } catch (err) {
      console.warn('Agora Cloud Recording start API call failed:', err);
    }
  }

  const session: AgoraRecordingSession = {
    channelName,
    resourceId,
    sid,
    status: 'recording',
    recordingUid,
    startedAt: new Date().toISOString(),
    simulated: !realStarted,
  };

  activeRecordings.set(channelName, session);
  return session;
}

export async function stopCloudRecording(
  appId: string,
  channelName: string,
): Promise<AgoraRecordingSession | null> {
  const session = activeRecordings.get(channelName);
  if (!session) return null;

  const auth = getBasicAuthHeader();
  if (auth && !session.simulated) {
    try {
      await fetch(
        `https://api.agora.io/v1/apps/${appId}/cloud_recording/resourceid/${session.resourceId}/sid/${session.sid}/mode/mix/stop`,
        {
          method: 'POST',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cname: channelName,
            uid: session.recordingUid,
            clientRequest: {},
          }),
        },
      );
    } catch (err) {
      console.warn('Agora Cloud Recording stop API call failed:', err);
    }
  }

  session.status = 'stopped';
  session.stoppedAt = new Date().toISOString();
  session.fileList = [`recordings/${channelName}-${session.sid}.m4a`];
  activeRecordings.delete(channelName);
  return session;
}

export function getRecordingStatus(channelName: string): AgoraRecordingSession | null {
  return activeRecordings.get(channelName) || null;
}
