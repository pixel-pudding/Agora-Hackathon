import React from 'react';
import { AlertOctagon, Flame, Server, Clock, DollarSign, Users, ShieldAlert } from 'lucide-react';

/**
 * @param {{ incident?: any }} props
 */
export default function ActiveIncidentCard({ incident = {} }) {
  const inc = {
    id: incident?.id || 'INC-8492',
    title: incident?.title || 'Payment Service Outage - 504 Gateway Timeouts',
    severity: incident?.severity || 'HIGH',
    status: incident?.status || 'ACTIVE',
    environment: incident?.environment || 'Production (us-east-1)',
    summary: incident?.summary || 'Real-time incident response war room active. EchoOps Voice AI synthesizing telemetry, logs, and spoken hypotheses.',
    impact: incident?.impact || '78% Transactions Failing',
    estimatedRevenueImpact: incident?.estimatedRevenueImpact || '$48,200',
    slaTimeRemaining: incident?.slaTimeRemaining || '11m 38s',
    impactedCustomers: incident?.impactedCustomers || '~1,420 users',
    ...incident,
  };

  return (
    <section className="incident-hero-card" aria-label="Active Incident Overview">
      <div className="hero-main-row">
        {/* Main Title & Badges */}
        <div className="incident-title-group">
          <div className="incident-badge-row">
            <span className="incident-id-badge">{inc.id}</span>
            <span className="severity-high-badge" title="Severity Level">
              <Flame size={13} strokeWidth={2.5} />
              SEVERITY: {inc.severity}
            </span>
            <span className="status-active-badge" title="Status">
              <span className="pulse-red-dot"></span>
              STATUS: {inc.status}
            </span>
            <span className="incident-id-badge font-mono" style={{ background: '#f8fafc', color: '#64748b' }}>
              {inc.environment}
            </span>
          </div>

          <h1 className="incident-main-title">{inc.title}</h1>
          <p className="incident-summary-text">{inc.summary}</p>
        </div>
      </div>

      {/* Mini Metrics Bar */}
      <div className="hero-metrics-grid">
        <div className="metric-mini-card">
          <span className="metric-label">
            <AlertOctagon size={13} className="text-red-500" />
            Active Impact
          </span>
          <span className="metric-value critical">{inc.impact}</span>
        </div>

        <div className="metric-mini-card">
          <span className="metric-label">
            <DollarSign size={13} className="text-amber-500" />
            Est. Revenue Loss
          </span>
          <span className="metric-value warning">{inc.estimatedRevenueImpact}</span>
        </div>

        <div className="metric-mini-card">
          <span className="metric-label">
            <Clock size={13} className="text-red-500" />
            SLA Breach In
          </span>
          <span className="metric-value critical font-mono">{inc.slaTimeRemaining}</span>
        </div>

        <div className="metric-mini-card">
          <span className="metric-label">
            <Users size={13} className="text-blue-500" />
            Impacted Traffic
          </span>
          <span className="metric-value">{inc.impactedCustomers}</span>
        </div>
      </div>
    </section>
  );
}
