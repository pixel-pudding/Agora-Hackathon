import React, { useState } from 'react';
import { CheckSquare, User, Clock, ArrowRight } from 'lucide-react';

/**
 * @param {{ initialActions?: any, actions?: any, onStatusChange?: any }} props
 */
export default function ActionOwnership({ initialActions = [], actions: propActions, onStatusChange }) {
  const currentActions = propActions || initialActions || [];
  const [localActions, setLocalActions] = useState(currentActions);

  // Sync with prop updates from live SSE
  React.useEffect(() => {
    if (propActions && propActions.length > 0) {
      setLocalActions(propActions);
    }
  }, [propActions]);

  // Cycle status on click: PENDING -> IN PROGRESS -> COMPLETED -> PENDING
  const cycleStatus = (id) => {
    setLocalActions((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          let nextStatus = 'IN PROGRESS';
          if (item.status === 'PENDING') nextStatus = 'IN PROGRESS';
          else if (item.status === 'IN PROGRESS') nextStatus = 'COMPLETED';
          else if (item.status === 'COMPLETED') nextStatus = 'PENDING';
          if (onStatusChange) onStatusChange(id, nextStatus);
          return { ...item, status: nextStatus };
        }
        return item;
      })
    );
  };

  const getStatusClass = (status) => {
    const s = String(status || '').toUpperCase();
    switch (s) {
      case 'COMPLETED':
        return 'status-completed';
      case 'IN PROGRESS':
      case 'IN_PROGRESS':
        return 'status-in-progress';
      case 'PENDING':
      default:
        return 'status-pending';
    }
  };

  const renderOwner = (owner) => {
    if (typeof owner === 'object' && owner !== null) {
      return {
        name: owner.name || 'Engineer',
        role: owner.role || 'SRE',
        initials: owner.initials || 'EN',
        color: owner.color || '#2563eb',
        bg: owner.bg || '#dbeafe',
      };
    }
    const nameStr = String(owner || 'Alex (SRE)');
    const initials = nameStr.replace(/[\(\)@]/g, '').trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'EN';
    return {
      name: nameStr,
      role: nameStr.includes('DBA') ? 'Lead DBA' : 'Site Reliability Eng',
      initials,
      color: '#2563eb',
      bg: '#dbeafe',
    };
  };

  const displayList = localActions.length > 0 ? localActions : currentActions;

  return (
    <div className="card" aria-label="Action Items and Ownership">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon-badge" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <CheckSquare size={18} />
          </div>
          <h2 className="card-title">Action & Ownership</h2>
        </div>
        <span className="card-badge-count">{displayList.length} Assigned Items</span>
      </div>

      <div className="card-body">
        {displayList.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">No actions assigned yet. Speaking action items on bridge will assign them live.</p>
        ) : (
          <div className="actions-list">
            {displayList.map((act, idx) => {
              const o = renderOwner(act.owner);
              const displayStatus = String(act.status || 'IN PROGRESS').toUpperCase().replace('_', ' ');

              return (
                <div key={act.id || `act-${idx}`} className="action-row-card">
                  {/* Action Description & Owner */}
                  <div className="action-main-info">
                    <h3 className="action-title-text">{act.action || act.task}</h3>
                    
                    <div className="action-owner-tag">
                      <div
                        className="owner-avatar"
                        style={{ backgroundColor: o.bg, color: o.color }}
                        title={o.role}
                      >
                        {o.initials}
                      </div>
                      <span className="owner-name">{o.name}</span>
                      <span className="owner-role">• {o.role}</span>
                    </div>
                  </div>

                  {/* Status Pill Badge */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                    <span
                      className={`status-pill ${getStatusClass(act.status)}`}
                      onClick={() => cycleStatus(act.id)}
                      title="Click to toggle status"
                    >
                      {displayStatus}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      {act.updatedAt || 'Live'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
