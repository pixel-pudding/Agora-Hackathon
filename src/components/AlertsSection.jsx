import React from 'react';
import { AlertTriangle, GitFork, UserX, TrendingDown, ShieldAlert } from 'lucide-react';

/**
 * @param {{ alerts?: any }} props
 */
export default function AlertsSection({ alerts = {} }) {
  const conflict = alerts?.conflict || {
    time: 'Live',
    title: 'No Active Conflicts',
    description: 'All responders are aligned on current operational priorities.',
    impact: 'None detected.',
  };

  const gap = alerts?.gap || {
    time: 'Live',
    title: 'Telemetry Gaps Monitored',
    description: 'System actively tracking missing logs, metrics, and responder availability.',
    impact: 'Low.',
  };

  const risk = alerts?.risk || {
    time: 'Active',
    title: 'SLA Threshold Tracking',
    description: 'EchoOps AI monitoring uptime thresholds and automated alert escalations.',
    impact: 'Continuous risk assessment.',
  };

  return (
    <div className="card" aria-label="Incident Alerts">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#fef2f2', color: '#dc2626' }}>
            <ShieldAlert size={18} />
          </div>
          <h2 className="card-title">Active AI Alerts & Triages</h2>
        </div>
        <span className="card-badge-count" style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }}>
          3 Critical Signals
        </span>
      </div>

      <div className="card-body">
        <div className="alerts-stack">
          {/* 1. Conflict Alert */}
          <div className="alert-box alert-conflict">
            <div className="alert-icon-col">
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <GitFork size={16} />
              </div>
            </div>

            <div className="alert-content-col">
              <div className="alert-top-row">
                <span className="alert-category-tag tag-conflict">Conflict Alert</span>
                <span className="font-mono text-dim" style={{ fontSize: '0.72rem' }}>{conflict.time}</span>
              </div>
              <h3 className="alert-heading">{conflict.title}</h3>
              <p className="alert-description">{conflict.description}</p>
              <div className="alert-impact-box">
                <span style={{ color: '#991b1b', fontWeight: '700' }}>Impact: </span>
                {conflict.impact}
              </div>
            </div>
          </div>

          {/* 2. Gap Alert */}
          <div className="alert-box alert-gap">
            <div className="alert-icon-col">
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#ffedd5',
                  color: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UserX size={16} />
              </div>
            </div>

            <div className="alert-content-col">
              <div className="alert-top-row">
                <span className="alert-category-tag tag-gap">Gap Alert</span>
                <span className="font-mono text-dim" style={{ fontSize: '0.72rem' }}>{gap.time}</span>
              </div>
              <h3 className="alert-heading">{gap.title}</h3>
              <p className="alert-description">{gap.description}</p>
              <div className="alert-impact-box">
                <span style={{ color: '#9a3412', fontWeight: '700' }}>Impact: </span>
                {gap.impact}
              </div>
            </div>
          </div>

          {/* 3. Risk Alert */}
          <div className="alert-box alert-risk">
            <div className="alert-icon-col">
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#ede9fe',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingDown size={16} />
              </div>
            </div>

            <div className="alert-content-col">
              <div className="alert-top-row">
                <span className="alert-category-tag tag-risk">Risk Alert</span>
                <span className="font-mono text-dim" style={{ fontSize: '0.72rem' }}>{risk.time}</span>
              </div>
              <h3 className="alert-heading">{risk.title}</h3>
              <p className="alert-description">{risk.description}</p>
              <div className="alert-impact-box">
                <span style={{ color: '#5b21b6', fontWeight: '700' }}>Impact: </span>
                {risk.impact}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
