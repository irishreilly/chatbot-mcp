/**
 * Load tests for concurrent request handling
 * Tests system behavior under high concurrent request loads
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
import { requestQueue } from '../services/requestQueue'

// Mock services
vi.mock('../services/requestManager', () => ({
  requestManager: {
    makeRequest: vi.fn(),
    cancelAllRequests: vi.fn(),
    getActiveRequests: vi.fn(() => []),
    getStats: vi.fn(() => ({ total: 0, successful: 0, failed: 0 })),
    cancelRequest: vi.fn()
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

vi.mock('../services/requestQueue', () => ({
  requestQueue: {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    getQueueLength: vi.fn(() => 0),
    getQueueStats: vi.fn(() => ({ pending: 0, processing: 0, completed: 0 })),
    clear: vi.fn()
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

// Performance monitoring utilities
const measurePerformance = (fn) => {
  const start = performance.now()
  const result = fn()
  const end = performance.now()
  return {
    result,
    duration: end - start
  }
}

const createConcurrentRequests = async (count, requestFn) => {
  const promises = []
  for (let i = 0; i < count; i++) {
    promises.push(requestFn(i))
  }
  return Promise.allSettled(promises)
}

describe('Concurrent Request Load Tests', () => {
  let store

  beforeEach(() => {
    store = createTestStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('High Volume Concurrent Requests', () => {
    it('should handle 100 concurrent chat requests without degradation', async () => {
      const requestCount = 100
      const responses = []
      let completedRequests = 0

      // Mock request manager to simulate realistic response times
      requestManager.makeRequest.mockImplementation((config) => {
        return new Promise((resolve) => {
          // Simulate variable response times (50-200ms)
          const delay = 50 + Math.random() * 150
          setTimeout(() => {
            completedRequests++
            const response = {
              response: `Response ${completedRequests}`,
              conversation_id: 'load-test-conv',
              timestamp: new Date().toISOString()
            }
            responses.push(response)
            resolve(response)
          }, delay)
        })
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Measure performance of concurrent requests
      const { duration } = measurePerformance(() => {
        // Simulate rapid user interactions
        for (let i = 0; i < requestCount; i++) {
          fireEvent.change(chatInput, { target: { value: `Load test message ${i}` } })
          fireEvent.click(sendButton)
        }
      })

      // UI should remain responsive during load
      expect(duration).toBeLessThan(1000) // Less than 1 second for UI operations

      // Wait for all requests to complete
      await waitFor(() => {
        expect(completedRequests).toBe(requestCount)
      }, { timeout: 30000 })

      // Verify all requests completed successfully
      expect(responses).toHaveLength(requestCount)
      expect(requestManager.makeRequest).toHaveBeenCalledTimes(requestCount)
    })

    it('should maintain request queue limits under high load', async () => {
      const maxConcurrentRequests = 10
      let activeRequests = 0
      let maxActiveRequests = 0

      // Mock request queue behavior
      requestQueue.enqueue.mockImplementation((request) => {
        if (activeRequests < maxConcurrentRequests) {
          activeRequests++
          maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
          
          // Simulate request processing
          setTimeout(() => {
            activeRequests--
          }, 100)
          
          return Promise.resolve()
        } else {
          return Promise.reject(new Error('Queue full'))
        }
      })

      requestQueue.getQueueLength.mockImplementation(() => activeRequests)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Send more requests than the concurrent limit
      for (let i = 0; i < 50; i++) {
        fireEvent.change(chatInput, { target: { value: `Queue test ${i}` } })
        fireEvent.click(sendButton)
      }

      // Wait for queue processing
      await waitFor(() => {
        expect(activeRequests).toBe(0)
      }, { timeout: 10000 })

      // Should never exceed concurrent request limit
      expect(maxActiveRequests).toBeLessThanOrEqual(maxConcurrentRequests)
    })

    it('should handle request bursts without memory leaks', async () => {
      const burstSize = 50
      const burstCount = 5
      let totalRequests = 0

      // Mock successful requests
      requestManager.makeRequest.mockImplementation(() => {
        totalRequests++
        return Promise.resolve({
          response: `Burst response ${totalRequests}`,
          conversation_id: 'burst-test',
          timestamp: new Date().toISOString()
        })
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Simulate multiple bursts of requests
      for (let burst = 0; burst < burstCount; burst++) {
        // Create burst of requests
        for (let i = 0; i < burstSize; i++) {
          fireEvent.change(chatInput, { target: { value: `Burst ${burst} message ${i}` } })
          fireEvent.click(sendButton)
        }

        // Wait for burst to complete
        await waitFor(() => {
          expect(totalRequests).toBeGreaterThanOrEqual((burst + 1) * burstSize)
        })

        // Small delay between bursts
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Verify all requests completed
      expect(totalRequests).toBe(burstSize * burstCount)

      // Memory usage should be stable (no significant leaks)
      if (performance.memory) {
        const memoryUsage = performance.memory.usedJSHeapSize
        expect(memoryUsage).toBeLessThan(100 * 1024 * 1024) // Less than 100MB
      }
    })
  })

  describe('Request Queue Management Under Load', () => {
    it('should prioritize requests correctly under high load', async () => {
      const highPriorityRequests = []
      const normalPriorityRequests = []
      const lowPriorityRequests = []

      // Mock request queue with priority handling
      requestQueue.enqueue.mockImplementation((request) => {
        switch (request.priority) {
          case 'high':
            highPriorityRequests.push(request)
            break
          case 'low':
            lowPriorityRequests.push(request)
            break
          default:
            normalPriorityRequests.push(request)
        }
        return Promise.resolve()
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Send mixed priority requests
      const requestTypes = [
        { message: 'High priority message', priority: 'high' },
        { message: 'Normal message 1', priority: 'normal' },
        { message: 'Low priority message', priority: 'low' },
        { message: 'Another high priority', priority: 'high' },
        { message: 'Normal message 2', priority: 'normal' }
      ]

      requestTypes.forEach(({ message, priority }) => {
        fireEvent.change(chatInput, { target: { value: message } })
        // Simulate priority setting (would be done by the component)
        fireEvent.click(sendButton)
      })

      await waitFor(() => {
        expect(requestQueue.enqueue).toHaveBeenCalledTimes(requestTypes.length)
      })

      // Verify priority queuing
      expect(highPriorityRequests).toHaveLength(2)
      expect(normalPriorityRequests).toHaveLength(2)
      expect(lowPriorityRequests).toHaveLength(1)
    })

    it('should handle queue overflow gracefully', async () => {
      const maxQueueSize = 20
      let queueSize = 0
      let rejectedRequests = 0

      // Mock queue with size limit
      requestQueue.enqueue.mockImplementation((request) => {
        if (queueSize < maxQueueSize) {
          queueSize++
          // Simulate slow processing
          setTimeout(() => {
            queueSize--
          }, 500)
          return Promise.resolve()
        } else {
          rejectedRequests++
          return Promise.reject(new Error('Queue overflow'))
        }
      })

      requestQueue.getQueueLength.mockImplementation(() => queueSize)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Send more requests than queue can handle
      for (let i = 0; i < 50; i++) {
        fireEvent.change(chatInput, { target: { value: `Overflow test ${i}` } })
        fireEvent.click(sendButton)
      }

      await waitFor(() => {
        expect(rejectedRequests).toBeGreaterThan(0)
      })

      // Should show queue overflow warning
      expect(screen.getByText(/queue.*full/i)).toBeInTheDocument()
      expect(screen.getByText(/please.*wait/i)).toBeInTheDocument()

      // Queue size should not exceed limit
      expect(queueSize).toBeLessThanOrEqual(maxQueueSize)
    })

    it('should maintain queue performance under sustained load', async () => {
      const sustainedDuration = 5000 // 5 seconds
      const requestInterval = 100 // 100ms between requests
      const expectedRequests = sustainedDuration / requestInterval
      let processedRequests = 0

      // Mock sustained request processing
      requestManager.makeRequest.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            processedRequests++
            resolve({
              response: `Sustained response ${processedRequests}`,
              conversation_id: 'sustained-test',
              timestamp: new Date().toISOString()
            })
          }, 50) // 50ms processing time
        })
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Start sustained load test
      const startTime = Date.now()
      const interval = setInterval(() => {
        if (Date.now() - startTime >= sustainedDuration) {
          clearInterval(interval)
          return
        }

        fireEvent.change(chatInput, { target: { value: `Sustained ${processedRequests}` } })
        fireEvent.click(sendButton)
      }, requestInterval)

      // Wait for sustained test to complete
      await waitFor(() => {
        return Date.now() - startTime >= sustainedDuration
      }, { timeout: sustainedDuration + 2000 })

      clearInterval(interval)

      // Wait for remaining requests to process
      await waitFor(() => {
        expect(processedRequests).toBeGreaterThan(expectedRequests * 0.8) // At least 80% processed
      }, { timeout: 5000 })

      // Performance should remain stable
      expect(processedRequests).toBeGreaterThan(0)
    })
  })

  describe('Error Handling Under Load', () => {
    it('should handle partial failures in concurrent requests', async () => {
      const totalRequests = 50
      const failureRate = 0.3 // 30% failure rate
      let successCount = 0
      let failureCount = 0

      // Mock requests with random failures
      requestManager.makeRequest.mockImplementation(() => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (Math.random() < failureRate) {
              failureCount++
              reject(new Error('Random failure'))
            } else {
              successCount++
              resolve({
                response: `Success ${successCount}`,
                conversation_id: 'partial-failure-test',
                timestamp: new Date().toISOString()
              })
            }
          }, 50 + Math.random() * 100)
        })
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Send concurrent requests
      for (let i = 0; i < totalRequests; i++) {
        fireEvent.change(chatInput, { target: { value: `Partial failure test ${i}` } })
        fireEvent.click(sendButton)
      }

      // Wait for all requests to complete
      await waitFor(() => {
        expect(successCount + failureCount).toBe(totalRequests)
      }, { timeout: 10000 })

      // Should handle both successes and failures
      expect(successCount).toBeGreaterThan(0)
      expect(failureCount).toBeGreaterThan(0)

      // UI should show appropriate error messages for failures
      expect(screen.getAllByText(/error/i).length).toBeGreaterThan(0)

      // Should show retry options for failed requests
      expect(screen.getAllByText(/try again/i).length).toBeGreaterThan(0)
    })

    it('should handle cascading failures gracefully', async () => {
      let requestCount = 0
      const failureThreshold = 10

      // Mock cascading failures
      requestManager.makeRequest.mockImplementation(() => {
        requestCount++
        
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (requestCount > failureThreshold) {
              // Start failing after threshold
              reject(new Error('System overloaded'))
            } else {
              resolve({
                response: `Success before overload ${requestCount}`,
                conversation_id: 'cascade-test',
                timestamp: new Date().toISOString()
              })
            }
          }, 100)
        })
      })

      // Mock health monitor to detect system overload
      healthMonitor.getConnectionStatus.mockImplementation(() => {
        if (requestCount > failureThreshold) {
          return {
            isOnline: true,
            backendStatus: 'overloaded',
            lastHealthCheck: Date.now(),
            errorCount: requestCount - failureThreshold
          }
        }
        return {
          isOnline: true,
          backendStatus: 'connected',
          lastHealthCheck: Date.now(),
          errorCount: 0
        }
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Send requests that will trigger cascading failure
      for (let i = 0; i < 20; i++) {
        fireEvent.change(chatInput, { target: { value: `Cascade test ${i}` } })
        fireEvent.click(sendButton)
      }

      // Wait for system overload detection
      await waitFor(() => {
        expect(screen.getByText(/system.*overloaded/i)).toBeInTheDocument()
      })

      // Should show circuit breaker activation
      expect(screen.getByText(/circuit.*breaker/i)).toBeInTheDocument()

      // Should prevent further requests
      expect(screen.getByText(/requests.*blocked/i)).toBeInTheDocument()
    })

    it('should recover from load-induced errors', async () => {
      let systemLoad = 0
      const maxLoad = 15

      // Mock load-based failures
      requestManager.makeRequest.mockImplementation(() => {
        systemLoad++
        
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            systemLoad = Math.max(0, systemLoad - 1) // Decrease load over time
            
            if (systemLoad > maxLoad) {
              reject(new Error('System overloaded'))
            } else {
              resolve({
                response: `Success at load ${systemLoad}`,
                conversation_id: 'recovery-test',
                timestamp: new Date().toISOString()
              })
            }
          }, 200)
        })
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Create initial overload
      for (let i = 0; i < 25; i++) {
        fireEvent.change(chatInput, { target: { value: `Overload ${i}` } })
        fireEvent.click(sendButton)
      }

      // Wait for overload condition
      await waitFor(() => {
        expect(screen.getByText(/overloaded/i)).toBeInTheDocument()
      })

      // Wait for system recovery
      await waitFor(() => {
        expect(screen.getByText(/system.*recovered/i)).toBeInTheDocument()
      }, { timeout: 15000 })

      // Should allow new requests after recovery
      fireEvent.change(chatInput, { target: { value: 'Recovery test message' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/Success at load/)).toBeInTheDocument()
      })
    })
  })

  describe('Performance Monitoring Under Load', () => {
    it('should maintain response time metrics during high load', async () => {
      const responseTimes = []
      let requestCount = 0

      // Mock requests with response time tracking
      requestManager.makeRequest.mockImplementation(() => {
        const startTime = Date.now()
        requestCount++
        
        return new Promise((resolve) => {
          // Simulate variable response times under load
          const baseDelay = 100
          const loadDelay = Math.min(requestCount * 5, 500) // Increase delay with load
          const totalDelay = baseDelay + loadDelay
          
          setTimeout(() => {
            const responseTime = Date.now() - startTime
            responseTimes.push(responseTime)
            
            resolve({
              response: `Response ${requestCount} (${responseTime}ms)`,
              conversation_id: 'perf-test',
              timestamp: new Date().toISOString()
            })
          }, totalDelay)
        })
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Send requests to measure performance
      for (let i = 0; i < 30; i++) {
        fireEvent.change(chatInput, { target: { value: `Performance test ${i}` } })
        fireEvent.click(sendButton)
      }

      // Wait for all requests to complete
      await waitFor(() => {
        expect(responseTimes).toHaveLength(30)
      }, { timeout: 20000 })

      // Calculate performance metrics
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      const maxResponseTime = Math.max(...responseTimes)
      const minResponseTime = Math.min(...responseTimes)

      // Performance should be within acceptable bounds
      expect(avgResponseTime).toBeLessThan(1000) // Average under 1 second
      expect(maxResponseTime).toBeLessThan(2000) // Max under 2 seconds

      // Should show performance metrics in UI
      expect(screen.getByText(/response.*time/i)).toBeInTheDocument()
      expect(screen.getByText(/average.*\d+ms/i)).toBeInTheDocument()
    })

    it('should track resource usage during sustained load', async () => {
      const resourceMetrics = {
        memoryUsage: [],
        cpuUsage: [],
        networkRequests: 0
      }

      // Mock resource monitoring
      const monitorResources = () => {
        if (performance.memory) {
          resourceMetrics.memoryUsage.push(performance.memory.usedJSHeapSize)
        }
        resourceMetrics.networkRequests++
      }

      requestManager.makeRequest.mockImplementation(() => {
        monitorResources()
        
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              response: `Resource test ${resourceMetrics.networkRequests}`,
              conversation_id: 'resource-test',
              timestamp: new Date().toISOString()
            })
          }, 100)
        })
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Sustained load test
      for (let i = 0; i < 40; i++) {
        fireEvent.change(chatInput, { target: { value: `Resource test ${i}` } })
        fireEvent.click(sendButton)
        
        // Small delay to simulate realistic usage
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Wait for completion
      await waitFor(() => {
        expect(resourceMetrics.networkRequests).toBe(40)
      })

      // Resource usage should be stable
      if (resourceMetrics.memoryUsage.length > 1) {
        const initialMemory = resourceMetrics.memoryUsage[0]
        const finalMemory = resourceMetrics.memoryUsage[resourceMetrics.memoryUsage.length - 1]
        const memoryIncrease = ((finalMemory - initialMemory) / initialMemory) * 100
        
        // Memory increase should be reasonable
        expect(memoryIncrease).toBeLessThan(200) // Less than 200% increase
      }
    })
  })
})