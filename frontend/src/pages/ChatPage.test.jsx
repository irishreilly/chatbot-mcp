import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { vi } from 'vitest'
import ChatPage from './ChatPage'
import chatReducer from '../store/chatSlice'
import { chatAPI, errorUtils } from '../services/apiClient'
import { requestManager, RequestError } from '../services/requestManager'
import { healthMonitor, CONNECTION_STATUS } from '../services/healthMonitor'

// Mock the services
vi.mock('../services/apiClient')
vi.mock('../services/requestManager')
vi.mock('../services/healthMonitor')
vi.mock('../services/errorService')

// Mock react-router-dom useParams
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({}),
  }
})

const createTestStore = () => {
  return configureStore({
    reducer: {
      chat: chatReducer,
    },
  })
}

const renderWithProviders = (component) => {
  const store = createTestStore()
  return render(
    <Provider store={store}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </Provider>
  )
}

describe('ChatPage Enhanced Error Handling', () => {
  let mockStatusChangeCallback

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    // Mock API client
    chatAPI.sendMessage = vi.fn()
    errorUtils.retry = vi.fn((fn) => fn())
    errorUtils.getUserMessage = vi.fn((error) => error.message)
    
    // Mock request manager
    requestManager.makeRequest = vi.fn()
    requestManager.cancelRequest = vi.fn()
    requestManager.cancelAllRequests = vi.fn()
    
    // Mock health monitor
    mockStatusChangeCallback = null
    healthMonitor.onStatusChange = vi.fn((callback) => {
      mockStatusChangeCallback = callback
      return () => {} // unsubscribe function
    })
    healthMonitor.getConnectionStatus = vi.fn(() => ({
      status: CONNECTION_STATUS.CONNECTED,
      isOnline: true,
      lastHealthCheck: new Date(),
      responseTime: 100,
      errorCount: 0,
      consecutiveErrors: 0
    }))
    healthMonitor.startMonitoring = vi.fn()
    healthMonitor.isMonitoring = false
  })

  test('renders chat interface with connection status', async () => {
    renderWithProviders(<ChatPage />)
    
    await waitFor(() => {
      expect(screen.getByText('Welcome to MCP Chatbot')).toBeInTheDocument()
    })
    
    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
    expect(healthMonitor.startMonitoring).toHaveBeenCalled()
  })

  test('sends message with enhanced request management', async () => {
    const mockResponse = {
      data: {
        response: 'Hello! How can I help you?',
        timestamp: '2023-01-01T00:00:01Z',
        mcp_tools_used: []
      }
    }
    
    requestManager.makeRequest.mockResolvedValue(mockResponse)
    
    renderWithProviders(<ChatPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
    })
    
    const input = screen.getByPlaceholderText('Type your message...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    expect(screen.getByText('Hello')).toBeInTheDocument()
    
    await waitFor(() => {
      expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument()
    })
    
    expect(requestManager.makeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/chat',
        method: 'POST',
        data: expect.objectContaining({
          message: 'Hello'
        })
      }),
      expect.objectContaining({
        timeout: 30000,
        priority: 'high',
        deduplicate: false
      })
    )
  })

  test('handles timeout errors with enhanced error handling', async () => {
    const mockError = new RequestError('Request timed out', 'TIMEOUT', { id: 'test-request' })
    requestManager.makeRequest.mockRejectedValue(mockError)
    
    renderWithProviders(<ChatPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
    })
    
    const input = screen.getByPlaceholderText('Type your message...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    await waitFor(() => {
      expect(screen.getByText('Message sending timed out. Please try again.')).toBeInTheDocument()
    })
    
    expect(screen.getByText('Try Again')).toBeInTheDocument()
  })

  test('handles offline mode', async () => {
    renderWithProviders(<ChatPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
    })
    
    // Simulate going offline
    act(() => {
      mockStatusChangeCallback(CONNECTION_STATUS.DISCONNECTED)
    })
    
    await waitFor(() => {
      expect(screen.getByText(/You are currently offline/)).toBeInTheDocument()
    })
    
    const input = screen.getByPlaceholderText(/Offline - check your connection/)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    await waitFor(() => {
      expect(screen.getByText('You are currently offline. Please check your connection and try again.')).toBeInTheDocument()
    })
  })

  test('shows timeout warning and allows cancellation', async () => {
    let resolveRequest
    const requestPromise = new Promise((resolve) => {
      resolveRequest = resolve
    })
    requestManager.makeRequest.mockReturnValue(requestPromise)
    
    renderWithProviders(<ChatPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
    })
    
    const input = screen.getByPlaceholderText('Type your message...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    // Fast-forward time to trigger timeout warning
    act(() => {
      vi.advanceTimersByTime(15000)
    })
    
    await waitFor(() => {
      expect(screen.getByText(/Message sending will timeout in/)).toBeInTheDocument()
    })
    
    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)
    
    expect(requestManager.cancelRequest).toHaveBeenCalled()
    
    // Clean up
    resolveRequest({ data: { response: 'test', timestamp: new Date().toISOString(), mcp_tools_used: [] } })
  })

  test('handles request cancellation', async () => {
    const mockError = new RequestError('Request was cancelled', 'CANCELLED', { id: 'test-request' })
    requestManager.makeRequest.mockRejectedValue(mockError)
    
    renderWithProviders(<ChatPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
    })
    
    const input = screen.getByPlaceholderText('Type your message...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    await waitFor(() => {
      expect(screen.getByText('Message sending was cancelled.')).toBeInTheDocument()
    })
    
    // Should not show retry button for cancelled requests
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument()
  })

  test('shows retry count on multiple failures', async () => {
    const mockError = new RequestError('Network error', 'NETWORK_ERROR', { id: 'test-request' })
    requestManager.makeRequest.mockRejectedValue(mockError)
    
    renderWithProviders(<ChatPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
    })
    
    const input = screen.getByPlaceholderText('Type your message...')
    
    // First attempt
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    
    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })
    
    // Retry
    const retryButton = screen.getByText('Try Again')
    fireEvent.click(retryButton)
    
    await waitFor(() => {
      expect(screen.getByText('Try Again (2)')).toBeInTheDocument()
      expect(screen.getByText('Retry attempt: 1')).toBeInTheDocument()
    })
  })

  test('shows connection status changes', async () => {
    renderWithProviders(<ChatPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
    })
    
    // Simulate slow connection
    act(() => {
      mockStatusChangeCallback(CONNECTION_STATUS.SLOW)
    })
    
    await waitFor(() => {
      expect(screen.getByText(/Connection is slow/)).toBeInTheDocument()
    })
    
    // Simulate disconnection
    act(() => {
      mockStatusChangeCallback(CONNECTION_STATUS.DISCONNECTED)
    })
    
    await waitFor(() => {
      expect(screen.getByText(/You are currently offline/)).toBeInTheDocument()
    })
  })
})  afterEa
ch(() => {
    vi.useRealTimers()
  })