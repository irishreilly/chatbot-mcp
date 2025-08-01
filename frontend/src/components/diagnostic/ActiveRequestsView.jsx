/**
 * ActiveRequestsView - Display and manage active requests
 */

import React from 'react'

const ActiveRequestsView = ({ requests, onCancelRequest, onCancelAll }) => {
  const formatDuration = (startTime) => {
    const duration = Date.now() - startTime
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(1)}s`
  }

  const getStatusClass = (status) => {
    return `status-indicator status-indicator--${status}`
  }

  const getMethodClass = (method) => {
    return `method-badge method-badge--${method.toLowerCase()}`
  }

  if (requests.length === 0) {
    return (
      <div className="scrollable-content">
        <div className="empty-state">
          <div className="empty-state__icon">⚡</div>
          <div>No active requests</div>
          <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
            All requests have completed
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="scrollable-content">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>
            Active Requests ({requests.length})
          </h3>
          
          {requests.length > 0 && (
            <button 
              onClick={onCancelAll}
              className="btn btn--danger"
              style={{ fontSize: '12px' }}
            >
              Cancel All
            </button>
          )}
        </div>
      </div>

      <table className="diagnostic-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Method</th>
            <th>URL</th>
            <th>Duration</th>
            <th>Priority</th>
            <th>Timeout</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(request => (
            <tr key={request.id}>
              <td>
                <span className={getStatusClass(request.status)} />
                {request.status}
              </td>
              
              <td>
                <span className={getMethodClass(request.method)}>
                  {request.method}
                </span>
              </td>
              
              <td>
                <div style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {request.url}
                </div>
              </td>
              
              <td>{formatDuration(request.startTime)}</td>
              
              <td>
                <span style={{ 
                  color: request.priority === 'high' ? '#dc3545' : 
                        request.priority === 'low' ? '#6c757d' : '#333'
                }}>
                  {request.priority}
                </span>
              </td>
              
              <td>{(request.timeout / 1000).toFixed(1)}s</td>
              
              <td>
                <button
                  onClick={() => onCancelRequest(request.id)}
                  className="btn"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  Cancel
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ActiveRequestsView