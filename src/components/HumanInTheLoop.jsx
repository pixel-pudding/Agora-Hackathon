import React, { useState } from 'react';
import { UserCheck, ShieldAlert, Check, RefreshCw, AlertCircle } from 'lucide-react';

/**
 * @param {{ hitlData?: any, onConfirm?: any }} props
 */
export default function HumanInTheLoop({ hitlData = {}, onConfirm }) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmedTime, setConfirmedTime] = useState(null);

  const data = {
    actionTitle: hitlData.actionTitle || 'Restart Payment Service Pods',
    actionSub: hitlData.actionSub || 'Cluster Worker Node Reset & Redis Connection Pool Flush',
    consequence: hitlData.consequence || 'Will safely terminate stuck connection pool and recycle worker pods. In-flight requests will be re-routed to standby queue with zero data loss.',
    targetCluster: hitlData.targetCluster || 'prod-us-east1-payment-worker-pool-a',
    ...hitlData,
  };

  const handleConfirm = async () => {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setIsConfirmed(true);
    setConfirmedTime(timeString);
    if (onConfirm) {
      await onConfirm(data.actionId);
    }
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
          <h3 className="hitl-action-title">{data.actionTitle}</h3>
          <p className="hitl-action-sub">{data.actionSub}</p>
          <p className="hitl-consequence-text">
            <strong>Impact Assessment:</strong> {data.consequence}
          </p>
        </div>

        <div className="hitl-footer-action-row">
          <div className="hitl-approval-meta">
            <AlertCircle size={14} className="text-amber-500" />
            <span>Target: <code className="font-mono text-dim">{data.targetCluster}</code></span>
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
