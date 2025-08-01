import React from 'react'
import { logError, ErrorCategory, ErrorSeverity } from '../../services/errorService'
import ErrorFallback from './ErrorFallback'

class ComponentErrorBoundary extends React.Component {
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
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error, errorInfo) {
    const errorId = `component_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    logError(error, {
      category: ErrorCategory.RUNTIME,
      severity: ErrorSeverity.LOW,
      context: 'component_error_boundary',
      additionalData: {
        errorId,
        componentStack: errorInfo.componentStack,
        errorBoundary: 'ComponentErrorBoundary',
        componentName: this.props.componentName,
        fallbackComponent: this.props.fallbackComponent,
        timestamp: new Date().toISOString()
      }
    })

    this.setState({
      error,
      errorInfo,
      errorId
    })

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo, errorId)
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    })

    // Call optional retry callback
    if (this.props.onRetry) {
      this.props.onRetry()
    }
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback component if provided
      if (this.props.fallbackComponent) {
        const FallbackComponent = this.props.fallbackComponent
        return (
          <FallbackComponent
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            errorId={this.state.errorId}
            onRetry={this.handleRetry}
            componentName={this.props.componentName}
          />
        )
      }

      // Use default error fallback
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          onRetry={this.handleRetry}
          level="component"
          title={`${this.props.componentName || 'Component'} Error`}
          description={`There was an error in the ${this.props.componentName || 'component'}. You can try to reload this section.`}
          compact={this.props.compact}
        />
      )
    }

    return this.props.children
  }
}

export default ComponentErrorBoundary