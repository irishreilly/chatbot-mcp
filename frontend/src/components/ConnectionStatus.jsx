import React, { useState, useEffect } from 'react'
import { healthMonitor, CONNECTION_STATUS } from '../services/healthMonitor'
import './ConnectionStatus.css'

const ConnectionStatus = ({ showDetails = false }) => {
  const [connectionStatus, setConnectionStatus] = useState(healthMonitor.getConnectionStatus())
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    // Subscribe to status changes
    const unsubscribe = healthMonitor.onStatusChange((newStatus, oldStatus) => {
      setConnectionStatus(healthMonitor.getConnectionStatus())
    })

    // Start monitoring if not already started
    if (!healthMonitor.isMonitoring) {
      healthMonitor.startMonitoring()
    }

    // Update status periodically
    const interval = setInterval(() => {
      setConnectionStatus(healthMonitor.getConnectionStatus())
    }, 1000)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  const getStatusIcon = (status) => {
    switch (status) {
      case CONNECTION_STATUS.CONNECTED:
        return '🟢'
      case CONNECTION_STATUS.SLOW:
        return '🟡'
      case CONNECTION_STATUS.DISCONNECTED:
        return '🔴'
      default:
        return '⚪'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case CONNECTION_STATUS.CONNECTED:
        return 'Connected'
      case CONNECTION_STATUS.SLOW:
        return 'Slow Connection'
      case CONNECTION_STATUS.DISCONNECTED:
        return 'Disconnected'
      default:
        return 'Unknown'
    }
  }

  const getStatusClass = (status) => {
    switch (status) {
      case CONNECTION_STATUS.CONNECTED:
        return 'connection-status--connected'
      case CONNECTION_STATUS.SLOW:
        return 'connection-status--slow'
      case CONNECTION_STATUS.DISCONNECTED:
        return 'connection-status--disconnected'
      default:
        return 'connection-status--unknown'
    }
  }

  const handleRetryConnection = async () => {
    await healthMonitor.forceHealthCheck()
  }

  const formatResponseTime = (responseTime) => {
    if (!responseTime) return 'N/A'
    return `${responseTime}ms`
  }

  const formatLastCheck = (lastCheck) => {
    if (!lastCheck) return 'Never'
    const now = new Date()
    const diff = now - new Date(lastCheck)
    const seconds = Math.floor(diff / 1000)
    
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  return (
    <div className={`connection-status ${getStatusClass(connectionStatus.status)}`}>
      <div 
        className="connection-status__indicator"
        onClick={() => showDetails && setIsExpanded(!isExpanded)}
        style={{ cursor: showDetails ? 'pointer' : 'default' }}
      >
        <span className="connection-status__icon">
          {getStatusIcon(connectionStatus.status)}
        </span>
        <span className="connection-status__text">
          {getStatusText(connectionStatus.status)}
        </span>
        {connectionStatus.responseTime && (
          <span className="connection-status__response-time">
            ({formatResponseTime(connectionStatus.responseTime)})
          </span>
        )}
      </div>

      {showDetails && isExpanded && (
        <div className="connection-status__details">
          <div className="connection-status__detail-row">
            <span>Browser Online:</span>
            <span>{connectionStatus.isOnline ? 'Yes' : 'No'}</span>
          </div>
          <div className="connection-status__detail-row">
            <span>Last Check:</span>
            <span>{formatLastCheck(connectionStatus.lastHealthCheck)}</span>
          </div>
          <div className="connection-status__detail-row">
            <span>Response Time:</span>
            <span>{formatResponseTime(connectionStatus.responseTime)}</span>
          </div>
          <div className="connection-status__detail-row">
            <span>Error Count:</span>
            <span>{connectionStatus.errorCount}</span>
          </div>
          <div className="connection-status__detail-row">
            <span>Consecutive Errors:</span>
            <span>{connectionStatus.consecutiveErrors}</span>
          </div>
          
          <div className="connection-status__actions">
            <button 
              className="connection-status__retry-btn"
              onClick={handleRetryConnection}
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectionStatus