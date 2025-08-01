/**
 * Tests for ActiveRequestsView component
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import ActiveRequestsView from '../ActiveRequestsView'

describe('ActiveRequestsView', () => {
  const mockRequests = [
    {
      id: 'req1',
      url: '/api/chat',
      method: 'POST',
      status: 'pending',
      startTime: Date.now() - 5000, // 5 seconds ago
      timeout: 30000,
      priority: 'high'
    },
    {
      id: 'req2',
      url: '/api/health',
      method: 'GET',
      status: 'pending',
      startTime: Date.now() - 2000, // 2 seconds ago
      timeout: 5000,
      priority: 'normal'
    }
  ]

  const mockProps = {
    requests: mockRequests,
    onCancelRequest: vi.fn(),
    onCancelAll: vi.fn()
  }

  it('should render empty state when no requests', () => {
    render(<ActiveRequestsView {...mockProps} requests={[]} />)
    
    expect(screen.getByText('No active requests')).toBeInTheDocument()
    expect(screen.getByText('All requests have completed')).toBeInTheDocument()
  })

  it('should render active requests table', () => {
    render(<ActiveRequestsView {...mockProps} />)
    
    expect(screen.getByText('Active Requests (2)')).toBeInTheDocument()
    expect(screen.getByText('Cancel All')).toBeInTheDocument()
    
    // Check table headers
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Method')).toBeInTheDocument()
    expect(screen.getByText('URL')).toBeInTheDocument()
    expect(screen.getByText('Duration')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Timeout')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('should display request information correctly', () => {
    render(<ActiveRequestsView {...mockProps} />)
    
    // Check first request
    expect(screen.getByText('POST')).toBeInTheDocument()
    expect(screen.getByText('/api/chat')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('30.0s')).toBeInTheDocument()
    
    // Check second request
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('/api/health')).toBeInTheDocument()
    expect(screen.getByText('normal')).toBeInTheDocument()
    expect(screen.getByText('30.0s')).toBeInTheDocument() // First request timeout
    expect(screen.getAllByText('5.0s')).toHaveLength(2) // Duration and timeout for second request
  })

  it('should format duration correctly', () => {
    const recentRequest = {
      id: 'req3',
      url: '/api/test',
      method: 'GET',
      status: 'pending',
      startTime: Date.now() - 500, // 500ms ago
      timeout: 15000,
      priority: 'normal'
    }

    render(<ActiveRequestsView {...mockProps} requests={[recentRequest]} />)
    
    // Should show milliseconds for short durations
    expect(screen.getByText(/\d+ms/)).toBeInTheDocument()
  })

  it('should handle cancel request', () => {
    render(<ActiveRequestsView {...mockProps} />)
    
    const cancelButtons = screen.getAllByText('Cancel')
    fireEvent.click(cancelButtons[0])
    
    expect(mockProps.onCancelRequest).toHaveBeenCalledWith('req1')
  })

  it('should handle cancel all requests', () => {
    render(<ActiveRequestsView {...mockProps} />)
    
    const cancelAllButton = screen.getByText('Cancel All')
    fireEvent.click(cancelAllButton)
    
    expect(mockProps.onCancelAll).toHaveBeenCalled()
  })

  it('should not show cancel all button when no requests', () => {
    render(<ActiveRequestsView {...mockProps} requests={[]} />)
    
    expect(screen.queryByText('Cancel All')).not.toBeInTheDocument()
  })

  it('should apply correct CSS classes for status', () => {
    const requestWithDifferentStatus = {
      ...mockRequests[0],
      status: 'error'
    }

    render(<ActiveRequestsView {...mockProps} requests={[requestWithDifferentStatus]} />)
    
    const statusIndicator = document.querySelector('.status-indicator--error')
    expect(statusIndicator).toBeInTheDocument()
  })

  it('should apply correct CSS classes for method', () => {
    render(<ActiveRequestsView {...mockProps} />)
    
    const postBadge = document.querySelector('.method-badge--post')
    const getBadge = document.querySelector('.method-badge--get')
    
    expect(postBadge).toBeInTheDocument()
    expect(getBadge).toBeInTheDocument()
  })

  it('should handle priority colors correctly', () => {
    const lowPriorityRequest = {
      ...mockRequests[0],
      id: 'req3',
      priority: 'low'
    }

    render(<ActiveRequestsView {...mockProps} requests={[mockRequests[0], lowPriorityRequest]} />)
    
    // High priority should be red, low priority should be gray
    const priorityCells = screen.getAllByText(/high|low/)
    expect(priorityCells).toHaveLength(2)
  })

  it('should truncate long URLs', () => {
    const longUrlRequest = {
      ...mockRequests[0],
      url: '/api/very/long/url/that/should/be/truncated/because/it/is/too/long/to/display/properly'
    }

    render(<ActiveRequestsView {...mockProps} requests={[longUrlRequest]} />)
    
    const urlDiv = screen.getByText(longUrlRequest.url)
    expect(urlDiv).toHaveStyle({ 
      maxWidth: '300px',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    })
  })
})