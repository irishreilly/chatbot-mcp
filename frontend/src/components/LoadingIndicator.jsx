import React, { useState, useEffect } from 'react'
import { requestManager } from '../services/requestManager'
import './LoadingIndicator.css'

const LoadingIndicator = ({ 
  message = 'Loading...', 
  showTimeout = true,
  timeoutWarning = 10000, // Show warning after 10 seconds
  allowCancel = false,
  onCancel,
  requestId = null,
  size = 'medium',
  variant = 'spinner'
}) => {
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [activeRequests, setActiveRequests] = useState([])

  useEffect(() => {
    const startTime = Date.now()
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      setElapsedTime(elapsed)
      
      if (showTimeout && elapsed > timeoutWarning) {
        setShowTimeoutWarning(true)
      }
      
      // Update active requests for display
      if (allowCancel) {
        setActiveRequests(requestManager.getActiveRequests())
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [showTimeout, timeoutWarning, allowCancel])

  const handleCancel = () => {
    if (requestId) {
      requestManager.cancelRequest(requestId)
    } else {
      requestManager.cancelAllRequests()
    }
    
    if (onCancel) {
      onCancel()
    }
  }

  const formatElapsedTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const getSpinner = () => {
    switch (variant) {
      case 'dots':
        return <div className="loading-dots"><span></span><span></span><span></span></div>
      case 'pulse':
        return <div className="loading-pulse"></div>
      case 'spinner':
      default:
        return <div className="loading-spinner"></div>
    }
  }

  const getSizeClass = () => {
    return `loading-indicator--${size}`
  }

  return (
    <div className={`loading-indicator ${getSizeClass()}`}>
      <div className="loading-indicator__content">
        <div className="loading-indicator__spinner">
          {getSpinner()}
        </div>
        
        <div className="loading-indicator__text">
          <p className="loading-indicator__message">{message}</p>
          
          {showTimeout && (
            <p className="loading-indicator__elapsed">
              {formatElapsedTime(elapsedTime)}
            </p>
          )}
          
          {showTimeoutWarning && (
            <p className="loading-indicator__warning">
              ⚠️ This is taking longer than expected
            </p>
          )}
        </div>
      </div>

      {allowCancel && (
        <div className="loading-indicator__actions">
          <button 
            className="loading-indicator__cancel-btn"
            onClick={handleCancel}
          >
            Cancel
          </button>
          
          {activeRequests.length > 0 && (
            <div className="loading-indicator__requests">
              <p className="loading-indicator__requests-title">
                Active requests ({activeRequests.length}):
              </p>
              <ul className="loading-indicator__requests-list">
                {activeRequests.slice(0, 3).map(request => (
                  <li key={request.id} className="loading-indicator__request-item">
                    <span className="loading-indicator__request-method">
                      {request.method}
                    </span>
                    <span className="loading-indicator__request-url">
                      {request.url}
                    </span>
                    <span className="loading-indicator__request-duration">
                      {formatElapsedTime(Date.now() - request.startTime)}
                    </span>
                  </li>
                ))}
                {activeRequests.length > 3 && (
                  <li className="loading-indicator__request-item">
                    ... and {activeRequests.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default LoadingIndicator