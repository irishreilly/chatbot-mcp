import React, { useState, useEffect } from 'react'
import './TimeoutCountdown.css'

const TimeoutCountdown = ({
  timeoutMs = 30000,
  onTimeout,
  onCancel,
  message = 'Request will timeout in',
  showProgress = true,
  autoStart = true,
  warningThreshold = 10000 // Show warning when less than 10s remain
}) => {
  const [timeRemaining, setTimeRemaining] = useState(timeoutMs)
  const [isActive, setIsActive] = useState(autoStart)
  const [hasTimedOut, setHasTimedOut] = useState(false)

  useEffect(() => {
    let interval = null

    if (isActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(time => {
          const newTime = time - 1000
          
          if (newTime <= 0) {
            setHasTimedOut(true)
            setIsActive(false)
            if (onTimeout) {
              onTimeout()
            }
            return 0
          }
          
          return newTime
        })
      }, 1000)
    } else if (timeRemaining === 0) {
      setIsActive(false)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [isActive, timeRemaining, onTimeout])

  const formatTime = (ms) => {
    const totalSeconds = Math.ceil(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }
    return `${seconds}s`
  }

  const getProgressPercentage = () => {
    return ((timeoutMs - timeRemaining) / timeoutMs) * 100
  }

  const isWarning = () => {
    return timeRemaining <= warningThreshold && timeRemaining > 0
  }

  const handleCancel = () => {
    setIsActive(false)
    if (onCancel) {
      onCancel()
    }
  }

  const restart = () => {
    setTimeRemaining(timeoutMs)
    setHasTimedOut(false)
    setIsActive(true)
  }

  if (hasTimedOut) {
    return (
      <div className="timeout-countdown timeout-countdown--timed-out">
        <div className="timeout-countdown__content">
          <span className="timeout-countdown__icon">⏰</span>
          <span className="timeout-countdown__message">Request timed out</span>
          <button 
            className="timeout-countdown__button timeout-countdown__button--retry"
            onClick={restart}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!isActive) {
    return null
  }

  return (
    <div className={`timeout-countdown ${isWarning() ? 'timeout-countdown--warning' : ''}`}>
      <div className="timeout-countdown__content">
        <span className="timeout-countdown__icon">
          {isWarning() ? '⚠️' : '⏱️'}
        </span>
        
        <span className="timeout-countdown__message">
          {message}
        </span>
        
        <span className="timeout-countdown__time">
          {formatTime(timeRemaining)}
        </span>
        
        <button 
          className="timeout-countdown__button timeout-countdown__button--cancel"
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
      
      {showProgress && (
        <div className="timeout-countdown__progress">
          <div 
            className="timeout-countdown__progress-fill"
            style={{ width: `${getProgressPercentage()}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default TimeoutCountdown