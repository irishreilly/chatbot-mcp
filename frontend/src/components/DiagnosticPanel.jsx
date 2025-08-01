/**
 * DiagnosticPanel - Real-time monitoring and debugging dashboard
 */

import React, { useState, useEffect, useCallback } from 'react'
import './DiagnosticPanel.css'
import { requestManager } from '../services/requestManager'
import { healthMonitor } from '../services/healthMonitor'
import errorReporter from '../services/errorReporter'
import ActiveRequestsView from './diagnostic/ActiveRequestsView'
import RequestHistoryView from './diagnostic/RequestHistoryView'
import ErrorLogViewer from './diagnostic/ErrorLogViewer'
import PerformanceMetrics from './diagnostic/PerformanceMetrics'
import ManualRequestTester from './diagnostic/ManualRequestTester'

const DiagnosticPanel = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('requests')
  const [refreshInterval, setRefreshInterval] = useState(1000)
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  const [data, setData] = useState({
    activeRequests: [],
    requestHistory: [],
    requestStats: {},
    healthStats: {},
    errorStats: {},
    connectionStatus: {}
  })

  // Refresh data from services
  const refreshData = useCallback(() => {
    setData({
      activeRequests: requestManager.getActiveRequests(),
      requestHistory: requestManager.getRequestHistory(),
      requestStats: requestManager.getStats(),
      queueStatus: requestManager.getQueueStatus?.() || {},
      healthStats: healthMonitor.getHealthStats(),
      errorStats: errorReporter.getErrorStats(),
      connectionStatus: healthMonitor.getConnectionStatus()
    })
  }, [])

  // Auto-refresh effect
  useEffect(() => {
    if (!isOpen || !isAutoRefresh) return

    const interval = setInterval(refreshData, refreshInterval)
    return () => clearInterval(interval)
  }, [isOpen, isAutoRefresh, refreshInterval, refreshData])

  // Initial data load
  useEffect(() => {
    if (isOpen) {
      refreshData()
    }
  }, [isOpen, refreshData])

  // Handle manual refresh
  const handleRefresh = () => {
    refreshData()
  }

  // Handle clear data
  const handleClearData = () => {
    if (window.confirm('Are you sure you want to clear all diagnostic data?')) {
      errorReporter.clearErrors()
      refreshData()
    }
  }

  // Handle export data
  const handleExportData = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      ...data
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    })
    
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diagnostic-data-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  const tabs = [
    { id: 'requests', label: 'Active Requests', count: data.activeRequests.length },
    { id: 'queue', label: 'Request Queue', count: data.queueStatus?.queueSizes?.total || 0 },
    { id: 'history', label: 'Request History', count: data.requestHistory.length },
    { id: 'errors', label: 'Error Logs', count: data.errorStats.total || 0 },
    { id: 'performance', label: 'Performance', count: null },
    { id: 'tester', label: 'Request Tester', count: null }
  ]

  return (
    <div className="diagnostic-panel">
      <div className="diagnostic-panel__overlay" onClick={onClose} />
      
      <div className="diagnostic-panel__content">
        {/* Header */}
        <div className="diagnostic-panel__header">
          <h2>Diagnostic Dashboard</h2>
          
          <div className="diagnostic-panel__controls">
            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={isAutoRefresh}
                  onChange={(e) => setIsAutoRefresh(e.target.checked)}
                />
                Auto-refresh
              </label>
              
              {isAutoRefresh && (
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                >
                  <option value={500}>0.5s</option>
                  <option value={1000}>1s</option>
                  <option value={2000}>2s</option>
                  <option value={5000}>5s</option>
                </select>
              )}
            </div>
            
            <button onClick={handleRefresh} className="btn btn--secondary">
              Refresh
            </button>
            
            <button onClick={handleExportData} className="btn btn--secondary">
              Export
            </button>
            
            <button onClick={handleClearData} className="btn btn--danger">
              Clear Data
            </button>
            
            <button onClick={onClose} className="btn btn--close">
              ×
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="diagnostic-panel__status">
          <div className="status-item">
            <span className="status-label">Connection:</span>
            <span className={`status-value status-value--${data.connectionStatus.status}`}>
              {data.connectionStatus.status || 'unknown'}
            </span>
          </div>
          
          <div className="status-item">
            <span className="status-label">Active Requests:</span>
            <span className="status-value">{data.activeRequests.length}</span>
          </div>
          
          <div className="status-item">
            <span className="status-label">Success Rate:</span>
            <span className="status-value">
              {data.requestStats.successRate?.toFixed(1) || 0}%
            </span>
          </div>
          
          <div className="status-item">
            <span className="status-label">Response Time:</span>
            <span className="status-value">
              {data.connectionStatus.responseTime || 0}ms
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="diagnostic-panel__tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.count !== null && (
                <span className="tab__count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="diagnostic-panel__body">
          {activeTab === 'requests' && (
            <ActiveRequestsView
              requests={data.activeRequests}
              onCancelRequest={(id) => requestManager.cancelRequest(id)}
              onCancelAll={() => requestManager.cancelAllRequests()}
            />
          )}
          
          {activeTab === 'queue' && (
            <div className="queue-status">
              <div className="queue-status__header">
                <h3>Request Queue Status</h3>
                <div className="queue-controls">
                  <button 
                    className="btn btn--small"
                    onClick={() => requestManager.pauseQueue()}
                    disabled={data.queueStatus?.isPaused}
                  >
                    Pause Queue
                  </button>
                  <button 
                    className="btn btn--small"
                    onClick={() => requestManager.resumeQueue()}
                    disabled={!data.queueStatus?.isPaused}
                  >
                    Resume Queue
                  </button>
                  <button 
                    className="btn btn--small btn--danger"
                    onClick={() => requestManager.clearQueue()}
                  >
                    Clear Queue
                  </button>
                </div>
              </div>
              
              <div className="queue-status__info">
                <div className="status-grid">
                  <div className="status-item">
                    <span className="status-label">Status:</span>
                    <span className={`status-value status-value--${data.queueStatus?.status || 'idle'}`}>
                      {data.queueStatus?.status || 'idle'}
                    </span>
                  </div>
                  <div className="status-item">
                    <span className="status-label">Active Requests:</span>
                    <span className="status-value">{data.queueStatus?.activeRequests || 0}</span>
                  </div>
                  <div className="status-item">
                    <span className="status-label">Paused:</span>
                    <span className="status-value">{data.queueStatus?.isPaused ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="status-item">
                    <span className="status-label">Pending Batch:</span>
                    <span className="status-value">{data.queueStatus?.pendingBatch || 0}</span>
                  </div>
                </div>
              </div>
              
              <div className="queue-sizes">
                <h4>Queue Sizes by Priority</h4>
                <div className="priority-grid">
                  <div className="priority-item priority-item--high">
                    <span className="priority-label">High Priority:</span>
                    <span className="priority-count">{data.queueStatus?.queueSizes?.high || 0}</span>
                  </div>
                  <div className="priority-item priority-item--normal">
                    <span className="priority-label">Normal Priority:</span>
                    <span className="priority-count">{data.queueStatus?.queueSizes?.normal || 0}</span>
                  </div>
                  <div className="priority-item priority-item--low">
                    <span className="priority-label">Low Priority:</span>
                    <span className="priority-count">{data.queueStatus?.queueSizes?.low || 0}</span>
                  </div>
                  <div className="priority-item priority-item--total">
                    <span className="priority-label">Total Queued:</span>
                    <span className="priority-count">{data.queueStatus?.queueSizes?.total || 0}</span>
                  </div>
                </div>
              </div>
              
              <div className="queue-stats">
                <h4>Queue Statistics</h4>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Total Queued:</span>
                    <span className="stat-value">{data.queueStatus?.stats?.totalQueued || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Total Processed:</span>
                    <span className="stat-value">{data.queueStatus?.stats?.totalProcessed || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Total Failed:</span>
                    <span className="stat-value">{data.queueStatus?.stats?.totalFailed || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Overflow Count:</span>
                    <span className="stat-value">{data.queueStatus?.stats?.overflowCount || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Avg Wait Time:</span>
                    <span className="stat-value">{Math.round(data.queueStatus?.stats?.averageWaitTime || 0)}ms</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Avg Processing Time:</span>
                    <span className="stat-value">{Math.round(data.queueStatus?.stats?.averageProcessingTime || 0)}ms</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'history' && (
            <RequestHistoryView
              history={data.requestHistory}
              stats={data.requestStats}
            />
          )}
          
          {activeTab === 'errors' && (
            <ErrorLogViewer
              stats={data.errorStats}
              onClearLogs={clearErrorLogs}
            />
          )}
          
          {activeTab === 'performance' && (
            <PerformanceMetrics
              requestStats={data.requestStats}
              healthStats={data.healthStats}
              connectionStatus={data.connectionStatus}
            />
          )}
          
          {activeTab === 'tester' && (
            <ManualRequestTester />
          )}
        </div>
      </div>
    </div>
  )
}

export default DiagnosticPanel