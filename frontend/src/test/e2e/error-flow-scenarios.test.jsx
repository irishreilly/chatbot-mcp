/**
 * End-to-end tests for complete user flows with error scenarios
 * Tests complete user journeys when errors occur at different stages
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import chatSlice from '../../store/chatSlice'
import ChatPage from '../../pages/ChatPage'
import { requestManager } from '../../services/requestManager'
import { healthMonitor } from '../../services/healthMonitor'
import { errorReporter } from '../../services/errorReporter'

// Mock services
vi.mock('../../services/requestManager', () => ({
  requestManager: {
    makeRequest: vi.fn(),
    cancelAllRequests: vi.fn(),
    getActiveRequests: vi.fn(() => []),
    getStats: vi.fn(() => ({ total: 0, successful: 0, failed: 0 })),
    cancelRequest: vi.fn()
  }
}))

vi.mock('../../services/healthMonitor', () => ({
  healthMonitor: {
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    getConnectionStatus: vi.fn(() => ({ isOnline: true, backendStatus: 'connected' })),
    onStatusChange: vi.fn(),
    forceHealthCheck: vi.fn()
  }
}))

vi.mock('../../services/errorReporter', () => ({
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

describe('End-to-End Error Flow Scenarios', () => {
  let store
  let user

  beforeEach(() => {
    store = createTestStore()
    user = userEvent.setup()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Complete Chat Session with Network Interruption', () => {
    it('should handle complete user journey with network failure and recovery', async () => {
      // Start with successful conversation
      requestManager.makeRequest.mockResolvedValueOnce({
        response: 'Hello! How can I help you today?',
        conversation_id: 'test-conv-123',
        timestamp: new Date().toISOString()
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Welcome to MCP Chatbot')).toBeInTheDocument()
      })

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Step 1: Successful initial conversation
      await user.type(chatInput, 'Hello, I need help with something')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('Hello! How can I help you today?')).toBeInTheDocument()
      })

      // Step 2: Network interruption occurs
      const networkError = new Error('Network connection lost')
      networkError.code = 'NETWORK_ERROR'
      requestManager.makeRequest.mockRejectedValue(networkError)

      // Update health monitor to show disconnected state
      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: false,
        backendStatus: 'disconnected',
        lastHealthCheck: Date.now() - 5000,
        errorCount: 1
      })

      // Step 3: User tries to send another message during network issue
      await user.clear(chatInput)
      await user.type(chatInput, 'Can you help me with my project?')
      await user.click(sendButton)

      // Should show network error
      await waitFor(() => {
        expect(screen.getByText(/network.*error/i)).toBeInTheDocument()
      })

      // Should show offline indicator
      expect(screen.getByText(/offline/i)).toBeInTheDocument()

      // Should show retry option
      expect(screen.getByText(/try again/i)).toBeInTheDocument()

      // Step 4: User attempts retry while still offline
      await user.click(screen.getByText(/try again/i))

      await waitFor(() => {
        expect(screen.getByText(/still.*offline/i)).toBeInTheDocument()
      })

      // Step 5: Network recovery
      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: true,
        backendStatus: 'connected',
        lastHealthCheck: Date.now(),
        responseTime: 150,
        errorCount: 0
      })

      requestManager.makeRequest.mockResolvedValue({
        response: 'I\'d be happy to help with your project! What do you need assistance with?',
        conversation_id: 'test-conv-123',
        timestamp: new Date().toISOString()
      })

      // Step 6: User retries after network recovery
      await user.click(screen.getByText(/try again/i))

      await waitFor(() => {
        expect(screen.getByText('I\'d be happy to help with your project!')).toBeInTheDocument()
      })

      // Should no longer show offline indicator
      expect(screen.queryByText(/offline/i)).not.toBeInTheDocument()

      // Step 7: Continue normal conversation
      await user.clear(chatInput)
      await user.type(chatInput, 'Thank you! The connection is working again.')
      await user.click(sendButton)

      requestManager.makeRequest.mockResolvedValue({
        response: 'Great! I\'m glad the connection is stable now. How can I assist you?',
        conversation_id: 'test-conv-123',
        timestamp: new Date().toISOString()
      })

      await waitFor(() => {
        expect(screen.getByText('Great! I\'m glad the connection is stable now.')).toBeInTheDocument()
      })

      // Verify complete conversation history is preserved
      expect(screen.getByText('Hello, I need help with something')).toBeInTheDocument()
      expect(screen.getByText('Hello! How can I help you today?')).toBeInTheDocument()
      expect(screen.getByText('Can you help me with my project?')).toBeInTheDocument()
      expect(screen.getByText('I\'d be happy to help with your project!')).toBeInTheDocument()
      expect(screen.getByText('Thank you! The connection is working again.')).toBeInTheDocument()
    })

    it('should handle message queuing during intermittent connectivity', async () => {
      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Simulate intermittent connectivity - alternating success/failure
      let requestCount = 0
      requestManager.makeRequest.mockImplementation(() => {
        requestCount++
        if (requestCount % 2 === 1) {
          // Odd requests fail
          return Promise.reject(new Error('Intermittent network error'))
        } else {
          // Even requests succeed
          return Promise.resolve({
            response: `Response to message ${Math.floor(requestCount / 2)}`,
            conversation_id: 'test-conv',
            timestamp: new Date().toISOString()
          })
        }
      })

      // Send multiple messages during intermittent connectivity
      const messages = [
        'First message',
        'Second message', 
        'Third message'
      ]

      for (let i = 0; i < messages.length; i++) {
        await user.clear(chatInput)
        await user.type(chatInput, messages[i])
        await user.click(sendButton)

        if (i % 2 === 0) {
          // Odd messages (0, 2) will fail initially
          await waitFor(() => {
            expect(screen.getByText(/try again/i)).toBeInTheDocument()
          })
          
          // Retry the failed message
          await user.click(screen.getByText(/try again/i))
        }

        // Wait for success response
        await waitFor(() => {
          expect(screen.getByText(`Response to message ${i + 1}`)).toBeInTheDocument()
        })
      }

      // Verify all messages were eventually sent successfully
      messages.forEach((message, index) => {
        expect(screen.getByText(message)).toBeInTheDocument()
        expect(screen.getByText(`Response to message ${index + 1}`)).toBeInTheDocument()
      })
    })
  })

  describe('Backend Server Downtime Scenarios', () => {
    it('should handle complete user journey during backend maintenance', async () => {
      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Step 1: Backend goes down for maintenance
      const maintenanceError = new Error('Service temporarily unavailable for maintenance')
      maintenanceError.status = 503
      maintenanceError.response = {
        status: 503,
        data: { 
          error: 'Service under maintenance',
          estimatedDowntime: '15 minutes'
        }
      }
      requestManager.makeRequest.mockRejectedValue(maintenanceError)

      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: true,
        backendStatus: 'maintenance',
        lastHealthCheck: Date.now() - 1000,
        errorCount: 1
      })

      // Step 2: User tries to send message during maintenance
      await user.type(chatInput, 'Is the service working?')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/maintenance/i)).toBeInTheDocument()
      })

      // Should show estimated downtime
      expect(screen.getByText(/15 minutes/i)).toBeInTheDocument()

      // Should show maintenance mode indicator
      expect(screen.getByText(/service.*maintenance/i)).toBeInTheDocument()

      // Step 3: User waits and tries again
      vi.useFakeTimers()
      
      // Fast forward 5 minutes
      vi.advanceTimersByTime(300000)
      
      await user.click(screen.getByText(/try again/i))

      await waitFor(() => {
        expect(screen.getByText(/still.*maintenance/i)).toBeInTheDocument()
      })

      // Step 4: Service comes back online
      requestManager.makeRequest.mockResolvedValue({
        response: 'Service is back online! How can I help you?',
        conversation_id: 'new-conv-after-maintenance',
        timestamp: new Date().toISOString()
      })

      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: true,
        backendStatus: 'connected',
        lastHealthCheck: Date.now(),
        responseTime: 200,
        errorCount: 0
      })

      // Fast forward to end of maintenance window
      vi.advanceTimersByTime(600000) // 10 more minutes

      // Step 5: User retries after maintenance
      await user.click(screen.getByText(/try again/i))

      await waitFor(() => {
        expect(screen.getByText('Service is back online!')).toBeInTheDocument()
      })

      // Should no longer show maintenance indicator
      expect(screen.queryByText(/maintenance/i)).not.toBeInTheDocument()

      // Step 6: Continue normal operation
      await user.clear(chatInput)
      await user.type(chatInput, 'Great! Everything is working now.')
      await user.click(sendButton)

      requestManager.makeRequest.mockResolvedValue({
        response: 'Yes, all systems are operational. Thanks for your patience!',
        conversation_id: 'new-conv-after-maintenance',
        timestamp: new Date().toISOString()
      })

      await waitFor(() => {
        expect(screen.getByText('Yes, all systems are operational.')).toBeInTheDocument()
      })

      vi.useRealTimers()
    })

    it('should handle database connection failures with graceful degradation', async () => {
      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Step 1: Database connection fails
      const dbError = new Error('Database connection failed')
      dbError.status = 500
      dbError.response = {
        status: 500,
        data: { 
          error: 'Database unavailable',
          code: 'DB_CONNECTION_ERROR'
        }
      }
      requestManager.makeRequest.mockRejectedValue(dbError)

      await user.type(chatInput, 'Can you save my conversation?')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/database.*error/i)).toBeInTheDocument()
      })

      // Should show degraded functionality warning
      expect(screen.getByText(/limited.*functionality/i)).toBeInTheDocument()

      // Step 2: Offer offline mode
      expect(screen.getByText(/offline.*mode/i)).toBeInTheDocument()

      // Step 3: User continues in offline mode
      await user.click(screen.getByText(/continue.*offline/i))

      // Should show offline mode indicator
      await waitFor(() => {
        expect(screen.getByText(/offline.*mode.*active/i)).toBeInTheDocument()
      })

      // Step 4: User can still interact locally
      await user.clear(chatInput)
      await user.type(chatInput, 'This should work in offline mode')
      
      // Input should still be functional
      expect(chatInput.value).toBe('This should work in offline mode')

      // Step 5: Database recovers
      requestManager.makeRequest.mockResolvedValue({
        response: 'Database is back online. Your conversation has been restored.',
        conversation_id: 'restored-conv',
        timestamp: new Date().toISOString()
      })

      // Simulate database recovery notification
      healthMonitor.getConnectionStatus.mockReturnValue({
        isOnline: true,
        backendStatus: 'connected',
        lastHealthCheck: Date.now(),
        responseTime: 180,
        errorCount: 0
      })

      // Should show recovery notification
      await waitFor(() => {
        expect(screen.getByText(/service.*restored/i)).toBeInTheDocument()
      })

      // Step 6: Resume normal operation
      await user.click(screen.getByText(/resume.*normal/i))

      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('Database is back online.')).toBeInTheDocument()
      })

      // Should no longer show offline mode
      expect(screen.queryByText(/offline.*mode.*active/i)).not.toBeInTheDocument()
    })
  })

  describe('Timeout and Cancellation Scenarios', () => {
    it('should handle complete user journey with request timeouts', async () => {
      vi.useFakeTimers()

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Step 1: User sends message that will timeout
      requestManager.makeRequest.mockImplementation(() => new Promise(() => {})) // Hanging promise

      await user.type(chatInput, 'This request will timeout')
      await user.click(sendButton)

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText(/please wait/i)).toBeInTheDocument()
      })

      // Step 2: Show timeout warning after delay
      vi.advanceTimersByTime(15000) // 15 seconds

      await waitFor(() => {
        expect(screen.getByText(/taking longer.*expected/i)).toBeInTheDocument()
      })

      // Should show cancel option
      expect(screen.getByText(/cancel/i)).toBeInTheDocument()

      // Step 3: User cancels the request
      requestManager.cancelRequest.mockReturnValue(true)
      
      await user.click(screen.getByText(/cancel/i))

      await waitFor(() => {
        expect(screen.getByText(/request.*cancelled/i)).toBeInTheDocument()
      })

      // Should no longer show loading state
      expect(screen.queryByText(/please wait/i)).not.toBeInTheDocument()

      // Step 4: User tries again with successful request
      requestManager.makeRequest.mockResolvedValue({
        response: 'This request completed successfully!',
        conversation_id: 'test-conv',
        timestamp: new Date().toISOString()
      })

      await user.clear(chatInput)
      await user.type(chatInput, 'Let me try again')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('This request completed successfully!')).toBeInTheDocument()
      })

      // Should show both messages in history
      expect(screen.getByText('This request will timeout')).toBeInTheDocument()
      expect(screen.getByText('Let me try again')).toBeInTheDocument()

      vi.useRealTimers()
    })

    it('should handle multiple concurrent requests with selective cancellation', async () => {
      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Mock multiple hanging requests
      let requestId = 0
      const activeRequests = new Map()

      requestManager.makeRequest.mockImplementation(() => {
        const id = ++requestId
        const promise = new Promise(() => {}) // Hanging promise
        activeRequests.set(id, promise)
        return promise
      })

      requestManager.getActiveRequests.mockImplementation(() => {
        return Array.from(activeRequests.entries()).map(([id]) => ({
          id: `request-${id}`,
          url: '/api/chat',
          method: 'POST',
          status: 'pending',
          startTime: Date.now()
        }))
      })

      requestManager.cancelRequest.mockImplementation((requestId) => {
        const id = parseInt(requestId.replace('request-', ''))
        return activeRequests.delete(id)
      })

      // Step 1: Send multiple messages quickly
      const messages = ['First message', 'Second message', 'Third message']
      
      for (const message of messages) {
        await user.clear(chatInput)
        await user.type(chatInput, message)
        await user.click(sendButton)
      }

      // Should show multiple loading states
      await waitFor(() => {
        expect(screen.getAllByText(/please wait/i)).toHaveLength(3)
      })

      // Step 2: Open diagnostic panel to see active requests
      const diagnosticButton = screen.getByLabelText('Open diagnostic panel')
      await user.click(diagnosticButton)

      await waitFor(() => {
        expect(screen.getByText(/active requests/i)).toBeInTheDocument()
      })

      // Should show 3 active requests
      expect(screen.getByText('3')).toBeInTheDocument() // Active request count

      // Step 3: Cancel specific request
      const cancelButtons = screen.getAllByText(/cancel/i)
      await user.click(cancelButtons[1]) // Cancel second request

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument() // Reduced to 2 active requests
      })

      // Step 4: Cancel all remaining requests
      await user.click(screen.getByText(/cancel all/i))

      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument() // No active requests
      })

      // Should show cancellation messages
      expect(screen.getAllByText(/cancelled/i)).toHaveLength(3)
    })
  })

  describe('Error Recovery and User Experience', () => {
    it('should provide comprehensive error recovery journey', async () => {
      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Step 1: Start with network error
      const networkError = new Error('Network connection failed')
      networkError.code = 'NETWORK_ERROR'
      requestManager.makeRequest.mockRejectedValue(networkError)

      await user.type(chatInput, 'Initial message with network error')
      await user.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/network.*error/i)).toBeInTheDocument()
      })

      // Should show error details and suggestions
      expect(screen.getByText(/check.*connection/i)).toBeInTheDocument()
      expect(screen.getByText(/try again/i)).toBeInTheDocument()

      // Step 2: User follows troubleshooting steps
      await user.click(screen.getByText(/troubleshoot/i))

      await waitFor(() => {
        expect(screen.getByText(/troubleshooting/i)).toBeInTheDocument()
      })

      // Should show diagnostic information
      expect(screen.getByText(/connection status/i)).toBeInTheDocument()
      expect(screen.getByText(/network diagnostics/i)).toBeInTheDocument()

      // Step 3: User runs network diagnostic
      await user.click(screen.getByText(/run diagnostic/i))

      await waitFor(() => {
        expect(screen.getByText(/diagnostic.*complete/i)).toBeInTheDocument()
      })

      // Should show diagnostic results
      expect(screen.getByText(/dns.*resolution/i)).toBeInTheDocument()
      expect(screen.getByText(/connectivity.*test/i)).toBeInTheDocument()

      // Step 4: Network issue resolves
      requestManager.makeRequest.mockResolvedValue({
        response: 'Network is working now! Your message was received.',
        conversation_id: 'recovered-conv',
        timestamp: new Date().toISOString()
      })

      await user.click(screen.getByText(/retry.*original.*message/i))

      await waitFor(() => {
        expect(screen.getByText('Network is working now!')).toBeInTheDocument()
      })

      // Step 5: Continue normal conversation
      await user.clear(chatInput)
      await user.type(chatInput, 'Thank you for the help with troubleshooting!')
      await user.click(sendButton)

      requestManager.makeRequest.mockResolvedValue({
        response: 'You\'re welcome! I\'m glad we got the connection working.',
        conversation_id: 'recovered-conv',
        timestamp: new Date().toISOString()
      })

      await waitFor(() => {
        expect(screen.getByText('You\'re welcome! I\'m glad we got the connection working.')).toBeInTheDocument()
      })

      // Should preserve complete interaction history including error recovery
      expect(screen.getByText('Initial message with network error')).toBeInTheDocument()
      expect(screen.getByText('Thank you for the help with troubleshooting!')).toBeInTheDocument()
    })

    it('should handle progressive error escalation', async () => {
      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Step 1: Start with minor timeout
      let attemptCount = 0
      requestManager.makeRequest.mockImplementation(() => {
        attemptCount++
        if (attemptCount === 1) {
          return Promise.reject(new Error('Request timeout'))
        } else if (attemptCount === 2) {
          return Promise.reject(new Error('Server error'))
        } else if (attemptCount === 3) {
          return Promise.reject(new Error('Service unavailable'))
        } else {
          return Promise.resolve({
            response: 'Finally working after multiple attempts!',
            conversation_id: 'persistent-conv',
            timestamp: new Date().toISOString()
          })
        }
      })

      await user.type(chatInput, 'Message with escalating errors')
      await user.click(sendButton)

      // First error: Timeout
      await waitFor(() => {
        expect(screen.getByText(/timeout/i)).toBeInTheDocument()
      })

      await user.click(screen.getByText(/try again/i))

      // Second error: Server error
      await waitFor(() => {
        expect(screen.getByText(/server error/i)).toBeInTheDocument()
      })

      // Should show escalated error handling
      expect(screen.getByText(/multiple.*attempts/i)).toBeInTheDocument()

      await user.click(screen.getByText(/try again/i))

      // Third error: Service unavailable
      await waitFor(() => {
        expect(screen.getByText(/service unavailable/i)).toBeInTheDocument()
      })

      // Should show advanced troubleshooting options
      expect(screen.getByText(/advanced.*options/i)).toBeInTheDocument()
      expect(screen.getByText(/contact.*support/i)).toBeInTheDocument()

      // Final attempt succeeds
      await user.click(screen.getByText(/try again/i))

      await waitFor(() => {
        expect(screen.getByText('Finally working after multiple attempts!')).toBeInTheDocument()
      })

      // Should show success after persistence
      expect(screen.getByText(/resolved.*after.*attempts/i)).toBeInTheDocument()
    })
  })
})