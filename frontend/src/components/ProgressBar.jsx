import React, { useState, useEffect } from 'react'
import './ProgressBar.css'

const ProgressBar = ({
  progress = 0, // 0-100
  indeterminate = false,
  message = '',
  showPercentage = true,
  showTimeEstimate = false,
  startTime = null,
  size = 'medium',
  color = 'blue',
  animated = true
}) => {
  const [timeEstimate, setTimeEstimate] = useState(null)

  useEffect(() => {
    if (showTimeEstimate && startTime && progress > 0 && progress < 100) {
      const elapsed = Date.now() - startTime
      const rate = progress / elapsed // progress per ms
      const remaining = (100 - progress) / rate
      setTimeEstimate(remaining)
    } else {
      setTimeEstimate(null)
    }
  }, [progress, startTime, showTimeEstimate])

  const formatTimeEstimate = (ms) => {
    if (!ms || ms <= 0) return null
    
    const seconds = Math.ceil(ms / 1000)
    if (seconds < 60) return `~${seconds}s remaining`
    
    const minutes = Math.ceil(seconds / 60)
    if (minutes < 60) return `~${minutes}m remaining`
    
    const hours = Math.ceil(minutes / 60)
    return `~${hours}h remaining`
  }

  const getSizeClass = () => `progress-bar--${size}`
  const getColorClass = () => `progress-bar--${color}`
  const getAnimatedClass = () => animated ? 'progress-bar--animated' : ''

  return (
    <div className={`progress-bar ${getSizeClass()} ${getColorClass()} ${getAnimatedClass()}`}>
      {message && (
        <div className="progress-bar__message">
          {message}
        </div>
      )}
      
      <div className="progress-bar__container">
        <div className="progress-bar__track">
          <div 
            className={`progress-bar__fill ${indeterminate ? 'progress-bar__fill--indeterminate' : ''}`}
            style={indeterminate ? {} : { width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        
        {showPercentage && !indeterminate && (
          <div className="progress-bar__percentage">
            {Math.round(progress)}%
          </div>
        )}
      </div>
      
      {timeEstimate && (
        <div className="progress-bar__time-estimate">
          {formatTimeEstimate(timeEstimate)}
        </div>
      )}
    </div>
  )
}

export default ProgressBar