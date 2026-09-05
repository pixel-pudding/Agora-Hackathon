import React, { useState } from 'react';
import { UserCheck, ShieldAlert, Check, RefreshCw, AlertCircle } from 'lucide-react';

export default function HumanInTheLoop({ hitlData }) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmedTime, setConfirmedTime] = useState(null);

  const handleConfirm = () => {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setIsConfirmed(true);
    setConfirmedTime(timeString);
  };

  const handleReset = () => {
    setIsConfirmed(false);
    setConfirmedTime(null);
  };

  return (
    <div className="hitl-container" aria-label="Human in the loop approval card">
      <div className="hitl-header-banner">
        <div className="hitl-title-row">
          <UserCheck size={18} strokeWidth={2.5} />
          <span>Human-In-The-Loop Governance</span>
        </div>
        <span className="hitl-guardrail-badge">AI SAFETY GUARDRAIL</span>
      </div>

      <div className="hitl-body">
        <div className="hitl-action-box">
          <h3 className="hitl-action-title">{hitlData.actionTitle}</h3>
          <p className="hitl-action-sub">{hitlData.actionSub}</p>
          <p className="hitl-consequence-text">
            <strong>Impact Assessment:</strong> {hitlData.consequence}
          </p>
        </div>

        <div className="hitl-footer-action-row">
          <div className="hitl-approval-meta">
            <AlertCircle size={14} className="text-amber-500" />
            <span>Target: <code className="font-mono text-dim">{hitlData.targetCluster}</code></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isConfirmed ? (
              <>
                <button className="btn-action-confirmed" disabled>
                  <Check size={18} strokeWidth={3} />
                  ✓ Action Confirmed
                </button>
                <button
                  className="btn-reset-demo"
                  onClick={handleReset}
                  title="Reset state for demo pitch"
                >
                  <RefreshCw size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  Reset Demo
                </button>
              </>
            ) : (
              <button
                className="btn-confirm-action"
                onClick={handleConfirm}
                id="confirm-action-button"
              >
                Confirm Action
              </button>
            )}
          </div>
        </div>

        {isConfirmed && (
          <div
            style={{
              marginTop: '0.85rem',
              padding: '0.5rem 0.75rem',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>
              ✓ Dispatched pod reboot command to Kubernetes ingress controller.
            </span>
            <span className="font-mono" style={{ fontWeight: '700' }}>
              Authorized at {confirmedTime}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
