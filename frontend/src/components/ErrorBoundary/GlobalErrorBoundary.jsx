import React from 'react'
import { logError, ErrorCategory, ErrorSeverity } from '../../services/errorService'
import ErrorFallback from './ErrorFallback'

class GlobalErrorBoundary extends React.Component {
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
      error
    }
  }

  componentDidCatch(error, errorInfo) {
    // Generate unique error ID
    const errorId = `global_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Log the error
    logError(error, {
      category: ErrorCategory.RUNTIME,
      severity: ErrorSeverity.HIGH,
      context: 'global_error_boundary',
      additionalData: {
        errorId,
        componentStack: errorInfo.componentStack,
        errorBoundary: 'GlobalErrorBoundary',
        props: this.props,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }
    })

    // Update state with error details
    this.setState({
      error,
      errorInfo,
      errorId
    })

    // Report to external error tracking service if available
    if (window.errorTracker) {
      window.errorTracker.captureException(error, {
        tags: {
          errorBoundary: 'GlobalErrorBoundary',
          errorId
        },
        extra: {
          componentStack: errorInfo.componentStack,
          props: this.props
        }
      })
    }
  }

  handleRetry = () => {
    // Reset error state to retry rendering
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    })
  }

  handleReload = () => {
    // Reload the entire page
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          onRetry={this.handleRetry}
          onReload={this.handleReload}
          level="global"
          title="Application Error"
          description="Something went wrong with the application. This error has been logged and will be investigated."
        />
      )
    }

    return this.props.children
  }
}

export default GlobalErrorBoundary