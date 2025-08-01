import React, { useState } from 'react'
import './ErrorFallback.css'

const ErrorFallback = ({
  error,
  errorInfo,
  errorId,
  onRetry,
  onReload,
  onNavigateHome,
  onNavigateBack,
  level = 'component',
  title = 'Something went wrong',
  description = 'An error occurred while rendering this component.',
  compact = false
}) => {
  const [showDetails, setShowDetails] = useState(false)

  const getErrorIcon = (level) => {
    switch (level) {
      case 'global':
        return '🚨'
      case 'route':
        return '⚠️'
      case 'component':
      default:
        return '❌'
    }
  }

  const getErrorClass = (level) => {
    return `error-fallback error-fallback--${level}`
  }

  const formatErrorStack = (error) => {
    if (!error || !error.stack) return 'No stack trace available'
    
    // Clean up the stack trace for better readability
    return error.stack
      .split('\n')
      .slice(0, 10) // Limit to first 10 lines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
  }

  const copyErrorToClipboard = async () => {
    const errorDetails = {
      errorId,
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2))
      // Could show a toast notification here
      console.log('Error details copied to clipboard')
    } catch (err) {
      console.error('Failed to copy error details:', err)
    }
  }

  if (compact) {
    return (
      <div className={`${getErrorClass(level)} error-fallback--compact`}>
        <div className="error-fallback__icon">{getErrorIcon(level)}</div>
        <div className="error-fallback__content">
          <p className="error-fallback__message">{error?.message || 'An error occurred'}</p>
          {onRetry && (
            <button className="error-fallback__button error-fallback__button--small" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={getErrorClass(level)}>
      <div className="error-fallback__container">
        <div className="error-fallback__header">
          <div className="error-fallback__icon">{getErrorIcon(level)}</div>
          <div>
            <h2 className="error-fallback__title">{title}</h2>
            <p className="error-fallback__description">{description}</p>
          </div>
        </div>

        {error && (
          <div className="error-fallback__error-info">
            <p className="error-fallback__error-message">
              <strong>Error:</strong> {error.message}
            </p>
            {errorId && (
              <p className="error-fallback__error-id">
                <strong>Error ID:</strong> {errorId}
              </p>
            )}
          </div>
        )}

        <div className="error-fallback__actions">
          {onRetry && (
            <button className="error-fallback__button error-fallback__button--primary" onClick={onRetry}>
              Try Again
            </button>
          )}
          
          {onReload && (
            <button className="error-fallback__button error-fallback__button--secondary" onClick={onReload}>
              Reload Page
            </button>
          )}
          
          {onNavigateHome && (
            <button className="error-fallback__button error-fallback__button--secondary" onClick={onNavigateHome}>
              Go Home
            </button>
          )}
          
          {onNavigateBack && (
            <button className="error-fallback__button error-fallback__button--secondary" onClick={onNavigateBack}>
              Go Back
            </button>
          )}
        </div>

        <div className="error-fallback__details">
          <button
            className="error-fallback__details-toggle"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? 'Hide' : 'Show'} Technical Details
          </button>

          {showDetails && (
            <div className="error-fallback__details-content">
              <div className="error-fallback__stack">
                <h4>Stack Trace:</h4>
                <pre className="error-fallback__stack-trace">
                  {formatErrorStack(error)}
                </pre>
              </div>

              {errorInfo?.componentStack && (
                <div className="error-fallback__component-stack">
                  <h4>Component Stack:</h4>
                  <pre className="error-fallback__stack-trace">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}

              <div className="error-fallback__metadata">
                <h4>Error Metadata:</h4>
                <ul>
                  <li><strong>Timestamp:</strong> {new Date().toISOString()}</li>
                  <li><strong>User Agent:</strong> {navigator.userAgent}</li>
                  <li><strong>URL:</strong> {window.location.href}</li>
                  {errorId && <li><strong>Error ID:</strong> {errorId}</li>}
                </ul>
              </div>

              <button
                className="error-fallback__copy-button"
                onClick={copyErrorToClipboard}
              >
                Copy Error Details
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ErrorFallback