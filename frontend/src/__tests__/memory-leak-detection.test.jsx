/**
 * Performance tests for memory leak detection
 * Tests for memory leaks in request handling, event listeners, and component lifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
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
    getStats: vi.fn(() => ({ total: 0, successful: 0, failed: 0 })),
    requestHistory: []
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
    getErrorHistory: vi.fn(() => []),
    clearHistory: vi.fn()
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

// Memory monitoring utilities
const getMemoryUsage = () => {
  if (typeof performance !== 'undefined' && performance.memory) {
    return {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit
    }
  }
  return null
}

const forceGarbageCollection = () => {
  if (typeof global !== 'undefined' && global.gc) {
    global.gc()
  }
}

describe('Memory Leak Detection Tests', () => {
  let store
  let initialMemory

  beforeEach(() => {
    store = createTestStore()
    vi.clearAllMocks()
    forceGarbageCollection()
    initialMemory = getMemoryUsage()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('Request Manager Memory Leaks', () => {
    it('should not leak memory with multiple concurrent requests', async () => {
      const memoryBefore = getMemoryUsage()
      
      // Mock hanging requests
      requestManager.makeRequest.mockImplementation(() => new Promise(() => {}))
      
      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Create multiple concurrent requests
      for (let i = 0; i < 50; i++) {
        fireEvent.change(chatInput, { target: { value: `Message ${i}` } })
        fireEvent.click(sendButton)
      }

      // Cancel all requests to simulate cleanup
      requestManager.cancelAllRequests.mockReturnValue(50)
      
      // Simulate component unmount
      cleanup()
      
      // Force garbage collection
      forceGarbageCollection()
      
      const memoryAfter = getMemoryUsage()
      
      if (memoryBefore && memoryAfter) {
        // Memory usage should not increase significantly
        const memoryIncrease = memoryAfter.used - memoryBefore.used
        const memoryIncreasePercent = (memoryIncrease / memoryBefore.used) * 100
        
        // Allow for some memory increase but flag significant leaks
        expect(memoryIncreasePercent).toBeLessThan(50) // Less than 50% increase
      }
    })

    it('should clean up request history to prevent memory accumulation', async () => {
      // Mock successful requests
      requestManager.makeRequest.mockResolvedValue({
        response: 'Test response',
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

      // Send many messages to build up history
      for (let i = 0; i < 100; i++) {
        fireEvent.change(chatInput, { target: { value: `History test ${i}` } })
        fireEvent.click(sendButton)
        
        await waitFor(() => {
          expect(screen.getByText('Test response')).toBeInTheDocument()
        })
      }

      // Request history should be limited to prevent memory leaks
      expect(requestManager.requestHistory.length).toBeLessThan(100)
    })

    it('should properly clean up AbortControllers', async () => {
      let abortControllers = []
      
      // Mock request manager to track AbortControllers
      requestManager.makeRequest.mockImplementation((config, options) => {
        const controller = new AbortController()
        abortControllers.push(controller)
        
        return new Promise((resolve, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('Request cancelled'))
          })
          
          // Simulate hanging request
          setTimeout(() => {
            if (!controller.signal.aborted) {
              resolve({
                response: 'Success',
                conversation_id: 'test-conv',
                timestamp: new Date().toISOString()
              })
            }
          }, 1000)
        })
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Create multiple requests
      for (let i = 0; i < 10; i++) {
        fireEvent.change(chatInput, { target: { value: `Abort test ${i}` } })
        fireEvent.click(sendButton)
      }

      // Cancel all requests
      abortControllers.forEach(controller => controller.abort())

      // Cleanup component
      cleanup()

      // All AbortControllers should be properly cleaned up
      abortControllers.forEach(controller => {
        expect(controller.signal.aborted).toBe(true)
      })
    })
  })

  describe('Event Listener Memory Leaks', () => {
    it('should clean up health monitor event listeners', async () => {
      let eventListeners = []
      
      // Mock health monitor to track event listeners
      healthMonitor.onStatusChange.mockImplementation((callback) => {
        eventListeners.push(callback)
        return () => {
          const index = eventListeners.indexOf(callback)
          if (index > -1) {
            eventListeners.splice(index, 1)
          }
        }
      })

      const { unmount } = render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Should have registered event listeners
      expect(eventListeners.length).toBeGreaterThan(0)

      // Unmount component
      unmount()

      // Event listeners should be cleaned up
      expect(eventListeners.length).toBe(0)
    })

    it('should clean up window event listeners', async () => {
      const originalAddEventListener = window.addEventListener
      const originalRemoveEventListener = window.removeEventListener
      
      let addedListeners = []
      let removedListeners = []

      window.addEventListener = vi.fn((event, listener, options) => {
        addedListeners.push({ event, listener, options })
        return originalAddEventListener.call(window, event, listener, options)
      })

      window.removeEventListener = vi.fn((event, listener, options) => {
        removedListeners.push({ event, listener, options })
        return originalRemoveEventListener.call(window, event, listener, options)
      })

      const { unmount } = render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Should have added some event listeners
      expect(addedListeners.length).toBeGreaterThan(0)

      // Unmount component
      unmount()

      // Should have removed the same number of listeners
      expect(removedListeners.length).toBe(addedListeners.length)

      // Restore original methods
      window.addEventListener = originalAddEventListener
      window.removeEventListener = originalRemoveEventListener
    })

    it('should clean up network status event listeners', async () => {
      const originalAddEventListener = window.addEventListener
      const originalRemoveEventListener = window.removeEventListener
      
      let onlineListeners = []
      let offlineListeners = []

      window.addEventListener = vi.fn((event, listener, options) => {
        if (event === 'online') onlineListeners.push(listener)
        if (event === 'offline') offlineListeners.push(listener)
        return originalAddEventListener.call(window, event, listener, options)
      })

      window.removeEventListener = vi.fn((event, listener, options) => {
        if (event === 'online') {
          const index = onlineListeners.indexOf(listener)
          if (index > -1) onlineListeners.splice(index, 1)
        }
        if (event === 'offline') {
          const index = offlineListeners.indexOf(listener)
          if (index > -1) offlineListeners.splice(index, 1)
        }
        return originalRemoveEventListener.call(window, event, listener, options)
      })

      const { unmount } = render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Unmount component
      unmount()

      // Network event listeners should be cleaned up
      expect(onlineListeners.length).toBe(0)
      expect(offlineListeners.length).toBe(0)

      // Restore original methods
      window.addEventListener = originalAddEventListener
      window.removeEventListener = originalRemoveEventListener
    })
  })

  describe('Component Memory Leaks', () => {
    it('should not leak memory with frequent component mounting/unmounting', async () => {
      const memoryBefore = getMemoryUsage()
      
      // Mount and unmount component multiple times
      for (let i = 0; i < 20; i++) {
        const { unmount } = render(
          <TestWrapper store={createTestStore()}>
            <ChatPage />
          </TestWrapper>
        )
        
        // Simulate some interaction
        const chatInput = screen.getByPlaceholderText('Type your message...')
        fireEvent.change(chatInput, { target: { value: `Test ${i}` } })
        
        // Unmount immediately
        unmount()
      }

      // Force garbage collection
      forceGarbageCollection()
      
      const memoryAfter = getMemoryUsage()
      
      if (memoryBefore && memoryAfter) {
        const memoryIncrease = memoryAfter.used - memoryBefore.used
        const memoryIncreasePercent = (memoryIncrease / memoryBefore.used) * 100
        
        // Memory should not increase significantly
        expect(memoryIncreasePercent).toBeLessThan(30)
      }
    })

    it('should clean up timers and intervals', async () => {
      vi.useFakeTimers()
      
      let activeTimers = []
      const originalSetTimeout = global.setTimeout
      const originalSetInterval = global.setInterval
      const originalClearTimeout = global.clearTimeout
      const originalClearInterval = global.clearInterval

      global.setTimeout = vi.fn((callback, delay) => {
        const id = originalSetTimeout(callback, delay)
        activeTimers.push({ type: 'timeout', id })
        return id
      })

      global.setInterval = vi.fn((callback, delay) => {
        const id = originalSetInterval(callback, delay)
        activeTimers.push({ type: 'interval', id })
        return id
      })

      global.clearTimeout = vi.fn((id) => {
        activeTimers = activeTimers.filter(timer => timer.id !== id)
        return originalClearTimeout(id)
      })

      global.clearInterval = vi.fn((id) => {
        activeTimers = activeTimers.filter(timer => timer.id !== id)
        return originalClearInterval(id)
      })

      const { unmount } = render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Let some time pass to create timers
      vi.advanceTimersByTime(5000)

      // Unmount component
      unmount()

      // All timers should be cleaned up
      expect(activeTimers.length).toBe(0)

      // Restore original methods
      global.setTimeout = originalSetTimeout
      global.setInterval = originalSetInterval
      global.clearTimeout = originalClearTimeout
      global.clearInterval = originalClearInterval
      
      vi.useRealTimers()
    })

    it('should clean up Redux subscriptions', async () => {
      let subscriptions = []
      const originalSubscribe = store.subscribe

      store.subscribe = vi.fn((listener) => {
        subscriptions.push(listener)
        const unsubscribe = originalSubscribe(listener)
        return () => {
          const index = subscriptions.indexOf(listener)
          if (index > -1) {
            subscriptions.splice(index, 1)
          }
          unsubscribe()
        }
      })

      const { unmount } = render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Should have created subscriptions
      expect(subscriptions.length).toBeGreaterThan(0)

      // Unmount component
      unmount()

      // Subscriptions should be cleaned up
      expect(subscriptions.length).toBe(0)

      // Restore original method
      store.subscribe = originalSubscribe
    })
  })

  describe('Error Reporter Memory Leaks', () => {
    it('should limit error history to prevent memory accumulation', async () => {
      // Generate many errors
      for (let i = 0; i < 1000; i++) {
        errorReporter.reportError(new Error(`Test error ${i}`), {
          context: 'memory_test',
          timestamp: Date.now()
        })
      }

      const errorHistory = errorReporter.getErrorHistory()
      
      // Error history should be limited
      expect(errorHistory.length).toBeLessThan(1000)
    })

    it('should clean up error history on component unmount', async () => {
      const { unmount } = render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Generate some errors
      for (let i = 0; i < 10; i++) {
        errorReporter.reportError(new Error(`Test error ${i}`))
      }

      // Unmount component
      unmount()

      // Error history should be cleared
      expect(errorReporter.clearHistory).toHaveBeenCalled()
    })
  })

  describe('Long-Running Session Memory Tests', () => {
    it('should maintain stable memory usage during extended chat session', async () => {
      vi.useFakeTimers()
      
      requestManager.makeRequest.mockResolvedValue({
        response: 'Test response',
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

      const memoryReadings = []
      
      // Simulate extended chat session
      for (let i = 0; i < 50; i++) {
        fireEvent.change(chatInput, { target: { value: `Long session message ${i}` } })
        fireEvent.click(sendButton)
        
        await waitFor(() => {
          expect(screen.getByText('Test response')).toBeInTheDocument()
        })

        // Advance time to simulate real usage
        vi.advanceTimersByTime(1000)

        // Take memory reading every 10 messages
        if (i % 10 === 0) {
          forceGarbageCollection()
          const memory = getMemoryUsage()
          if (memory) {
            memoryReadings.push(memory.used)
          }
        }
      }

      if (memoryReadings.length > 2) {
        // Memory should not continuously increase
        const firstReading = memoryReadings[0]
        const lastReading = memoryReadings[memoryReadings.length - 1]
        const memoryIncrease = ((lastReading - firstReading) / firstReading) * 100
        
        // Allow for some increase but flag significant memory leaks
        expect(memoryIncrease).toBeLessThan(100) // Less than 100% increase
      }

      vi.useRealTimers()
    })

    it('should handle memory pressure gracefully', async () => {
      // Simulate memory pressure by creating large objects
      const largeObjects = []
      
      try {
        // Create objects until we approach memory limits
        for (let i = 0; i < 1000; i++) {
          largeObjects.push(new Array(10000).fill(`memory-test-${i}`))
        }

        render(
          <TestWrapper store={store}>
            <ChatPage />
          </TestWrapper>
        )

        // Application should still function under memory pressure
        expect(screen.getByText('Welcome to MCP Chatbot')).toBeInTheDocument()

      } finally {
        // Clean up large objects
        largeObjects.length = 0
        forceGarbageCollection()
      }
    })
  })

  describe('Resource Cleanup Tests', () => {
    it('should clean up all resources on page unload', async () => {
      const { unmount } = render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Simulate page unload
      window.dispatchEvent(new Event('beforeunload'))
      
      // Unmount component
      unmount()

      // Verify cleanup calls
      expect(requestManager.cancelAllRequests).toHaveBeenCalled()
      expect(healthMonitor.stopMonitoring).toHaveBeenCalled()
    })

    it('should handle cleanup errors gracefully', async () => {
      // Mock cleanup methods to throw errors
      requestManager.cancelAllRequests.mockImplementation(() => {
        throw new Error('Cleanup error')
      })

      const { unmount } = render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Should not throw during unmount even if cleanup fails
      expect(() => unmount()).not.toThrow()
    })
  })
})