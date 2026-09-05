import React from 'react';
import { CheckCircle, ShieldCheck, Database, Check } from 'lucide-react';

/**
 * @param {{ facts?: any }} props
 */
export default function FactsCard({ facts = [] }) {
  const safeFacts = Array.isArray(facts) ? facts : [];

  return (
    <div className="card" aria-label="Confirmed Incident Facts">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#ecfdf5', color: '#059669' }}>
            <ShieldCheck size={18} />
          </div>
          <h2 className="card-title">Confirmed Facts</h2>
        </div>
        <span className="card-badge-count" style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}>
          {safeFacts.length} Verified
        </span>
      </div>

      <div className="card-body">
        {safeFacts.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">Listening to live voice bridge for confirmed facts...</p>
        ) : (
          <div className="facts-list">
            {safeFacts.map((f, idx) => (
              <div key={f.id || `fact-${idx}`} className="fact-item-card">
                <div className="fact-header-row">
                  <span className="confirmed-badge">
                    <Check size={12} strokeWidth={3} />
                    {f.confidence || 'Confirmed'}
                  </span>
                  <span className="font-mono text-dim" style={{ fontSize: '0.72rem' }}>
                    {f.timestamp || 'Live'}
                  </span>
                </div>

                <p className="fact-text">{f.fact || f.statement}</p>

                <div className="fact-footer-row">
                  <span>Verified via: <strong style={{ color: '#475569' }}>{f.verifiedBy || 'Telemetry'}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
