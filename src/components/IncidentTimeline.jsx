import React from 'react';
import { Clock, AlertTriangle, XCircle, Sparkles, ShieldX, CheckCircle2 } from 'lucide-react';

/**
 * @param {{ timeline?: any }} props
 */
export default function IncidentTimeline({ timeline = [] }) {
  const safeTimeline = Array.isArray(timeline) ? timeline : [];

  const getNodeIcon = (type) => {
    switch (type) {
      case 'alert':
        return <AlertTriangle size={16} />;
      case 'error':
        return <XCircle size={16} />;
      case 'system':
        return <Sparkles size={16} />;
      case 'warning':
      case 'conflict':
        return <ShieldX size={16} />;
      case 'action':
        return <CheckCircle2 size={16} />;
      default:
        return <Clock size={16} />;
    }
  };

  return (
    <div className="card" aria-label="Incident Timeline">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#eef2ff', color: '#4f46e5' }}>
            <Clock size={17} />
          </div>
          <h2 className="card-title">Incident Timeline</h2>
        </div>
        <span className="card-badge-count">{safeTimeline.length} Events</span>
      </div>

      <div className="card-body">
        {safeTimeline.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">Listening for incident timeline events...</p>
        ) : (
          <div className="timeline-container">
            <div className="timeline-track">
              {safeTimeline.map((item, idx) => (
                <div key={item.id || `tl-${idx}`} className="timeline-item">
                  {/* Node icon with type-specific color */}
                  <div className={`timeline-node ${item.type || 'system'}`} title={item.type || 'event'}>
                    {getNodeIcon(item.type)}
                  </div>

                  {/* Event Content Card */}
                  <div className="timeline-content-card">
                    <div className="timeline-meta-row">
                      <span className="timeline-time-badge">{item.time || 'Live'}</span>
                      <span className="timeline-tag">{item.badge || 'EVENT'}</span>
                    </div>

                    <h3 className="timeline-event-title">{item.title || item.note}</h3>
                    <p className="timeline-event-desc">{item.description || item.note}</p>

                    <div className="timeline-source-pill">
                      <span>Source:</span>
                      <strong style={{ color: '#334155' }}>{item.source || item.speaker || 'System'}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
