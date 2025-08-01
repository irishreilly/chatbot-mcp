/**
 * Tests for ManualRequestTester component
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import ManualRequestTester from '../ManualRequestTester'
import { requestManager } from '../../../services/requestManager'

// Mock requestManager
vi.mock('../../../services/requestManager', () => ({
  requestManager: {
    makeRequest: vi.fn()
  }
}))

describe('ManualRequestTester', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render with default values', () => {
    render(<ManualRequestTester />)
    
    expect(screen.getByText('Manual Request Tester')).toBeInTheDocument()
    expect(screen.getByDisplayValue('GET')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/api/health')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{}')).toBeInTheDocument()
    expect(screen.getByDisplayValue('15000')).toBeInTheDocument()
    expect(screen.getByText('Execute Request')).toBeInTheDocument()
  })

  it('should render preset buttons', () => {
    render(<ManualRequestTester />)
    
    expect(screen.getByText('Health Check')).toBeInTheDocument()
    expect(screen.getByText('Chat Message')).toBeInTheDocument()
    expect(screen.getByText('Get Conversations')).toBeInTheDocument()
  })

  it('should load preset when clicked', () => {
    render(<ManualRequestTester />)
    
    fireEvent.click(screen.getByText('Chat Message'))
    
    expect(screen.getByDisplayValue('POST')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/api/chat')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"Content-Type": "application/json"}')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{"message": "Hello, world!"}')).toBeInTheDocument()
    expect(screen.getByDisplayValue('30000')).toBeInTheDocument()
  })

  it('should update form fields', () => {
    render(<ManualRequestTester />)
    
    const methodSelect = screen.getByDisplayValue('GET')
    const urlInput = screen.getByDisplayValue('/api/health')
    const headersTextarea = screen.getByDisplayValue('{}')
    const timeoutInput = screen.getByDisplayValue('15000')
    
    fireEvent.change(methodSelect, { target: { value: 'POST' } })
    fireEvent.change(urlInput, { target: { value: '/api/test' } })
    fireEvent.change(headersTextarea, { target: { value: '{"test": "value"}' } })
    fireEvent.change(timeoutInput, { target: { value: '20000' } })
    
    expect(methodSelect.value).toBe('POST')
    expect(urlInput.value).toBe('/api/test')
    expect(headersTextarea.value).toBe('{"test": "value"}')
    expect(timeoutInput.value).toBe('20000')
  })

  it('should show body field for POST requests', () => {
    render(<ManualRequestTester />)
    
    // Initially GET, no body field
    expect(screen.queryByText('Request Body (JSON):')).not.toBeInTheDocument()
    
    // Change to POST
    const methodSelect = screen.getByDisplayValue('GET')
    fireEvent.change(methodSelect, { target: { value: 'POST' } })
    
    // Now body field should appear
    expect(screen.getByText('Request Body (JSON):')).toBeInTheDocument()
  })

  it('should hide body field for GET and HEAD requests', () => {
    render(<ManualRequestTester />)
    
    // Change to POST first to show body
    const methodSelect = screen.getByDisplayValue('GET')
    fireEvent.change(methodSelect, { target: { value: 'POST' } })
    expect(screen.getByText('Request Body (JSON):')).toBeInTheDocument()
    
    // Change back to GET
    fireEvent.change(methodSelect, { target: { value: 'GET' } })
    expect(screen.queryByText('Request Body (JSON):')).not.toBeInTheDocument()
    
    // Try HEAD
    fireEvent.change(methodSelect, { target: { value: 'HEAD' } })
    expect(screen.queryByText('Request Body (JSON):')).not.toBeInTheDocument()
  })

  it('should execute successful request', async () => {
    const mockResponse = {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: { message: 'success' }
    }
    
    requestManager.makeRequest.mockResolvedValue(mockResponse)
    
    render(<ManualRequestTester />)
    
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    // Should show loading state
    expect(screen.getByText('Executing...')).toBeInTheDocument()
    
    await waitFor(() => {
      expect(screen.getByText('✅ Success')).toBeInTheDocument()
    })
    
    expect(screen.getByText('✅ Success')).toBeInTheDocument()
    
    expect(requestManager.makeRequest).toHaveBeenCalledWith(
      {
        method: 'GET',
        url: '/api/health',
        headers: {}
      },
      {
        timeout: 15000
      }
    )
  })

  it('should handle request error', async () => {
    const mockError = {
      message: 'Network error',
      code: 'NETWORK_ERROR'
    }
    
    requestManager.makeRequest.mockRejectedValue(mockError)
    
    render(<ManualRequestTester />)
    
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    await waitFor(() => {
      expect(screen.getByText('❌ Error')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('should validate empty URL', async () => {
    render(<ManualRequestTester />)
    
    const urlInput = screen.getByDisplayValue('/api/health')
    fireEvent.change(urlInput, { target: { value: '' } })
    
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    await waitFor(() => {
      expect(screen.getByText('❌ Error')).toBeInTheDocument()
    })
    
    expect(screen.getByText('URL is required')).toBeInTheDocument()
    expect(requestManager.makeRequest).not.toHaveBeenCalled()
  })

  it('should validate invalid JSON headers', async () => {
    render(<ManualRequestTester />)
    
    const headersTextarea = screen.getByDisplayValue('{}')
    fireEvent.change(headersTextarea, { target: { value: 'invalid json' } })
    
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    await waitFor(() => {
      expect(screen.getByText('❌ Error')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Headers must be valid JSON')).toBeInTheDocument()
    expect(requestManager.makeRequest).not.toHaveBeenCalled()
  })

  it('should validate body for GET requests', async () => {
    render(<ManualRequestTester />)
    
    // Change to POST to show body field, add body, then change back to GET
    const methodSelect = screen.getByDisplayValue('GET')
    fireEvent.change(methodSelect, { target: { value: 'POST' } })
    
    const bodyTextarea = screen.getByPlaceholderText('{"key": "value"}')
    fireEvent.change(bodyTextarea, { target: { value: '{"test": "value"}' } })
    
    fireEvent.change(methodSelect, { target: { value: 'GET' } })
    
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    await waitFor(() => {
      expect(screen.getByText('❌ Error')).toBeInTheDocument()
    })
    
    expect(screen.getByText('GET and HEAD requests cannot have a body')).toBeInTheDocument()
    expect(requestManager.makeRequest).not.toHaveBeenCalled()
  })

  it('should validate invalid JSON body', async () => {
    render(<ManualRequestTester />)
    
    const methodSelect = screen.getByDisplayValue('GET')
    fireEvent.change(methodSelect, { target: { value: 'POST' } })
    
    const bodyTextarea = screen.getByPlaceholderText('{"key": "value"}')
    fireEvent.change(bodyTextarea, { target: { value: 'invalid json' } })
    
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    await waitFor(() => {
      expect(screen.getByText('❌ Error')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Body must be valid JSON')).toBeInTheDocument()
    expect(requestManager.makeRequest).not.toHaveBeenCalled()
  })

  it('should add request to history', async () => {
    const mockResponse = {
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { success: true }
    }
    
    requestManager.makeRequest.mockResolvedValue(mockResponse)
    
    render(<ManualRequestTester />)
    
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    await waitFor(() => {
      expect(screen.getByText('✅ Success')).toBeInTheDocument()
    })
    
    // Check history section
    expect(screen.getByText('GET /api/health')).toBeInTheDocument()
    expect(screen.getByText('✅')).toBeInTheDocument()
  })

  it('should load request from history', async () => {
    const mockResponse = {
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { success: true }
    }
    
    requestManager.makeRequest.mockResolvedValue(mockResponse)
    
    render(<ManualRequestTester />)
    
    // Change request details
    const methodSelect = screen.getByDisplayValue('GET')
    const urlInput = screen.getByDisplayValue('/api/health')
    fireEvent.change(methodSelect, { target: { value: 'POST' } })
    fireEvent.change(urlInput, { target: { value: '/api/test' } })
    
    // Execute to add to history
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    await waitFor(() => {
      expect(screen.getByText('✅ Success')).toBeInTheDocument()
    })
    
    // Change form again
    fireEvent.change(methodSelect, { target: { value: 'GET' } })
    fireEvent.change(urlInput, { target: { value: '/api/different' } })
    
    // Click on history item
    const historyItem = screen.getByText('POST /api/test')
    fireEvent.click(historyItem)
    
    // Form should be restored
    expect(screen.getByDisplayValue('POST')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/api/test')).toBeInTheDocument()
  })

  it('should clear history', async () => {
    const mockResponse = {
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { success: true }
    }
    
    requestManager.makeRequest.mockResolvedValue(mockResponse)
    
    render(<ManualRequestTester />)
    
    // Execute to add to history
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    await waitFor(() => {
      expect(screen.getByText('GET /api/health')).toBeInTheDocument()
    })
    
    // Clear history
    const clearButton = screen.getByText('Clear')
    fireEvent.click(clearButton)
    
    expect(screen.queryByText('GET /api/health')).not.toBeInTheDocument()
    expect(screen.getByText('No requests executed yet')).toBeInTheDocument()
  })

  it('should include headers and body in request', async () => {
    const mockResponse = {
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { success: true }
    }
    
    requestManager.makeRequest.mockResolvedValue(mockResponse)
    
    render(<ManualRequestTester />)
    
    // Set up POST request with headers and body
    const methodSelect = screen.getByDisplayValue('GET')
    const headersTextarea = screen.getByDisplayValue('{}')
    
    fireEvent.change(methodSelect, { target: { value: 'POST' } })
    fireEvent.change(headersTextarea, { target: { value: '{"Content-Type": "application/json"}' } })
    
    const bodyTextarea = screen.getByPlaceholderText('{"key": "value"}')
    fireEvent.change(bodyTextarea, { target: { value: '{"test": "data"}' } })
    
    const executeButton = screen.getByText('Execute Request')
    fireEvent.click(executeButton)
    
    await waitFor(() => {
      expect(requestManager.makeRequest).toHaveBeenCalledWith(
        {
          method: 'POST',
          url: '/api/health',
          headers: { 'Content-Type': 'application/json' },
          data: { test: 'data' }
        },
        {
          timeout: 15000
        }
      )
    })
  })
})