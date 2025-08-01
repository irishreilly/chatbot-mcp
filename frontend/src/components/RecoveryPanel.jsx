/**
 * Recovery Panel Component - Simplified version
 */

import React, { useState } from 'react'
import { useRecovery } from '../hooks/useRecovery'
import './RecoveryPanel.css'

const RecoveryPanel = ({ isVisible = false, onClose }) => {
  const {
    recoveryStatus,
    isRecovering,
    lastRecoveryAction,
    retryLastRequest,
    refreshApplication,
    clearCache,
    forceHealthCheck,
    isFeatureAvailable
  } = useRecovery()

  const [expandedSection, setExpandedSection] = useState(null)

  if (!isVisible) return null

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const getDegradationDescription = (level) => {
    const descriptions = {
      0: 'Full functionality available',
      1: 'Minor features disabled',
      2: 'Offline mode - cached data only',
      3: 'Limited functionality',
      4: 'Basic features only',
      5: 'Minimal functionality'
    }
    return descriptions[level] || 'Unknown status'
  }

  const getConnectionStatusColor = (status) => {
    const colors = {
      connected: '#4CAF50',
      slow: '#FF9800',
      disconnected: '#F44336',
      unknown: '#9E9E9E'
    }
    return colors[status] || '#9E9E9E'
  }

  return (
    <div className="recovery-panel">
      <div className="recovery-panel-header">
        <h3>Recovery & Diagnostics</h3>
        <button className="close-button" onClick={onClose} aria-label="Close recovery panel">
          ×
        </button>
      </div>

      <div className="recovery-panel-content">
        {/* Status Overview */}
        <div className="recovery-section">
          <div 
            className="recovery-section-header"
            onClick={() => toggleSection('status')}
          >
            <h4>System Status</h4>
            <span className={`expand-icon ${expandedSection === 'status' ? 'expanded' : ''}`}>
              ▼
            </span>
          </div>
          
          {expandedSection === 'status' && (
            <div className="recovery-section-content">
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Connection:</span>
                  <span 
                    className="status-value"
                    style={{ color: getConnectionStatusColor(recoveryStatus.connectionStatus.status) }}
                  >
                    {recoveryStatus.connectionStatus.status}
                  </span>
                </div>
                
                <div className="status-item">
                  <span className="status-label">Mode:</span>
                  <span className={`status-value ${recoveryStatus.isOfflineMode ? 'offline' : 'online'}`}>
                    {recoveryStatus.isOfflineMode ? 'Offline' : 'Online'}
                  </span>
                </div>
                
                <div className="status-item">
                  <span className="status-label">Functionality:</span>
                  <span className="status-value">
                    {getDegradationDescription(recoveryStatus.degradationLevel)}
                  </span>
                </div>
                
                <div className="status-item">
                  <span className="status-label">Cache Size:</span>
                  <span className="status-value">
                    {recoveryStatus.cacheSize} items
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recovery Actions */}
        <div className="recovery-section">
          <div 
            className="recovery-section-header"
            onClick={() => toggleSection('actions')}
          >
            <h4>Recovery Actions</h4>
            <span className={`expand-icon ${expandedSection === 'actions' ? 'expanded' : ''}`}>
              ▼
            </span>
          </div>
          
          {expandedSection === 'actions' && (
            <div className="recovery-section-content">
              <div className="recovery-actions">
                <button
                  className="recovery-button primary"
                  onClick={retryLastRequest}
                  disabled={isRecovering}
                >
                  {isRecovering ? 'Retrying...' : 'Retry Last Request'}
                </button>
                
                <button
                  className="recovery-button secondary"
                  onClick={forceHealthCheck}
                  disabled={isRecovering}
                >
                  {isRecovering ? 'Checking...' : 'Check Connection'}
                </button>
                
                <button
                  className="recovery-button secondary"
                  onClick={clearCache}
                  disabled={isRecovering}
                >
                  {isRecovering ? 'Clearing...' : 'Clear Cache'}
                </button>
                
                <button
                  className="recovery-button warning"
                  onClick={refreshApplication}
                  disabled={isRecovering}
                >
                  {isRecovering ? 'Refreshing...' : 'Refresh Application'}
                </button>
              </div>
              
              {lastRecoveryAction && (
                <div className="last-action">
                  <small>
                    Last action: {lastRecoveryAction.type} at {formatTimestamp(lastRecoveryAction.timestamp)}
                  </small>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feature Availability */}
        <div className="recovery-section">
          <div 
            className="recovery-section-header"
            onClick={() => toggleSection('features')}
          >
            <h4>Feature Availability</h4>
            <span className={`expand-icon ${expandedSection === 'features' ? 'expanded' : ''}`}>
              ▼
            </span>
          </div>
          
          {expandedSection === 'features' && (
            <div className="recovery-section-content">
              <div className="feature-list">
                {[
                  { key: 'chat', label: 'Chat Messages' },
                  { key: 'file-upload', label: 'File Upload' },
                  { key: 'real-time-updates', label: 'Real-time Updates' },
                  { key: 'advanced-features', label: 'Advanced Features' },
                  { key: 'analytics', label: 'Analytics' },
                  { key: 'non-essential', label: 'Non-essential Features' }
                ].map(feature => (
                  <div key={feature.key} className="feature-item">
                    <span className="feature-label">{feature.label}:</span>
                    <span className={`feature-status ${isFeatureAvailable(feature.key) ? 'available' : 'unavailable'}`}>
                      {isFeatureAvailable(feature.key) ? '✓ Available' : '✗ Unavailable'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="recovery-help">
          <h5>Recovery Tips:</h5>
          <ul>
            <li><strong>Retry Last Request:</strong> Attempts to retry the most recent failed operation</li>
            <li><strong>Check Connection:</strong> Tests connectivity to the server</li>
            <li><strong>Clear Cache:</strong> Removes cached data that might be causing issues</li>
            <li><strong>Refresh Application:</strong> Resets the application state</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default RecoveryPanel