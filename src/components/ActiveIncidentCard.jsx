import React from 'react';
import { AlertOctagon, Flame, Server, Clock, DollarSign, Users, ShieldAlert } from 'lucide-react';

export default function ActiveIncidentCard({ incident }) {
  return (
    <section className="incident-hero-card" aria-label="Active Incident Overview">
      <div className="hero-main-row">
        {/* Main Title & Badges */}
        <div className="incident-title-group">
          <div className="incident-badge-row">
            <span className="incident-id-badge">{incident.id}</span>
            <span className="severity-high-badge" title="High Severity Level 1 Incident">
              <Flame size={13} strokeWidth={2.5} />
              SEVERITY: {incident.severity}
            </span>
            <span className="status-active-badge" title="Incident is currently unresolved">
              <span className="pulse-red-dot"></span>
              STATUS: {incident.status}
            </span>
            <span className="incident-id-badge font-mono" style={{ background: '#f8fafc', color: '#64748b' }}>
              {incident.environment}
            </span>
          </div>

          <h1 className="incident-main-title">{incident.title}</h1>
          <p className="incident-summary-text">{incident.summary}</p>
        </div>
      </div>

      {/* Mini Metrics Bar */}
      <div className="hero-metrics-grid">
        <div className="metric-mini-card">
          <span className="metric-label">
            <AlertOctagon size={13} className="text-red-500" />
            Active Impact
          </span>
          <span className="metric-value critical">{incident.impact}</span>
        </div>

        <div className="metric-mini-card">
          <span className="metric-label">
            <DollarSign size={13} className="text-amber-500" />
            Est. Revenue Loss
          </span>
          <span className="metric-value warning">{incident.estimatedRevenueImpact}</span>
        </div>

        <div className="metric-mini-card">
          <span className="metric-label">
            <Clock size={13} className="text-red-500" />
            SLA Breach In
          </span>
          <span className="metric-value critical font-mono">{incident.slaTimeRemaining}</span>
        </div>

        <div className="metric-mini-card">
          <span className="metric-label">
            <Users size={13} className="text-blue-500" />
            Impacted Traffic
          </span>
          <span className="metric-value">{incident.impactedCustomers}</span>
        </div>
      </div>
    </section>
  );
}
