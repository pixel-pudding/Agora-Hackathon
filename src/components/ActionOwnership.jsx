import React, { useState } from 'react';
import { CheckSquare, User, Clock, ArrowRight } from 'lucide-react';

export default function ActionOwnership({ initialActions }) {
  const [actions, setActions] = useState(initialActions);

  // Cycle status on click: PENDING -> IN PROGRESS -> COMPLETED -> PENDING
  const cycleStatus = (id) => {
    setActions((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          let nextStatus = 'IN PROGRESS';
          if (item.status === 'PENDING') nextStatus = 'IN PROGRESS';
          else if (item.status === 'IN PROGRESS') nextStatus = 'COMPLETED';
          else if (item.status === 'COMPLETED') nextStatus = 'PENDING';
          return { ...item, status: nextStatus };
        }
        return item;
      })
    );
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'COMPLETED':
        return 'status-completed';
      case 'IN PROGRESS':
        return 'status-in-progress';
      case 'PENDING':
      default:
        return 'status-pending';
    }
  };

  return (
    <div className="card" aria-label="Action Items and Ownership">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <CheckSquare size={18} />
          </div>
          <h2 className="card-title">Action & Ownership</h2>
        </div>
        <span className="card-badge-count">{actions.length} Assigned Items</span>
      </div>

      <div className="card-body">
        <div className="actions-list">
          {actions.map((act) => (
            <div key={act.id} className="action-row-card">
              {/* Action Description & Owner */}
              <div className="action-main-info">
                <h3 className="action-title-text">{act.action}</h3>
                
                <div className="action-owner-tag">
                  <div
                    className="owner-avatar"
                    style={{ backgroundColor: act.owner.bg, color: act.owner.color }}
                    title={act.owner.role}
                  >
                    {act.owner.initials}
                  </div>
                  <span className="owner-name">{act.owner.name}</span>
                  <span className="owner-role">• {act.owner.role}</span>
                </div>
              </div>

              {/* Status Pill Badge (Clickable to demo interactive status changes) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                <span
                  className={`status-pill ${getStatusClass(act.status)}`}
                  onClick={() => cycleStatus(act.id)}
                  title="Click to toggle status (Demo Feature)"
                >
                  {act.status}
                </span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  Updated {act.updatedAt}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
