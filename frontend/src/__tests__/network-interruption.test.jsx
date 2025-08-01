/**
 * Integration tests for network interruption scenarios
 * Tests how the application handles various network connectivity issues
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
import axios from 'axios'

// Mock axios and services
vi.mock('axios')
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

describe('Network Interruption Integration Tests', () => {
  let store

  beforeEach(() => {
    store = createTestStore()
    vi.clearAllMocks()
    // Reset network status
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Network Connectivity Loss', () => {
    it('should detect network disconnection and show offline indicator', async () => {
      // Mock offline status
      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: false,
        backendStatus: 'disconnected',
        lastHealthCheck: Date.now() - 5000,
        responseTime: null,
        errorCount: 3
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Simulate network disconnection
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      })

      // Trigger offline event
      window.dispatchEvent(new Event('offline'))

      await waitFor(() => {
        expect(screen.getByText(/offline/i)).toBeInTheDocument()
      })
    })

    it('should handle message sending during network interruption', async () => {
      // Mock network error during request
      const networkError = new Error('Network Error')
      networkError.code = 'NETWORK_ERROR'
      requestManager.makeRequest.mockRejectedValue(networkError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Test message during network issue' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })

      // Should show retry option
      expect(screen.getByText(/try again/i)).toBeInTheDocument()
    })

    it('should queue messages during network interruption', async () => {
      // Mock initial network failure then success
      requestManager.makeRequest
        .mockRejectedValueOnce(new Error('Network unavailable'))
        .mockResolvedValueOnce({
          response: 'Message sent after reconnection',
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

      // Send message during network issue
      fireEvent.change(chatInput, { target: { value: 'Queued message' } })
      fireEvent.click(sendButton)

      // Should show error initially
      await waitFor(() => {
        expect(screen.getByText(/try again/i)).toBeInTheDocument()
      })

      // Retry after network recovery
      fireEvent.click(screen.getByText(/try again/i))

      await waitFor(() => {
        expect(screen.getByText('Message sent after reconnection')).toBeInTheDocument()
      })
    })

    it('should handle intermittent connectivity issues', async () => {
      let callCount = 0
      requestManager.makeRequest.mockImplementation(() => {
        callCount++
        if (callCount % 2 === 1) {
          // Odd calls fail (intermittent failure)
          return Promise.reject(new Error('Connection timeout'))
        } else {
          // Even calls succeed
          return Promise.resolve({
            response: `Success on attempt ${callCount}`,
            conversation_id: 'test-conv',
            timestamp: new Date().toISOString()
          })
        }
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // First message (will fail)
      fireEvent.change(chatInput, { target: { value: 'First message' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/try again/i)).toBeInTheDocument()
      })

      // Retry (will succeed)
      fireEvent.click(screen.getByText(/try again/i))

      await waitFor(() => {
        expect(screen.getByText('Success on attempt 2')).toBeInTheDocument()
      })
    })
  })

  describe('DNS Resolution Failures', () => {
    it('should handle DNS resolution errors', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND')
      dnsError.code = 'ENOTFOUND'
      requestManager.makeRequest.mockRejectedValue(dnsError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'DNS test message' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/server not found/i)).toBeInTheDocument()
      })
    })
  })

  describe('Connection Reset Scenarios', () => {
    it('should handle connection reset by peer', async () => {
      const resetError = new Error('Connection reset by peer')
      resetError.code = 'ECONNRESET'
      requestManager.makeRequest.mockRejectedValue(resetError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Connection reset test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/connection was reset/i)).toBeInTheDocument()
      })

      // Should provide retry option
      expect(screen.getByText(/try again/i)).toBeInTheDocument()
    })
  })

  describe('Slow Network Conditions', () => {
    it('should handle slow network with timeout warnings', async () => {
      vi.useFakeTimers()

      // Mock slow response
      let resolveRequest
      const slowPromise = new Promise((resolve) => {
        resolveRequest = resolve
      })
      requestManager.makeRequest.mockReturnValue(slowPromise)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Slow network test' } })
      fireEvent.click(sendButton)

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText(/please wait/i)).toBeInTheDocument()
      })

      // Fast forward to show timeout warning
      vi.advanceTimersByTime(15000) // 15 seconds

      await waitFor(() => {
        expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument()
      })

      // Should show cancel option
      expect(screen.getByText(/cancel/i)).toBeInTheDocument()

      vi.useRealTimers()
    })

    it('should allow cancellation of slow requests', async () => {
      vi.useFakeTimers()

      // Mock hanging request
      requestManager.makeRequest.mockImplementation(() => new Promise(() => {}))
      requestManager.cancelAllRequests.mockReturnValue(1)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Cancellation test' } })
      fireEvent.click(sendButton)

      // Wait for timeout warning
      vi.advanceTimersByTime(15000)

      await waitFor(() => {
        expect(screen.getByText(/cancel/i)).toBeInTheDocument()
      })

      // Cancel the request
      fireEvent.click(screen.getByText(/cancel/i))

      await waitFor(() => {
        expect(requestManager.cancelAllRequests).toHaveBeenCalled()
      })

      vi.useRealTimers()
    })
  })

  describe('Network Recovery', () => {
    it('should detect network recovery and resume operations', async () => {
      // Start with offline status
      healthMonitor.getConnectionStatus.mockReturnValueOnce({
        isOnline: false,
        backendStatus: 'disconnected'
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Should show offline indicator
      await waitFor(() => {
        expect(screen.getByText(/offline/i)).toBeInTheDocument()
      })

      // Simulate network recovery
      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: true,
        backendStatus: 'connected',
        lastHealthCheck: Date.now(),
        responseTime: 150
      })

      // Trigger online event
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      })
      window.dispatchEvent(new Event('online'))

      await waitFor(() => {
        expect(screen.queryByText(/offline/i)).not.toBeInTheDocument()
      })
    })

    it('should automatically retry failed requests after recovery', async () => {
      // Mock initial failure then success after recovery
      requestManager.makeRequest
        .mockRejectedValueOnce(new Error('Network unavailable'))
        .mockResolvedValueOnce({
          response: 'Success after recovery',
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

      // Send message during network issue
      fireEvent.change(chatInput, { target: { value: 'Recovery test message' } })
      fireEvent.click(sendButton)

      // Should show error
      await waitFor(() => {
        expect(screen.getByText(/try again/i)).toBeInTheDocument()
      })

      // Simulate network recovery and retry
      fireEvent.click(screen.getByText(/try again/i))

      await waitFor(() => {
        expect(screen.getByText('Success after recovery')).toBeInTheDocument()
      })
    })
  })

  describe('Proxy Connection Issues', () => {
    it('should handle proxy timeout errors', async () => {
      const proxyError = new Error('Proxy timeout')
      proxyError.code = 'PROXY_TIMEOUT'
      requestManager.makeRequest.mockRejectedValue(proxyError)

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

    it('should handle proxy connection refused', async () => {
      const proxyError = new Error('Proxy connection refused')
      proxyError.code = 'ECONNREFUSED'
      requestManager.makeRequest.mockRejectedValue(proxyError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Proxy connection test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/connection refused/i)).toBeInTheDocument()
      })
    })
  })
})