/**
 * Tests for DiagnosticPanel component
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  default: ({ requests, onCancelRequest, onCancelAll }) => (
    <div data-testid="active-requests-view">
      <div>Active Requests: {requests.length}</div>
      <button onClick={() => onCancelRequest('test-id')}>Cancel Request</button>
      <button onClick={onCancelAll}>Cancel All</button>
    </div>
  )
}))

vi.mock('../diagnostic/RequestHistoryView', () => ({
  default: ({ history, stats }) => (
    <div data-testid="request-history-view">
      <div>History: {history.length}</div>
      <div>Success Rate: {stats.successRate}%</div>
    </div>
  )
}))

vi.mock('../diagnostic/ErrorLogViewer', () => ({
  default: ({ stats, onClearLogs }) => (
    <div data-testid="error-log-viewer">
      <div>Total Errors: {stats.total}</div>
      <button onClick={onClearLogs}>Clear Logs</button>
    </div>
  )
}))

vi.mock('../diagnostic/PerformanceMetrics', () => ({
  default: ({ requestStats, healthStats, connectionStatus }) => (
    <div data-testid="performance-metrics">
      <div>Request Stats: {requestStats.total}</div>
      <div>Health Stats: {healthStats.total}</div>
      <div>Connection: {connectionStatus.status}</div>
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
    requestManager.cancelRequest.mockReturnValue(true)
    requestManager.cancelAllRequests.mockReturnValue(1)
    
    healthMonitor.getHealthStats.mockReturnValue(mockData.healthStats)
    healthMonitor.getConnectionStatus.mockReturnValue(mockData.connectionStatus)
    
    errorService.getErrorStats.mockReturnValue(mockData.errorStats)
    errorService.clearErrorLogs.mockImplementation(() => {})
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
    expect(screen.getAllByText('1')).toHaveLength(2) // Active requests count appears in status and tab
    expect(screen.getByText('80.0%')).toBeInTheDocument() // Success rate
    expect(screen.getByText('150ms')).toBeInTheDocument() // Response time
  })

  it('should display tabs with counts', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    expect(screen.getByText('Active Requests')).toBeInTheDocument()
    expect(screen.getByText('Request History')).toBeInTheDocument()
    expect(screen.getByText('Error Logs')).toBeInTheDocument()
    expect(screen.getByText('Performance')).toBeInTheDocument()
    expect(screen.getByText('Request Tester')).toBeInTheDocument()
    
    // Check tab counts
    const tabs = screen.getAllByText(/\d+/)
    expect(tabs.some(tab => tab.textContent === '1')).toBe(true) // Active requests
    expect(tabs.some(tab => tab.textContent === '2')).toBe(true) // Request history
    expect(tabs.some(tab => tab.textContent === '3')).toBe(true) // Error logs
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

  it('should handle refresh interval change', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    const intervalSelect = screen.getByRole('combobox')
    fireEvent.change(intervalSelect, { target: { value: '2000' } })
    
    expect(intervalSelect.value).toBe('2000')
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

  it('should handle data export', () => {
    // Mock URL.createObjectURL and related methods
    const mockCreateObjectURL = vi.fn(() => 'mock-url')
    const mockRevokeObjectURL = vi.fn()
    const mockClick = vi.fn()
    
    global.URL.createObjectURL = mockCreateObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL
    
    // Mock document.createElement and appendChild/removeChild
    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick
    }
    const mockAppendChild = vi.fn()
    const mockRemoveChild = vi.fn()
    
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
    vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild)
    vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild)
    
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    const exportButton = screen.getByText('Export')
    fireEvent.click(exportButton)
    
    expect(mockCreateObjectURL).toHaveBeenCalled()
    expect(mockAppendChild).toHaveBeenCalledWith(mockAnchor)
    expect(mockClick).toHaveBeenCalled()
    expect(mockRemoveChild).toHaveBeenCalledWith(mockAnchor)
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('mock-url')
  })

  it('should handle clear data with confirmation', () => {
    // Mock window.confirm
    const mockConfirm = vi.fn(() => true)
    global.confirm = mockConfirm
    
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    const clearButton = screen.getByText('Clear Data')
    fireEvent.click(clearButton)
    
    expect(mockConfirm).toHaveBeenCalledWith('Are you sure you want to clear all diagnostic data?')
    expect(errorService.clearErrorLogs).toHaveBeenCalled()
  })

  it('should not clear data when confirmation is cancelled', () => {
    // Mock window.confirm to return false
    const mockConfirm = vi.fn(() => false)
    global.confirm = mockConfirm
    
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    const clearButton = screen.getByText('Clear Data')
    fireEvent.click(clearButton)
    
    expect(mockConfirm).toHaveBeenCalled()
    expect(errorService.clearErrorLogs).not.toHaveBeenCalled()
  })

  it('should handle close button', () => {
    const mockOnClose = vi.fn()
    render(<DiagnosticPanel isOpen={true} onClose={mockOnClose} />)
    
    const closeButton = screen.getByText('×')
    fireEvent.click(closeButton)
    
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('should handle overlay click', () => {
    const mockOnClose = vi.fn()
    render(<DiagnosticPanel isOpen={true} onClose={mockOnClose} />)
    
    const overlay = document.querySelector('.diagnostic-panel__overlay')
    fireEvent.click(overlay)
    
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('should pass correct props to child components', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    // Check active requests view
    expect(screen.getByText('Active Requests: 1')).toBeInTheDocument()
    
    // Switch to history tab and check
    fireEvent.click(screen.getByText('Request History'))
    expect(screen.getByText('History: 2')).toBeInTheDocument()
    expect(screen.getByText('Success Rate: 80%')).toBeInTheDocument()
    
    // Switch to error logs tab and check
    fireEvent.click(screen.getByText('Error Logs'))
    expect(screen.getByText('Total Errors: 3')).toBeInTheDocument()
    
    // Switch to performance tab and check
    fireEvent.click(screen.getByText('Performance'))
    expect(screen.getByText('Request Stats: 10')).toBeInTheDocument()
    expect(screen.getByText('Health Stats: 5')).toBeInTheDocument()
    expect(screen.getByText('Connection: connected')).toBeInTheDocument()
  })

  it('should handle request cancellation', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    // Should be on active requests tab by default
    const cancelButton = screen.getByText('Cancel Request')
    fireEvent.click(cancelButton)
    
    expect(requestManager.cancelRequest).toHaveBeenCalledWith('test-id')
  })

  it('should handle cancel all requests', () => {
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    // Should be on active requests tab by default
    const cancelAllButton = screen.getByText('Cancel All')
    fireEvent.click(cancelAllButton)
    
    expect(requestManager.cancelAllRequests).toHaveBeenCalled()
  })

  it('should auto-refresh data when enabled', async () => {
    vi.useFakeTimers()
    
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    // Clear initial calls
    vi.clearAllMocks()
    
    // Fast forward time to trigger refresh
    vi.advanceTimersByTime(1000)
    
    await waitFor(() => {
      expect(requestManager.getActiveRequests).toHaveBeenCalled()
    })
    
    vi.useRealTimers()
  })

  it('should not auto-refresh when disabled', async () => {
    vi.useFakeTimers()
    
    render(<DiagnosticPanel isOpen={true} onClose={vi.fn()} />)
    
    // Disable auto-refresh
    const autoRefreshCheckbox = screen.getByLabelText('Auto-refresh')
    fireEvent.click(autoRefreshCheckbox)
    
    // Clear initial calls
    vi.clearAllMocks()
    
    // Fast forward time
    vi.advanceTimersByTime(2000)
    
    // Should not have been called
    expect(requestManager.getActiveRequests).not.toHaveBeenCalled()
    
    vi.useRealTimers()
  })
})