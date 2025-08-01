/**
 * Integration tests for backend unavailability during active sessions
 * Tests how the application handles backend server downtime and recovery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import chatSlice from '../store/chatSlice'
import ChatPage from '../pages/ChatPage'
import { requestManager } from '../services/requestManager'
import { healthMonitor } from '../services/healthMonitor'
import { errorReporter } from '../services/errorReporter'

// Mock services
vi.mock('../services/requestManager', () => ({
  requestManager: {
    makeRequest: vi.fn(),
    cancelAllRequests: vi.fn(),
    getActiveRequests: vi.fn(() => []),
    getStats: vi.fn(() => ({ total: 0, successful: 0, failed: 0 }))
  }
}))

vi.mock('../services/healthMonitor', () => ({
  healthMonitor: {
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    getConnectionStatus: vi.fn(() => ({ isOnline: true, backendStatus: 'connected' })),
    onStatusChange: vi.fn(),
    forceHealthCheck: vi.fn()
  },
  CONNECTION_STATUS: {
    UNKNOWN: 'unknown',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    SLOW: 'slow'
  }
}))

vi.mock('../services/errorReporter', () => ({
  errorReporter: {
    reportError: vi.fn(),
    getErrorHistory: vi.fn(() => [])
  }
}))

const createTestStore = () => {
  return configureStore({
    reducer: {
      chat: chatSlice
    }
  })
}

const TestWrapper = ({ children, store }) => (
  <Provider store={store}>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </Provider>
)

describe('Backend Unavailability Tests', () => {
  let store

  beforeEach(() => {
    store = createTestStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Backend Server Down', () => {
    it('should detect backend server unavailability', async () => {
      // Mock server unavailable status
      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: true,
        backendStatus: 'disconnected',
        lastHealthCheck: Date.now() - 10000,
        responseTime: null,
        errorCount: 5
      })

      const serverError = new Error('Server unavailable')
      serverError.status = 503
      serverError.code = 'SERVICE_UNAVAILABLE'
      requestManager.makeRequest.mockRejectedValue(serverError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Test message to unavailable server' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/server unavailable/i)).toBeInTheDocument()
      })

      // Should show server status indicator
      expect(screen.getByText(/server is down/i)).toBeInTheDocument()
    })

    it('should handle 500 internal server errors', async () => {
      const serverError = new Error('Internal Server Error')
      serverError.status = 500
      serverError.response = {
        status: 500,
        data: { error: 'Internal server error occurred' }
      }
      requestManager.makeRequest.mockRejectedValue(serverError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Server error test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument()
      })

      // Should provide retry option for server errors
      expect(screen.getByText(/try again/i)).toBeInTheDocument()
    })

    it('should handle 502 bad gateway errors', async () => {
      const gatewayError = new Error('Bad Gateway')
      gatewayError.status = 502
      gatewayError.response = {
        status: 502,
        data: { error: 'Bad gateway - upstream server error' }
      }
      requestManager.makeRequest.mockRejectedValue(gatewayError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Gateway error test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/gateway error/i)).toBeInTheDocument()
      })
    })

    it('should handle 504 gateway timeout errors', async () => {
      const timeoutError = new Error('Gateway Timeout')
      timeoutError.status = 504
      timeoutError.response = {
        status: 504,
        data: { error: 'Gateway timeout - upstream server did not respond' }
      }
      requestManager.makeRequest.mockRejectedValue(timeoutError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Gateway timeout test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/gateway timeout/i)).toBeInTheDocument()
      })
    })
  })

  describe('Backend Recovery', () => {
    it('should detect backend recovery and resume normal operation', async () => {
      // Start with server down
      healthMonitor.getConnectionStatus.mockReturnValueOnce({
        isOnline: true,
        backendStatus: 'disconnected',
        errorCount: 3
      })

      const serverError = new Error('Server unavailable')
      serverError.status = 503
      requestManager.makeRequest.mockRejectedValueOnce(serverError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Initial failed request
      fireEvent.change(chatInput, { target: { value: 'Test during downtime' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/server unavailable/i)).toBeInTheDocument()
      })

      // Simulate server recovery
      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: true,
        backendStatus: 'connected',
        lastHealthCheck: Date.now(),
        responseTime: 200,
        errorCount: 0
      })

      requestManager.makeRequest.mockResolvedValue({
        response: 'Server is back online!',
        conversation_id: 'test-conv',
        timestamp: new Date().toISOString()
      })

      // Retry after recovery
      fireEvent.click(screen.getByText(/try again/i))

      await waitFor(() => {
        expect(screen.getByText('Server is back online!')).toBeInTheDocument()
      })

      // Server status should be updated
      expect(screen.queryByText(/server is down/i)).not.toBeInTheDocument()
    })

    it('should automatically retry health checks during downtime', async () => {
      let healthCheckCount = 0
      healthMonitor.forceHealthCheck.mockImplementation(() => {
        healthCheckCount++
        if (healthCheckCount < 3) {
          return Promise.reject(new Error('Health check failed'))
        } else {
          return Promise.resolve({ status: 'healthy' })
        }
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Should attempt health checks
      expect(healthMonitor.forceHealthCheck).toHaveBeenCalled()
    })
  })

  describe('Partial Backend Failures', () => {
    it('should handle specific API endpoint failures', async () => {
      // Mock chat endpoint failure but health endpoint working
      requestManager.makeRequest.mockImplementation((config) => {
        if (config.url.includes('/api/chat')) {
          const error = new Error('Chat service unavailable')
          error.status = 503
          return Promise.reject(error)
        } else if (config.url.includes('/api/health')) {
          return Promise.resolve({ status: 'healthy' })
        }
        return Promise.resolve({ data: 'ok' })
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Chat service test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/chat service unavailable/i)).toBeInTheDocument()
      })
    })

    it('should handle database connection errors', async () => {
      const dbError = new Error('Database connection failed')
      dbError.status = 500
      dbError.response = {
        status: 500,
        data: { 
          error: 'Database connection failed',
          code: 'DB_CONNECTION_ERROR'
        }
      }
      requestManager.makeRequest.mockRejectedValue(dbError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Database error test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/database.*error/i)).toBeInTheDocument()
      })
    })
  })

  describe('Load Balancer and Proxy Issues', () => {
    it('should handle load balancer failures', async () => {
      const lbError = new Error('Load balancer error')
      lbError.status = 502
      lbError.response = {
        status: 502,
        data: { error: 'No healthy upstream servers' }
      }
      requestManager.makeRequest.mockRejectedValue(lbError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Load balancer test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/load balancer/i)).toBeInTheDocument()
      })
    })

    it('should handle reverse proxy timeouts', async () => {
      const proxyTimeoutError = new Error('Proxy timeout')
      proxyTimeoutError.status = 504
      proxyTimeoutError.code = 'PROXY_TIMEOUT'
      requestManager.makeRequest.mockRejectedValue(proxyTimeoutError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Proxy timeout test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/proxy timeout/i)).toBeInTheDocument()
      })
    })
  })

  describe('Session Management During Downtime', () => {
    it('should preserve conversation state during backend downtime', async () => {
      // Start with successful conversation
      requestManager.makeRequest.mockResolvedValueOnce({
        response: 'Hello! How can I help?',
        conversation_id: 'test-conv-123',
        timestamp: new Date().toISOString()
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // First successful message
      fireEvent.change(chatInput, { target: { value: 'Hello' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('Hello! How can I help?')).toBeInTheDocument()
      })

      // Backend goes down
      const serverError = new Error('Server unavailable')
      serverError.status = 503
      requestManager.makeRequest.mockRejectedValue(serverError)

      // Try to send another message
      fireEvent.change(chatInput, { target: { value: 'Are you still there?' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/server unavailable/i)).toBeInTheDocument()
      })

      // Previous conversation should still be visible
      expect(screen.getByText('Hello')).toBeInTheDocument()
      expect(screen.getByText('Hello! How can I help?')).toBeInTheDocument()
    })

    it('should handle session timeout during backend downtime', async () => {
      const sessionError = new Error('Session expired')
      sessionError.status = 401
      sessionError.response = {
        status: 401,
        data: { error: 'Session expired or invalid' }
      }
      requestManager.makeRequest.mockRejectedValue(sessionError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Session timeout test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/session expired/i)).toBeInTheDocument()
      })
    })
  })

  describe('Error Reporting During Downtime', () => {
    it('should report backend errors for monitoring', async () => {
      const serverError = new Error('Backend service crashed')
      serverError.status = 500
      requestManager.makeRequest.mockRejectedValue(serverError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Error reporting test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(errorReporter.reportError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Backend service crashed',
            status: 500
          }),
          expect.objectContaining({
            context: 'chat_message_send'
          })
        )
      })
    })

    it('should track backend downtime duration', async () => {
      vi.useFakeTimers()
      
      // Mock extended downtime
      const serverError = new Error('Extended downtime')
      serverError.status = 503
      requestManager.makeRequest.mockRejectedValue(serverError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Initial failure
      fireEvent.change(chatInput, { target: { value: 'Downtime tracking test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/server unavailable/i)).toBeInTheDocument()
      })

      // Advance time to simulate extended downtime
      vi.advanceTimersByTime(300000) // 5 minutes

      // Should show downtime duration
      expect(screen.getByText(/5 minutes/i)).toBeInTheDocument()

      vi.useRealTimers()
    })
  })

  describe('Graceful Degradation', () => {
    it('should provide offline mode during extended downtime', async () => {
      // Mock extended backend unavailability
      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: true,
        backendStatus: 'disconnected',
        lastHealthCheck: Date.now() - 600000, // 10 minutes ago
        errorCount: 10
      })

      const serverError = new Error('Extended server downtime')
      serverError.status = 503
      requestManager.makeRequest.mockRejectedValue(serverError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Should show offline mode indicator
      await waitFor(() => {
        expect(screen.getByText(/offline mode/i)).toBeInTheDocument()
      })

      // Should provide limited functionality
      expect(screen.getByText(/limited functionality/i)).toBeInTheDocument()
    })

    it('should cache previous responses for offline viewing', async () => {
      // Start with successful conversation
      requestManager.makeRequest.mockResolvedValueOnce({
        response: 'This response should be cached',
        conversation_id: 'test-conv',
        timestamp: new Date().toISOString()
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Send successful message
      fireEvent.change(chatInput, { target: { value: 'Cache test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('This response should be cached')).toBeInTheDocument()
      })

      // Backend goes down
      const serverError = new Error('Server down')
      serverError.status = 503
      requestManager.makeRequest.mockRejectedValue(serverError)

      // Previous messages should still be visible
      expect(screen.getByText('Cache test')).toBeInTheDocument()
      expect(screen.getByText('This response should be cached')).toBeInTheDocument()
    })
  })
})