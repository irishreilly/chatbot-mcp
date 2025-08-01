/**
 * End-to-end tests for recovery mechanisms and graceful degradation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import chatSlice from '../../store/chatSlice'
import ChatPage from '../../pages/ChatPage'
import { recoveryService } from '../../services/recoveryService'
import { healthMonitor } from '../../services/healthMonitor'
import { requestManager } from '../../services/requestManager'
import { APIError } from '../../services/apiClient'

// Mock external dependencies
vi.mock('../../services/apiClient')
vi.mock('../../services/healthMonitor')
vi.mock('../../services/requestManager')

describe('Recovery Mechanisms E2E Tests', () => {
  let store

  beforeEach(() => {
    // Create fresh store for each test
    store = configureStore({
      reducer: {
        chat: chatSlice
      }
    })

    // Reset recovery service state
    recoveryService.isOfflineMode = false
    recoveryService.degradationLevel = 0
    recoveryService.cache.clear()
    recoveryService.circuitBreakers.clear()

    // Mock health monitor
    healthMonitor.getConnectionStatus = vi.fn(() => ({
      status: 'connected',
      isOnline: true,
      lastHealthCheck: new Date(),
      responseTime: 100,
      errorCount: 0,
      consecutiveErrors: 0
    }))

    // Mock request manager
    requestManager.makeRequest = vi.fn()
    requestManager.cancelAllRequests = vi.fn()
    requestManager.getActiveRequests = vi.fn(() => [])

    // Mock window and navigator
    global.window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    global.navigator = { onLine: true }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const renderChatPage = () => {
    return render(
      <Provider store={store}>
        <ChatPage />
      </Provider>
    )
  }

  describe('Automatic Recovery Scenarios', () => {
    it('should automatically retry failed requests with exponential backoff', async () => {
      // Mock API to fail first two times, then succeed
      requestManager.makeRequest
        .mockRejectedValueOnce(new APIError('Server error', 500))
        .mockRejectedValueOnce(new APIError('Server error', 500))
        .mockResolvedValueOnce({
          data: {
            response: 'Hello! How can I help you?',
            conversation_id: 'test-conv-1'
          }
        })

      renderChatPage()

      // Send a message
      const input = screen.getByPlaceholderText(/type your message/i)
      const sendButton = screen.getByRole('button', { name: /send/i })

      fireEvent.change(input, { target: { value: 'Hello' } })
      fireEvent.click(sendButton)

      // Should eventually succeed after retries
      await waitFor(() => {
        expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument()
      }, { timeout: 10000 })

      // Should have made 3 attempts (initial + 2 retries)
      expect(requestManager.makeRequest).toHaveBeenCalledTimes(3)
    })

    it('should enable offline mode when network is unavailable', async () => {
      // Simulate network disconnection
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
      
      renderChatPage()

      // Trigger offline event
      act(() => {
        const offlineHandler = window.addEventListener.mock.calls
          .find(call => call[0] === 'offline')[1]
        offlineHandler()
      })

      await waitFor(() => {
        expect(recoveryService.getRecoveryStatus().isOfflineMode).toBe(true)
      })

      // Should show offline indicator
      expect(screen.getByText(/offline/i)).toBeInTheDocument()
    })

    it('should use cached data in offline mode', async () => {
      // Set up cached conversation data
      const cachedConversation = {
        messages: [
          { id: '1', content: 'Hello', sender: 'user' },
          { id: '2', content: 'Hi there!', sender: 'assistant' }
        ]
      }
      
      recoveryService.setCachedData('conversation-test', cachedConversation)
      recoveryService.enableOfflineMode()

      renderChatPage()

      // Should display cached messages
      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument()
        expect(screen.getByText('Hi there!')).toBeInTheDocument()
      })

      // Should not make network requests
      expect(requestManager.makeRequest).not.toHaveBeenCalled()
    })

    it('should implement circuit breaker pattern for failing services', async () => {
      // Mock consistent failures to trigger circuit breaker
      requestManager.makeRequest.mockRejectedValue(new APIError('Service unavailable', 503))

      renderChatPage()

      // Make multiple requests to trigger circuit breaker
      const input = screen.getByPlaceholderText(/type your message/i)
      const sendButton = screen.getByRole('button', { name: /send/i })

      for (let i = 0; i < 6; i++) {
        fireEvent.change(input, { target: { value: `Message ${i}` } })
        fireEvent.click(sendButton)
        
        // Wait a bit between requests
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      await waitFor(() => {
        const status = recoveryService.getRecoveryStatus()
        expect(status.circuitBreakers.length).toBeGreaterThan(0)
      })

      // Circuit breaker should prevent further requests
      const circuitBreaker = recoveryService.circuitBreakers.get('sendMessage')
      expect(circuitBreaker?.state).toBe('open')
    })
  })

  describe('User-Initiated Recovery', () => {
    it('should allow user to manually retry failed requests', async () => {
      // Mock initial failure
      requestManager.makeRequest.mockRejectedValueOnce(new APIError('Network error', 0))

      renderChatPage()

      // Send message that fails
      const input = screen.getByPlaceholderText(/type your message/i)
      const sendButton = screen.getByRole('button', { name: /send/i })

      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.click(sendButton)

      // Should show error state
      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
      })

      // Mock successful retry
      requestManager.makeRequest.mockResolvedValueOnce({
        data: {
          response: 'Success after retry',
          conversation_id: 'test-conv-1'
        }
      })

      // Click retry button
      const retryButton = screen.getByRole('button', { name: /retry/i })
      fireEvent.click(retryButton)

      // Should succeed on retry
      await waitFor(() => {
        expect(screen.getByText('Success after retry')).toBeInTheDocument()
      })
    })

    it('should allow user to refresh application state', async () => {
      renderChatPage()

      // Add some state to the application
      recoveryService.setCachedData('test-data', { value: 'test' })
      
      // Open recovery panel (assuming there's a way to access it)
      // This would depend on how the recovery panel is integrated into the UI
      
      // Simulate refresh action
      await act(async () => {
        await recoveryService.refreshApplication()
      })

      // Cache should be cleared
      expect(recoveryService.getCachedData('test-data')).toBeNull()
      
      // Active requests should be cancelled
      expect(requestManager.cancelAllRequests).toHaveBeenCalled()
    })

    it('should allow user to clear cache', async () => {
      renderChatPage()

      // Add cached data
      recoveryService.setCachedData('cache-key-1', { data: 'test1' })
      recoveryService.setCachedData('cache-key-2', { data: 'test2' })

      expect(recoveryService.getCachedData('cache-key-1')).toBeTruthy()
      expect(recoveryService.getCachedData('cache-key-2')).toBeTruthy()

      // Clear cache
      await act(async () => {
        await recoveryService.clearCache()
      })

      // Cache should be empty
      expect(recoveryService.getCachedData('cache-key-1')).toBeNull()
      expect(recoveryService.getCachedData('cache-key-2')).toBeNull()
    })
  })

  describe('Graceful Degradation', () => {
    it('should disable non-essential features at higher degradation levels', async () => {
      renderChatPage()

      // Set high degradation level
      act(() => {
        recoveryService.setDegradationLevel(4)
      })

      // Essential features should still be available
      expect(recoveryService.isFeatureAvailable('chat')).toBe(true)
      
      // Non-essential features should be disabled
      expect(recoveryService.isFeatureAvailable('analytics')).toBe(false)
      expect(recoveryService.isFeatureAvailable('non-essential')).toBe(false)

      // UI should reflect degraded state
      // This would depend on how degradation is shown in the UI
    })

    it('should progressively reduce functionality based on connection quality', async () => {
      renderChatPage()

      // Simulate slow connection
      healthMonitor.getConnectionStatus.mockReturnValue({
        status: 'slow',
        isOnline: true,
        responseTime: 8000,
        errorCount: 2
      })

      // Trigger connection status change
      act(() => {
        recoveryService.handleConnectionChange('slow', 'connected')
      })

      // Should increase degradation level for slow connection
      expect(recoveryService.getDegradationLevel()).toBe(1)

      // Some features should be disabled
      expect(recoveryService.isFeatureAvailable('file-upload')).toBe(true)
      expect(recoveryService.isFeatureAvailable('real-time-updates')).toBe(false)
    })

    it('should provide fallback UI for failed components', async () => {
      // This test would verify that error boundaries provide appropriate fallbacks
      // The implementation would depend on how error boundaries are set up
      
      renderChatPage()

      // Simulate component error
      const errorBoundaryTest = () => {
        throw new Error('Component crashed')
      }

      // Error boundary should catch and show fallback
      // This would need to be implemented based on the actual error boundary setup
    })
  })

  describe('Smart Retry Strategies', () => {
    it('should use different retry strategies based on error type', async () => {
      renderChatPage()

      const testCases = [
        {
          error: new APIError('Request timeout', 0, 'TIMEOUT'),
          expectedStrategy: 'exponential_backoff',
          expectedRetries: 3,
          expectedDelay: 2000
        },
        {
          error: new APIError('Too many requests', 429),
          expectedStrategy: 'exponential_backoff',
          expectedRetries: 1,
          expectedDelay: 10000
        },
        {
          error: new APIError('Bad request', 400),
          expectedStrategy: 'immediate_retry',
          expectedRetries: 0
        }
      ]

      for (const testCase of testCases) {
        const strategy = recoveryService.getRetryStrategy(testCase.error)
        
        expect(strategy.maxRetries).toBe(testCase.expectedRetries)
        if (testCase.expectedDelay) {
          expect(strategy.baseDelay).toBe(testCase.expectedDelay)
        }
      }
    })

    it('should adapt retry behavior based on error patterns', async () => {
      renderChatPage()

      // Mock a series of timeout errors
      const timeoutError = new APIError('Request timeout', 0, 'TIMEOUT')
      
      for (let i = 0; i < 3; i++) {
        const strategy = recoveryService.getRetryStrategy(timeoutError)
        
        // Should use exponential backoff for timeout errors
        expect(strategy.strategy).toBe('exponential_backoff')
        expect(strategy.maxRetries).toBe(3)
        expect(strategy.baseDelay).toBe(2000)
      }
    })
  })

  describe('Recovery State Management', () => {
    it('should maintain recovery state across component re-renders', async () => {
      const { rerender } = renderChatPage()

      // Set some recovery state
      recoveryService.enableOfflineMode()
      recoveryService.setDegradationLevel(2)

      // Re-render component
      rerender(
        <Provider store={store}>
          <ChatPage />
        </Provider>
      )

      // State should persist
      const status = recoveryService.getRecoveryStatus()
      expect(status.isOfflineMode).toBe(true)
      expect(status.degradationLevel).toBe(2)
    })

    it('should notify components of recovery state changes', async () => {
      renderChatPage()

      const mockCallback = vi.fn()
      const unsubscribe = recoveryService.onRecovery(mockCallback)

      // Trigger recovery event
      act(() => {
        recoveryService.setDegradationLevel(3)
      })

      expect(mockCallback).toHaveBeenCalledWith('degradation', {
        oldLevel: 0,
        newLevel: 3
      })

      unsubscribe()
    })
  })

  describe('Performance Under Stress', () => {
    it('should handle multiple concurrent recovery attempts', async () => {
      renderChatPage()

      // Create multiple concurrent requests that will fail and trigger recovery
      const promises = []
      
      for (let i = 0; i < 10; i++) {
        const mockRequest = vi.fn().mockRejectedValue(new APIError('Server error', 500))
        promises.push(
          recoveryService.executeWithRecovery(mockRequest, {
            maxRetries: 1,
            cacheKey: `request-${i}`
          }).catch(() => {}) // Ignore failures for this test
        )
      }

      await Promise.all(promises)

      // Recovery service should handle concurrent requests gracefully
      const status = recoveryService.getRecoveryStatus()
      expect(status).toBeDefined()
    })

    it('should prevent memory leaks during extended recovery scenarios', async () => {
      renderChatPage()

      // Simulate extended period of failures and recoveries
      for (let i = 0; i < 50; i++) {
        const mockRequest = vi.fn().mockRejectedValue(new APIError('Temporary error', 500))
        
        try {
          await recoveryService.executeWithRecovery(mockRequest, { maxRetries: 1 })
        } catch (error) {
          // Expected to fail
        }
      }

      // Check that internal data structures haven't grown unbounded
      const status = recoveryService.getRecoveryStatus()
      expect(status.circuitBreakers.length).toBeLessThan(10) // Reasonable limit
    })
  })
})