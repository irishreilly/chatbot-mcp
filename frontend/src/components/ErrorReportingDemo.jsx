/**
 * ErrorReportingDemo - Demonstration component showing the complete error reporting system
 * This component shows how to integrate ErrorReporter, ErrorFeedback, and related components
 */

import React, { useState, useEffect } from 'react'
import errorReporter, { ERROR_CATEGORY, ERROR_SEVERITY } from '../services/errorReporter'
import ErrorFeedbackModal from './ErrorFeedbackModal'
import useErrorFeedback from '../hooks/useErrorFeedback'

const ErrorReportingDemo = () => {
  const [errors, setErrors] = useState([])
  const [stats, setStats] = useState({})
  const { feedbackModal, showFeedback, hideFeedback } = useErrorFeedback()

  // Load errors and stats
  useEffect(() => {
    const loadData = () => {
      setErrors(errorReporter.getErrors())
      setStats(errorReporter.getErrorStats())
    }

    loadData()

    // Listen for new errors
    const handleNewError = (error) => {
      loadData()
    }

    errorReporter.addListener(handleNewError)

    return () => {
      errorReporter.removeListener(handleNewError)
    }
  }, [])

  // Simulate different types of errors
  const simulateNetworkError = () => {
    errorReporter.reportError({
      type: ERROR_CATEGORY.NETWORK,
      severity: ERROR_SEVERITY.HIGH,
      message: 'Failed to connect to server',
      context: {
        url: '/api/chat',
        method: 'POST',
        statusCode: 500
      },
      userAction: {
        type: 'send_message',
        timestamp: new Date().toISOString()
      }
    })
  }

  const simulateRuntimeError = () => {
    errorReporter.reportError({
      type: ERROR_CATEGORY.RUNTIME,
      severity: ERROR_SEVERITY.CRITICAL,
      message: 'Cannot read property of undefined',
      stack: 'TypeError: Cannot read property \'data\' of undefined\n    at ChatComponent.jsx:42:15',
      context: {
        component: 'ChatComponent',
        props: { messageId: '123' }
      }
    })
  }

  const simulateTimeoutError = () => {
    errorReporter.reportError({
      type: ERROR_CATEGORY.TIMEOUT,
      severity: ERROR_SEVERITY.MEDIUM,
      message: 'Request timed out after 30 seconds',
      context: {
        timeout: 30000,
        endpoint: '/api/chat/stream'
      }
    })
  }

  const clearAllErrors = () => {
    errorReporter.clearErrors()
    setErrors([])
    setStats({})
  }

  const exportErrorData = () => {
    const data = errorReporter.exportErrors()
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `error-report-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getSeverityColor = (severity) => {
    const colors = {
      [ERROR_SEVERITY.LOW]: '#6c757d',
      [ERROR_SEVERITY.MEDIUM]: '#ffc107',
      [ERROR_SEVERITY.HIGH]: '#fd7e14',
      [ERROR_SEVERITY.CRITICAL]: '#dc3545'
    }
    return colors[severity] || '#6c757d'
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

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Error Reporting System Demo</h1>
      
      {/* Controls */}
      <div style={{ 
        marginBottom: '20px', 
        padding: '16px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px' 
      }}>
        <h3>Simulate Errors</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            onClick={simulateNetworkError}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Network Error
          </button>
          
          <button 
            onClick={simulateRuntimeError}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Runtime Error
          </button>
          
          <button 
            onClick={simulateTimeoutError}
            style={{
              padding: '8px 16px',
              backgroundColor: '#fd7e14',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Timeout Error
          </button>
          
          <button 
            onClick={exportErrorData}
            style={{
              padding: '8px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Export Data
          </button>
          
          <button 
            onClick={clearAllErrors}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div style={{ 
        marginBottom: '20px', 
        padding: '16px', 
        backgroundColor: '#fff', 
        border: '1px solid #dee2e6',
        borderRadius: '8px' 
      }}>
        <h3>Error Statistics</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
              {stats.totalErrors || 0}
            </div>
            <div style={{ fontSize: '14px', color: '#6c757d' }}>Total Errors</div>
          </div>
          
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
              {stats.recentErrors?.length || 0}
            </div>
            <div style={{ fontSize: '14px', color: '#6c757d' }}>Recent Errors</div>
          </div>
          
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
              {errors.filter(e => e.resolved).length}
            </div>
            <div style={{ fontSize: '14px', color: '#6c757d' }}>Resolved</div>
          </div>
          
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffc107' }}>
              {errors.filter(e => e.userFeedback).length}
            </div>
            <div style={{ fontSize: '14px', color: '#6c757d' }}>With Feedback</div>
          </div>
        </div>
      </div>

      {/* Error List */}
      <div style={{ 
        backgroundColor: '#fff', 
        border: '1px solid #dee2e6',
        borderRadius: '8px' 
      }}>
        <div style={{ 
          padding: '16px', 
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0 }}>Error Log ({errors.length})</h3>
        </div>
        
        {errors.length === 0 ? (
          <div style={{ 
            padding: '40px', 
            textAlign: 'center', 
            color: '#6c757d' 
          }}>
            No errors logged. Try simulating some errors above.
          </div>
        ) : (
          <div>
            {errors.slice().reverse().map((error, index) => (
              <div 
                key={error.id} 
                style={{ 
                  padding: '16px', 
                  borderBottom: index < errors.length - 1 ? '1px solid #f0f0f0' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
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
                        {error.severity}
                      </span>
                      
                      <span style={{ 
                        fontSize: '11px',
                        color: '#999',
                        marginLeft: 'auto'
                      }}>
                        {new Date(error.timestamp).toLocaleString()}
                      </span>
                    </div>
                    
                    <div style={{ 
                      fontSize: '14px',
                      color: '#333',
                      fontWeight: '500',
                      marginBottom: '8px'
                    }}>
                      {error.message}
                    </div>
                    
                    {error.stack && (
                      <details style={{ marginBottom: '8px' }}>
                        <summary style={{ fontSize: '12px', color: '#666', cursor: 'pointer' }}>
                          Stack Trace
                        </summary>
                        <pre style={{ 
                          fontSize: '11px',
                          backgroundColor: '#f8f9fa',
                          padding: '8px',
                          borderRadius: '4px',
                          overflow: 'auto',
                          margin: '4px 0 0 0'
                        }}>
                          {error.stack}
                        </pre>
                      </details>
                    )}
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {!error.userFeedback && (
                        <button
                          onClick={() => showFeedback(error.id)}
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
                          onClick={() => {
                            errorReporter.markErrorResolved(error.id)
                            setErrors(prev => prev.map(e => 
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
                      
                      {error.userFeedback && (
                        <span style={{
                          fontSize: '12px',
                          color: '#007bff',
                          fontWeight: '500'
                        }}>
                          ★ Feedback: {error.userFeedback.rating}/5
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Feedback Modal */}
      <ErrorFeedbackModal
        errorId={feedbackModal.errorId}
        isOpen={feedbackModal.isOpen}
        onClose={hideFeedback}
        onSubmitSuccess={() => {
          // Refresh error list to show updated feedback
          setErrors(errorReporter.getErrors())
        }}
      />
    </div>
  )
}

export default ErrorReportingDemo