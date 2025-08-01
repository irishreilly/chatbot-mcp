/**
 * RequestHistoryView - Display request history with filtering and search
 */

import React, { useState, useMemo } from 'react'

const RequestHistoryView = ({ history, stats }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [sortBy, setSortBy] = useState('startTime')
  const [sortOrder, setSortOrder] = useState('desc')

  // Filter and sort history
  const filteredHistory = useMemo(() => {
    let filtered = history.filter(request => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        if (!request.url.toLowerCase().includes(searchLower) &&
            !request.method.toLowerCase().includes(searchLower)) {
          return false
        }
      }

      // Status filter
      if (statusFilter !== 'all' && request.status !== statusFilter) {
        return false
      }

      // Method filter
      if (methodFilter !== 'all' && request.method !== methodFilter) {
        return false
      }

      return true
    })

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortBy]
      let bVal = b[sortBy]

      if (sortBy === 'duration') {
        aVal = a.endTime - a.startTime
        bVal = b.endTime - b.startTime
      }

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = bVal.toLowerCase()
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
      }
    })

    return filtered
  }, [history, searchTerm, statusFilter, methodFilter, sortBy, sortOrder])

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const formatDuration = (duration) => {
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(2)}s`
  }

  const getStatusClass = (status) => {
    return `status-indicator status-indicator--${status}`
  }

  const getMethodClass = (method) => {
    return `method-badge method-badge--${method.toLowerCase()}`
  }

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const getSortIcon = (field) => {
    if (sortBy !== field) return '↕️'
    return sortOrder === 'asc' ? '↑' : '↓'
  }

  // Get unique methods for filter
  const uniqueMethods = [...new Set(history.map(r => r.method))]

  return (
    <div className="scrollable-content">
      {/* Header with stats */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>
            Request History ({filteredHistory.length} of {history.length})
          </h3>
          
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#666' }}>
            <span>Success Rate: <strong>{stats.successRate?.toFixed(1) || 0}%</strong></span>
            <span>Total: <strong>{stats.total || 0}</strong></span>
            <span>Failed: <strong>{stats.failed || 0}</strong></span>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search URL or method..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px',
              minWidth: '200px'
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="timeout">Timeout</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
          >
            <option value="all">All Methods</option>
            {uniqueMethods.map(method => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>

          {(searchTerm || statusFilter !== 'all' || methodFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('')
                setStatusFilter('all')
                setMethodFilter('all')
              }}
              className="btn"
              style={{ fontSize: '12px', padding: '6px 10px' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {filteredHistory.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📋</div>
          <div>No requests found</div>
          <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
            {history.length === 0 ? 'No requests have been made yet' : 'Try adjusting your filters'}
          </div>
        </div>
      ) : (
        <table className="diagnostic-table">
          <thead>
            <tr>
              <th>Status</th>
              <th 
                onClick={() => handleSort('method')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Method {getSortIcon('method')}
              </th>
              <th 
                onClick={() => handleSort('url')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                URL {getSortIcon('url')}
              </th>
              <th 
                onClick={() => handleSort('startTime')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Time {getSortIcon('startTime')}
              </th>
              <th 
                onClick={() => handleSort('duration')}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                Duration {getSortIcon('duration')}
              </th>
              <th>Retries</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {filteredHistory.map(request => (
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
                
                <td>{formatTime(request.startTime)}</td>
                
                <td>{formatDuration(request.duration)}</td>
                
                <td>{request.retryCount || 0}</td>
                
                <td>
                  {request.error && (
                    <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ color: '#dc3545', fontSize: '12px' }}>
                        {request.error.message}
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default RequestHistoryView