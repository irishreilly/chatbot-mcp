import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { GlobalErrorBoundary, RouteErrorBoundary, ComponentErrorBoundary } from '../index'

// Mock the error service
vi.mock('../../../services/errorService', () => ({
  logError: vi.fn(),
  ErrorCategory: {
    RUNTIME: 'runtime'
  },
  ErrorSeverity: {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
  }
}))

// Component that throws an error
const ThrowError = ({ shouldThrow = false, errorMessage = 'Test error' }) => {
  if (shouldThrow) {
    throw new Error(errorMessage)
  }
  return <div>No error</div>
}

describe('Error Boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.error for cleaner test output
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('GlobalErrorBoundary', () => {
    it('should render children when there is no error', () => {
      render(
        <GlobalErrorBoundary>
          <div>Test content</div>
        </GlobalErrorBoundary>
      )

      expect(screen.getByText('Test content')).toBeInTheDocument()
    })

    it('should render error fallback when child component throws', () => {
      render(
        <GlobalErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Global test error" />
        </GlobalErrorBoundary>
      )

      expect(screen.getByText('Application Error')).toBeInTheDocument()
      expect(screen.getByText(/Something went wrong with the application/)).toBeInTheDocument()
      expect(screen.getByText('Global test error')).toBeInTheDocument()
    })

    it('should provide retry functionality', () => {
      const { rerender } = render(
        <GlobalErrorBoundary>
          <ThrowError shouldThrow={true} />
        </GlobalErrorBoundary>
      )

      // Error should be displayed
      expect(screen.getByText('Application Error')).toBeInTheDocument()

      // Click retry button
      const retryButton = screen.getByText('Try Again')
      fireEvent.click(retryButton)

      // Re-render with no error
      rerender(
        <GlobalErrorBoundary>
          <ThrowError shouldThrow={false} />
        </GlobalErrorBoundary>
      )

      expect(screen.getByText('No error')).toBeInTheDocument()
    })

    it('should provide reload functionality', () => {
      // Mock window.location.reload
      const mockReload = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true
      })

      render(
        <GlobalErrorBoundary>
          <ThrowError shouldThrow={true} />
        </GlobalErrorBoundary>
      )

      const reloadButton = screen.getByText('Reload Page')
      fireEvent.click(reloadButton)

      expect(mockReload).toHaveBeenCalled()
    })
  })

  describe('RouteErrorBoundary', () => {
    const renderWithRouter = (children) => {
      return render(
        <BrowserRouter>
          {children}
        </BrowserRouter>
      )
    }

    it('should render children when there is no error', () => {
      renderWithRouter(
        <RouteErrorBoundary routeName="Test Route">
          <div>Route content</div>
        </RouteErrorBoundary>
      )

      expect(screen.getByText('Route content')).toBeInTheDocument()
    })

    it('should render error fallback with route information', () => {
      renderWithRouter(
        <RouteErrorBoundary routeName="Test Route">
          <ThrowError shouldThrow={true} errorMessage="Route test error" />
        </RouteErrorBoundary>
      )

      expect(screen.getByText('Page Error')).toBeInTheDocument()
      expect(screen.getByText(/Test Route/)).toBeInTheDocument()
      expect(screen.getByText('Route test error')).toBeInTheDocument()
    })

    it('should provide navigation options', () => {
      renderWithRouter(
        <RouteErrorBoundary>
          <ThrowError shouldThrow={true} />
        </RouteErrorBoundary>
      )

      expect(screen.getByText('Go Home')).toBeInTheDocument()
      expect(screen.getByText('Go Back')).toBeInTheDocument()
    })
  })

  describe('ComponentErrorBoundary', () => {
    it('should render children when there is no error', () => {
      render(
        <ComponentErrorBoundary componentName="TestComponent">
          <div>Component content</div>
        </ComponentErrorBoundary>
      )

      expect(screen.getByText('Component content')).toBeInTheDocument()
    })

    it('should render error fallback with component information', () => {
      render(
        <ComponentErrorBoundary componentName="TestComponent">
          <ThrowError shouldThrow={true} errorMessage="Component test error" />
        </ComponentErrorBoundary>
      )

      expect(screen.getByText('TestComponent Error')).toBeInTheDocument()
      expect(screen.getByText(/TestComponent/)).toBeInTheDocument()
      expect(screen.getByText('Component test error')).toBeInTheDocument()
    })

    it('should use custom fallback component when provided', () => {
      const CustomFallback = ({ error, onRetry, componentName }) => (
        <div>
          <p>Custom fallback for {componentName}</p>
          <p>Error: {error.message}</p>
          <button onClick={onRetry}>Custom Retry</button>
        </div>
      )

      render(
        <ComponentErrorBoundary 
          componentName="TestComponent"
          fallbackComponent={CustomFallback}
        >
          <ThrowError shouldThrow={true} errorMessage="Custom fallback test" />
        </ComponentErrorBoundary>
      )

      expect(screen.getByText('Custom fallback for TestComponent')).toBeInTheDocument()
      expect(screen.getByText('Error: Custom fallback test')).toBeInTheDocument()
      expect(screen.getByText('Custom Retry')).toBeInTheDocument()
    })

    it('should call onError callback when error occurs', () => {
      const onErrorCallback = vi.fn()

      render(
        <ComponentErrorBoundary 
          componentName="TestComponent"
          onError={onErrorCallback}
        >
          <ThrowError shouldThrow={true} errorMessage="Callback test error" />
        </ComponentErrorBoundary>
      )

      expect(onErrorCallback).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Object),
        expect.any(String)
      )
    })

    it('should render compact error when compact prop is true', () => {
      render(
        <ComponentErrorBoundary componentName="TestComponent" compact={true}>
          <ThrowError shouldThrow={true} errorMessage="Compact error test" />
        </ComponentErrorBoundary>
      )

      const errorElement = screen.getByText('Compact error test').closest('.error-fallback')
      expect(errorElement).toHaveClass('error-fallback--compact')
    })
  })
})