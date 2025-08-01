import React from 'react'
import PropTypes from 'prop-types'
import errorReporter, { ERROR_CATEGORY, ERROR_SEVERITY } from '../services/errorReporter'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    this.setState({
      error,
      errorInfo
    })

    // Log to external service if configured
    this.logErrorToService(error, errorInfo)
  }

  logErrorToService = (error, errorInfo) => {
    // Use ErrorReporter for comprehensive error logging
    const errorId = errorReporter.reportError({
      type: ERROR_CATEGORY.RENDER,
      severity: ERROR_SEVERITY.HIGH,
      message: error.message,
      stack: error.stack,
      context: {
        componentStack: errorInfo.componentStack,
        component: this.props.componentName || 'Unknown',
        props: this.props.errorContext || {}
      },
      userAction: {
        type: 'component_render',
        timestamp: new Date().toISOString()
      }
    })

    // Update state with the error ID from ErrorReporter
    this.setState({ errorId })
  }

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry)
      }

      // Default fallback UI
      return (
        <div className="error-boundary">
          <div className="error-boundary__container">
            <div className="error-boundary__icon">⚠️</div>
            <h2 className="error-boundary__title">Something went wrong</h2>
            <p className="error-boundary__message">
              We're sorry, but something unexpected happened. The error has been logged 
              and we'll look into it.
            </p>
            
            {this.props.showDetails && this.state.error && (
              <details className="error-boundary__details">
                <summary>Error Details</summary>
                <div className="error-boundary__error-info">
                  <p><strong>Error ID:</strong> {this.state.errorId}</p>
                  <p><strong>Message:</strong> {this.state.error.message}</p>
                  <pre className="error-boundary__stack">
                    {this.state.error.stack}
                  </pre>
                </div>
              </details>
            )}
            
            <div className="error-boundary__actions">
              <button 
                onClick={this.handleRetry}
                className="error-boundary__button error-boundary__button--primary"
              >
                Try Again
              </button>
              <button 
                onClick={this.handleReload}
                className="error-boundary__button error-boundary__button--secondary"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.func,
  showDetails: PropTypes.bool,
  componentName: PropTypes.string,
  errorContext: PropTypes.object
}

ErrorBoundary.defaultProps = {
  showDetails: process.env.NODE_ENV === 'development'
}

export default ErrorBoundary