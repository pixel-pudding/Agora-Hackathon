import React from 'react';
import { HelpCircle, AlertCircle, Sparkles } from 'lucide-react';

/**
 * @param {{ assumptions?: any }} props
 */
export default function AssumptionsCard({ assumptions = [] }) {
  const safeAssumptions = Array.isArray(assumptions) ? assumptions : [];

  return (
    <div className="card" aria-label="Unconfirmed Assumptions">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#fffbeb', color: '#d97706' }}>
            <HelpCircle size={18} />
          </div>
          <h2 className="card-title">Assumptions & Hypotheses</h2>
        </div>
        <span className="card-badge-count" style={{ background: '#fffbeb', color: '#b45309', borderColor: '#fde68a' }}>
          {safeAssumptions.length} Active
        </span>
      </div>

      <div className="card-body">
        {safeAssumptions.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">No unconfirmed hypotheses raised yet on audio bridge.</p>
        ) : (
          <div className="assumptions-list">
            {safeAssumptions.map((a, idx) => (
              <div key={a.id || `hyp-${idx}`} className="assumption-item-card">
                <div className="assumption-header-row">
                  <span className="unconfirmed-badge">
                    <AlertCircle size={12} strokeWidth={2.5} />
                    {a.status || 'Hypothesis'}
                  </span>
                  <span style={{ fontSize: '0.7rem', fontWeight: '700', color: a.riskLevel === 'High' ? '#dc2626' : '#d97706' }}>
                    Risk: {a.riskLevel || 'Medium'}
                  </span>
                </div>

                <p className="assumption-text">{a.hypothesis || a.statement}</p>

                <div className="assumption-footer-row">
                  <span>Source: <strong style={{ color: '#475569' }}>{a.source || a.raisedBy || 'Voice AI'}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
