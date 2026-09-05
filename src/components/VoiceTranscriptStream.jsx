import React from 'react';
import { Mic, Radio, Volume2 } from 'lucide-react';

/**
 * @param {{ transcripts?: any }} props
 */
export default function VoiceTranscriptStream({ transcripts = [] }) {
  const safeTranscripts = Array.isArray(transcripts) ? transcripts : [];

  return (
    <div className="card" aria-label="Voice AI Live Audio Stream">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#ede9fe', color: '#7c3aed' }}>
            <Volume2 size={18} />
          </div>
          <h2 className="card-title">Live Audio Stream Synthesis</h2>
        </div>
        <span className="card-badge-count" style={{ background: '#ede9fe', color: '#6d28d9', borderColor: '#ddd6fe' }}>
          Real-Time STT
        </span>
      </div>

      <div className="card-body" style={{ padding: '0.85rem 1.15rem' }}>
        <div className="voice-transcript-card">
          {safeTranscripts.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">Listening to live voice bridge for responder audio...</p>
          ) : (
            safeTranscripts.map((t, idx) => (
              <div key={idx} className="voice-stream-item">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                  <span className="voice-speaker-badge">{t.speaker || 'Responder'}</span>
                  <span className="font-mono text-dim" style={{ fontSize: '0.68rem' }}>{t.time || 'Live'}</span>
                </div>
                <p style={{ color: '#334155', fontSize: '0.825rem' }}>"{t.text}"</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
