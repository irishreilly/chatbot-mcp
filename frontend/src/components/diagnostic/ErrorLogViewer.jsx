/**
 * ErrorLogViewer - Display and filter error logs
 */

import React, { useState, useEffect, useMemo } from 'react'
import errorReporter, { ERROR_SEVERITY, ERROR_CATEGORY } from '../../services/errorReporter'
import ErrorFeedbackModal from '../ErrorFeedbackModal'
import useErrorFeedback from '../../hooks/useErrorFeedback'

const ErrorLogViewer = ({ stats, onClearLogs }) => {
  const [errorLogs, setErrorLogs] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all')
  const [expandedError, setExpandedError] = useState(null)
  
  const { feedbackModal, showFeedback, hideFeedback, resolveError } = useErrorFeedback()

  // Load error logs from ErrorReporter
  useEffect(() => {
    try {
      const logs = errorReporter.getErrors()
      setErrorLogs(logs)
    } catch (e) {
      console.warn('Failed to load error logs:', e)
      setErrorLogs([])
    }
  }, [stats])

  // Filter error logs
  const filteredLogs = useMemo(() => {
    let filtered = errorLogs.filter(error => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const contextStr = JSON.stringify(error.context || {}).toLowerCase()
        if (!error.message.toLowerCase().includes(searchLower) &&
            !contextStr.includes(searchLower) &&
            !(error.stack && error.stack.toLowerCase().includes(searchLower))) {
          return false
        }
      }

      // Category filter (map to ErrorReporter types)
      if (categoryFilter !== 'all' && error.type !== categoryFilter) {
        return false
      }

      // Severity filter
      if (severityFilter !== 'all' && error.severity !== severityFilter) {
        return false
      }

      // Time filter
      if (timeFilter !== 'all') {
        const errorTime = new Date(error.timestamp)
        const now = new Date()
        const timeDiff = now - errorTime

        switch (timeFilter) {
          case '1h':
            if (timeDiff > 60 * 60 * 1000) return false
            break
          case '24h':
            if (timeDiff > 24 * 60 * 60 * 1000) return false
            break
          case '7d':
            if (timeDiff > 7 * 24 * 60 * 60 * 1000) return false
            break
        }
      }

      return true
    })

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    return filtered
  }, [errorLogs, searchTerm, categoryFilter, severityFilter, timeFilter])

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const getSeverityClass = (severity) => {
    const classes = {
      low: 'severity-low',
      medium: 'severity-medium',
      high: 'severity-high',
      critical: 'severity-critical'
    }
    return classes[severity] || 'severity-medium'
  }

  const getSeverityColor = (severity) => {
    const colors = {
      low: '#6c757d',
      medium: '#ffc107',
      high: '#fd7e14',
      critical: '#dc3545'
    }
    return colors[severity] || '#ffc107'
  }

  const getCategoryColor = (category) => {
    const colors = {
      [ERROR_CATEGORY.NETWORK]: '#007bff',
      [ERROR_CATEGORY.API]: '#28a745',
      [ERROR_CATEGORY.RUNTIME]: '#dc3545',
      [ERROR_CATEGORY.RENDER]: '#6f42c1',
      [ERROR_CATEGORY.TIMEOUT]: '#fd7e14',
      [ERROR_CATEGORY.PROXY]: '#17a2b8',
      [ERROR_CATEGORY.USER_INPUT]: '#ffc107',
      [ERROR_CATEGORY.SYSTEM]: '#6c757d'
    }
    return colors[category] || '#6c757d'
  }

  const toggleErrorExpansion = (errorId) => {
    setExpandedError(expandedError === errorId ? null : errorId)
  }

  const handleClearLogs = () => {
    if (window.confirm('Are you sure you want to clear all error logs?')) {
      errorReporter.clearErrors()
      onClearLogs()
      setErrorLogs([])
    }
  }

  return (
    <div className="scrollable-content">
      {/* Header with stats */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>
            Error Logs ({filteredLogs.length} of {errorLogs.length})
          </h3>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#666' }}>
              <span>Recent Hour: <strong>{stats.recentHour || 0}</strong></span>
              <span>Daily: <strong>{stats.dailyTotal || 0}</strong></span>
            </div>
            
            <button 
              onClick={handleClearLogs}
              className="btn btn--danger"
              style={{ fontSize: '12px' }}
            >
              Clear Logs
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search errors..."
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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
          >
            <option value="all">All Categories</option>
            <option value={ERROR_CATEGORY.NETWORK}>Network</option>
            <option value={ERROR_CATEGORY.API}>API</option>
            <option value={ERROR_CATEGORY.RUNTIME}>Runtime</option>
            <option value={ERROR_CATEGORY.RENDER}>Render</option>
            <option value={ERROR_CATEGORY.TIMEOUT}>Timeout</option>
            <option value={ERROR_CATEGORY.PROXY}>Proxy</option>
            <option value={ERROR_CATEGORY.USER_INPUT}>User Input</option>
            <option value={ERROR_CATEGORY.SYSTEM}>System</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
          >
            <option value="all">All Severities</option>
            <option value={ERROR_SEVERITY.LOW}>Low</option>
            <option value={ERROR_SEVERITY.MEDIUM}>Medium</option>
            <option value={ERROR_SEVERITY.HIGH}>High</option>
            <option value={ERROR_SEVERITY.CRITICAL}>Critical</option>
          </select>

          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
          >
            <option value="all">All Time</option>
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>

          {(searchTerm || categoryFilter !== 'all' || severityFilter !== 'all' || timeFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('')
                setCategoryFilter('all')
                setSeverityFilter('all')
                setTimeFilter('all')
              }}
              className="btn"
              style={{ fontSize: '12px', padding: '6px 10px' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Error List */}
      {filteredLogs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">✅</div>
          <div>No errors found</div>
          <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
            {errorLogs.length === 0 ? 'No errors have been logged' : 'Try adjusting your filters'}
          </div>
        </div>
      ) : (
        <div style={{ padding: '0' }}>
          {filteredLogs.map(error => (
            <div key={error.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
              <div 
                style={{ 
                  padding: '12px 20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  backgroundColor: expandedError === error.id ? '#f8f9fa' : 'transparent'
                }}
                onClick={() => toggleErrorExpansion(error.id)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span 
                      style={{ 
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: getSeverityColor(error.severity)
                      }}
                    />
                    
                    <span style={{ 
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      backgroundColor: getCategoryColor(error.type),
                      color: 'white',
                      textTransform: 'uppercase',
                      fontWeight: '600'
                    }}>
                      {error.type}
                    </span>
                    
                    <span style={{ 
                      fontSize: '11px',
                      color: '#666'
                    }}>
                      {error.context?.url ? new URL(error.context.url).pathname : 'Unknown'}
                    </span>
                    
                    <span style={{ 
                      fontSize: '11px',
                      color: '#999',
                      marginLeft: 'auto'
                    }}>
                      {formatTime(error.timestamp)}
                    </span>
                  </div>
                  
                  <div style={{ 
                    fontSize: '13px',
                    color: '#333',
                    fontWeight: '500'
                  }}>
                    {error.message}
                  </div>
                </div>
                
                <div style={{ 
                  fontSize: '12px',
                  color: '#666',
                  transform: expandedError === error.id ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s'
                }}>
                  ▶
                </div>
              </div>
              
              {expandedError === error.id && (
                <div style={{ 
                  padding: '0 20px 12px 20px',
                  backgroundColor: '#f8f9fa',
                  borderTop: '1px solid #e0e0e0'
                }}>
                  {error.stack && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#666' }}>
                        Stack Trace:
                      </div>
                      <pre style={{ 
                        fontSize: '11px',
                        backgroundColor: '#fff',
                        padding: '8px',
                        borderRadius: '4px',
                        overflow: 'auto',
                        maxHeight: '200px',
                        margin: 0,
                        border: '1px solid #ddd'
                      }}>
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  
                  {error.context && Object.keys(error.context).length > 0 && (
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#666' }}>
                        Context Data:
                      </div>
                      <pre style={{ 
                        fontSize: '11px',
                        backgroundColor: '#fff',
                        padding: '8px',
                        borderRadius: '4px',
                        overflow: 'auto',
                        maxHeight: '150px',
                        margin: 0,
                        border: '1px solid #ddd'
                      }}>
                        {JSON.stringify(error.context, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {error.userFeedback && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#666' }}>
                        User Feedback:
                      </div>
                      <div style={{ 
                        fontSize: '12px',
                        backgroundColor: '#fff',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}>
                        <div><strong>Rating:</strong> {error.userFeedback.rating}/5</div>
                        {error.userFeedback.description && (
                          <div style={{ marginTop: '4px' }}>
                            <strong>Description:</strong> {error.userFeedback.description}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Error Actions */}
                  <div style={{ 
                    marginTop: '12px',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center'
                  }}>
                    {!error.userFeedback && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          showFeedback(error.id)
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          border: '1px solid #007bff',
                          backgroundColor: 'transparent',
                          color: '#007bff',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        Add Feedback
                      </button>
                    )}
                    
                    {!error.resolved && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          resolveError(error.id)
                          setErrorLogs(prev => prev.map(e => 
                            e.id === error.id ? { ...e, resolved: true } : e
                          ))
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          border: '1px solid #28a745',
                          backgroundColor: 'transparent',
                          color: '#28a745',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        Mark Resolved
                      </button>
                    )}
                    
                    {error.resolved && (
                      <span style={{
                        fontSize: '12px',
                        color: '#28a745',
                        fontWeight: '500'
                      }}>
                        ✓ Resolved
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Error Feedback Modal */}
      <ErrorFeedbackModal
        errorId={feedbackModal.errorId}
        isOpen={feedbackModal.isOpen}
        onClose={hideFeedback}
        onSubmitSuccess={() => {
          // Refresh error logs to show updated feedback
          const logs = errorReporter.getErrors()
          setErrorLogs(logs)
        }}
      />
    </div>
  )
}

export default ErrorLogViewer