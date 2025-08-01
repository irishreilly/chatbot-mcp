/**
 * Simplified tests for DiagnosticPanel component
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import DiagnosticPanel from '../DiagnosticPanel'
import { requestManager } from '../../services/requestManager'
import { healthMonitor } from '../../services/healthMonitor'
import * as errorService from '../../services/errorService'

// Mock services
vi.mock('../../services/requestManager', () => ({
  requestManager: {
    getActiveRequests: vi.fn(),
    getRequestHistory: vi.fn(),
    getStats: vi.fn(),
    cancelRequest: vi.fn(),
    cancelAllRequests: vi.fn()
  }
}))

vi.mock('../../services/healthMonitor', () => ({
  healthMonitor: {
    getHealthStats: vi.fn(),
    getConnectionStatus: vi.fn()
  }
}))

vi.mock('../../services/errorService', () => ({
  getErrorStats: vi.fn(),
  clearErrorLogs: vi.fn()
}))

// Mock child components
vi.mock('../diagnostic/ActiveRequestsView', () => ({
  default: ({ requests }) => (
    <div data-testid="active-requests-view">
      Active Requests: {requests.length}
    </div>
  )
}))

vi.mock('../diagnostic/RequestHistoryView', () => ({
  default: ({ history }) => (
    <div data-testid="request-history-view">
      History: {history.length}
    </div>
  )
}))

vi.mock('../diagnostic/ErrorLogViewer', () => ({
  default: ({ stats }) => (
    <div data-testid="error-log-viewer">
      Total Errors: {stats.total}
    </div>
  )
}))

vi.mock('../diagnostic/PerformanceMetrics', () => ({
  default: () => (
    <div data-testid="performance-metrics">
      Performance Metrics
    </div>
  )
}))

vi.mock('../diagnostic/ManualRequestTester', () => ({
  default: () => (
    <div data-testid="manual-request-tester">
      Manual Request Tester
    </div>
  )
}))

describe('DiagnosticPanel', () => {
  const mockData = {
    activeRequests: [
      { id: '1', url: '/api/test', method: 'GET', status: 'pending' }
    ],
    requestHistory: [
      { id: '1', url: '/api/test', method: 'GET', status: 'success' },
      { id: '2', url: '/api/test2', method: 'POST', status: 'error' }
    ],
    requestStats: {
      total: 10,
      successful: 8,
      failed: 2,
      successRate: 80
    },
    healthStats: {
      total: 5,
      successful: 4,
      failed: 1,
      successRate: 80
    },
    errorStats: {
      total: 3,
      recentHour: 1,
      dailyTotal: 2
    },
    connectionStatus: {
      status: 'connected',
      responseTime: 150
    }
  }

  beforeEach(() => {
    // Setup mock implementations
    requestManager.getActiveRequests.mockReturnValue(mockData.activeRequests)
    requestManager.getRequestHistory.mockReturnValue(mockData.requestHistory)
    requestManager.getStats.mockReturnValue(mockData.requestStats)
    
    healthMonitor.getHealthStats.mockReturnValue(mockData.healthStats)
    healthMonitor.getConnectionStatus.mockReturnValue(mockData.connectionStatus)
    
    errorService.getErrorStats.mockReturnValue(mockData.errorStats)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should not render when closed', () => {
    render(<DiagnosticPanel isOpen={false} onClose={vi.fn()} />)
    
    expect(screen.queryByText('Diagnostic Dashboard')).not.toBeInTheDocument()
  })

  it('should render when open', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    expect(screen.getByText('Diagnostic Dashboard')).toBeInTheDocument()
  })

  it('should display status information', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    expect(screen.getByText('connected')).toBeInTheDocument()
    expect(screen.getByText('80.0%')).toBeInTheDocument() // Success rate
    expect(screen.getByText('150ms')).toBeInTheDocument() // Response time
  })

  it('should display tabs', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    expect(screen.getByText('Active Requests')).toBeInTheDocument()
    expect(screen.getByText('Request History')).toBeInTheDocument()
    expect(screen.getByText('Error Logs')).toBeInTheDocument()
    expect(screen.getByText('Performance')).toBeInTheDocument()
    expect(screen.getByText('Request Tester')).toBeInTheDocument()
  })

  it('should switch tabs when clicked', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    // Default tab should be active requests
    expect(screen.getByTestId('active-requests-view')).toBeInTheDocument()
    
    // Click on history tab
    fireEvent.click(screen.getByText('Request History'))
    expect(screen.getByTestId('request-history-view')).toBeInTheDocument()
    
    // Click on error logs tab
    fireEvent.click(screen.getByText('Error Logs'))
    expect(screen.getByTestId('error-log-viewer')).toBeInTheDocument()
    
    // Click on performance tab
    fireEvent.click(screen.getByText('Performance'))
    expect(screen.getByTestId('performance-metrics')).toBeInTheDocument()
    
    // Click on tester tab
    fireEvent.click(screen.getByText('Request Tester'))
    expect(screen.getByTestId('manual-request-tester')).toBeInTheDocument()
  })

  it('should handle auto-refresh toggle', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    const autoRefreshCheckbox = screen.getByLabelText('Auto-refresh')
    expect(autoRefreshCheckbox).toBeChecked()
    
    fireEvent.click(autoRefreshCheckbox)
    expect(autoRefreshCheckbox).not.toBeChecked()
  })

  it('should handle manual refresh', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    const refreshButton = screen.getByText('Refresh')
    fireEvent.click(refreshButton)
    
    // Should call all data fetching methods
    expect(requestManager.getActiveRequests).toHaveBeenCalled()
    expect(requestManager.getRequestHistory).toHaveBeenCalled()
    expect(requestManager.getStats).toHaveBeenCalled()
    expect(healthMonitor.getHealthStats).toHaveBeenCalled()
    expect(healthMonitor.getConnectionStatus).toHaveBeenCalled()
    expect(errorService.getErrorStats).toHaveBeenCalled()
  })

  it('should pass correct data to child components', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    // Check active requests view
    expect(screen.getByText('Active Requests: 1')).toBeInTheDocument()
    
    // Switch to history tab and check
    fireEvent.click(screen.getByText('Request History'))
    expect(screen.getByText('History: 2')).toBeInTheDocument()
    
    // Switch to error logs tab and check
    fireEvent.click(screen.getByText('Error Logs'))
    expect(screen.getByText('Total Errors: 3')).toBeInTheDocument()
  })
})