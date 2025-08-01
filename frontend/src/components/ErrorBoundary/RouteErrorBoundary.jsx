import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { logError, ErrorCategory, ErrorSeverity } from '../../services/errorService'
import ErrorFallback from './ErrorFallback'

class RouteErrorBoundaryClass extends React.Component {
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
    const errorId = `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    logError(error, {
      category: ErrorCategory.RUNTIME,
      severity: ErrorSeverity.MEDIUM,
      context: 'route_error_boundary',
      additionalData: {
        errorId,
        componentStack: errorInfo.componentStack,
        errorBoundary: 'RouteErrorBoundary',
        route: this.props.location?.pathname,
        routeName: this.props.routeName,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      }
    })

    this.setState({
      error,
      errorInfo,
      errorId
    })
  }

  componentDidUpdate(prevProps) {
    // Reset error state when route changes
    if (this.state.hasError && prevProps.location?.pathname !== this.props.location?.pathname) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null
      })
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    })
  }

  handleNavigateHome = () => {
    this.props.navigate('/')
  }

  handleNavigateBack = () => {
    this.props.navigate(-1)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          onRetry={this.handleRetry}
          onNavigateHome={this.handleNavigateHome}
          onNavigateBack={this.handleNavigateBack}
          level="route"
          title="Page Error"
          description={`There was an error loading this page${this.props.routeName ? ` (${this.props.routeName})` : ''}. You can try again or navigate to a different page.`}
        />
      )
    }

    return this.props.children
  }
}

// Wrapper component to inject router hooks
const RouteErrorBoundary = ({ children, routeName }) => {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <RouteErrorBoundaryClass
      navigate={navigate}
      location={location}
      routeName={routeName}
    >
      {children}
    </RouteErrorBoundaryClass>
  )
}

export default RouteErrorBoundary