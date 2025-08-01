/**
 * Integration tests for RequestManager with RequestQueue
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RequestManager, RequestError } from '../requestManager'
import { REQUEST_PRIORITY } from '../requestQueue'

// Mock axios
vi.mock('axios', () => ({
  default: vi.fn()
}))

// Mock error service
vi.mock('../errorService', () => ({
  logError: vi.fn(),
  ErrorCategory: { NETWORK: 'network', PERFORMANCE: 'performance' },
  ErrorSeverity: { MEDIUM: 'medium', HIGH: 'high' }
}))

describe('RequestManager Queue Integration', () => {
  let requestManager
  let mockAxios

  beforeEach(async () => {
    const axios = await import('axios')
    mockAxios = axios.default
    mockAxios.mockClear()
    
    requestManager = new RequestManager()
  })

  afterEach(() => {
    requestManager.cancelAllRequests()
    vi.clearAllMocks()
  })

  describe('Priority-based Request Processing', () => {
    it('should process high priority requests first', async () => {
      const results = []
      
      // Mock axios to track call order
      mockAxios.mockImplementation((config) => {
        results.push(config.url)
        return Promise.resolve({ data: `response-${config.url}`, status: 200 })
      })

      // Add requests in reverse priority order
      const lowPromise = requestManager.makeRequest({ url: '/low', method: 'GET' }, { priority: 'low' })
      const normalPromise = requestManager.makeRequest({ url: '/normal', method: 'GET' }, { priority: 'normal' })
      const highPromise = requestManager.makeRequest({ url: '/high', method: 'GET' }, { priority: 'high' })

      await Promise.all([highPromise, normalPromise, lowPromise])

      // High priority should be processed first
      expect(results[0]).toBe('/high')
      expect(results[1]).toBe('/normal')
      expect(results[2]).toBe('/low')
    })

    it('should automatically assign priority based on URL patterns', async () => {
      mockAxios.mockResolvedValue({ data: 'success', status: 200 })

      // Chat messages should get high priority
      await requestManager.makeRequest({ url: '/chat', method: 'POST' })
      
      // Health checks should get low priority
      await requestManager.makeRequest({ url: '/health', method: 'GET' })
      
      // Regular requests should get normal priority
      await requestManager.makeRequest({ url: '/api/data', method: 'GET' })

      const queueStatus = requestManager.getQueueStatus()
      expect(queueStatus.stats.totalProcessed).toBe(3)
    })
  })

  describe('Concurrency Control', () => {
    it('should respect maximum concurrent request limits', async () => {
      let activeRequests = 0
      let maxConcurrent = 0

      mockAxios.mockImplementation(() => {
        activeRequests++
        maxConcurrent = Math.max(maxConcurrent, activeRequests)
        
        return new Promise(resolve => {
          setTimeout(() => {
            activeRequests--
            resolve({ data: 'success', status: 200 })
          }, 100)
        })
      })

      // Start more requests than the concurrent limit
      const promises = []
      for (let i = 0; i < 10; i++) {
        promises.push(requestManager.makeRequest({ url: `/test${i}`, method: 'GET' }))
      }

      await Promise.all(promises)

      // Should not exceed the concurrent limit (default is 6)
      expect(maxConcurrent).toBeLessThanOrEqual(6)
    })
  })

  describe('Request Batching', () => {
    it('should batch health check requests', async () => {
      let batchCount = 0
      
      mockAxios.mockImplementation(() => {
        batchCount++
        return Promise.resolve({ data: 'health-ok', status: 200 })
      })

      // Make multiple health check requests quickly
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(requestManager.makeRequest({ 
          url: '/health', 
          method: 'GET' 
        }, { 
          batchable: true 
        }))
      }

      await Promise.all(promises)

      // All requests should complete successfully
      expect(promises).toHaveLength(5)
      
      // Verify queue processed the requests
      const queueStatus = requestManager.getQueueStatus()
      expect(queueStatus.stats.totalProcessed).toBe(5)
    })
  })

  describe('Queue Status and Control', () => {
    it('should provide queue status information', () => {
      const status = requestManager.getQueueStatus()
      
      expect(status).toHaveProperty('status')
      expect(status).toHaveProperty('activeRequests')
      expect(status).toHaveProperty('queueSizes')
      expect(status).toHaveProperty('stats')
      
      expect(status.queueSizes).toHaveProperty('high')
      expect(status.queueSizes).toHaveProperty('normal')
      expect(status.queueSizes).toHaveProperty('low')
      expect(status.queueSizes).toHaveProperty('total')
    })

    it('should allow pausing and resuming queue processing', async () => {
      mockAxios.mockResolvedValue({ data: 'success', status: 200 })

      // Pause the queue
      requestManager.pauseQueue()
      
      const promise = requestManager.makeRequest({ url: '/test', method: 'GET' })
      
      // Wait a bit to ensure request would have processed if queue was active
      await new Promise(resolve => setTimeout(resolve, 50))
      
      let status = requestManager.getQueueStatus()
      expect(status.status).toBe('paused')
      expect(status.queueSizes.total).toBe(1)

      // Resume the queue
      requestManager.resumeQueue()
      
      const result = await promise
      expect(result.data).toBe('success')
    })

    it('should clear the queue when requested', async () => {
      mockAxios.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: 'success', status: 200 }), 100))
      )

      // Pause queue to prevent immediate processing
      requestManager.pauseQueue()
      
      // Add some requests
      const promise1 = requestManager.makeRequest({ url: '/test1', method: 'GET' })
      const promise2 = requestManager.makeRequest({ url: '/test2', method: 'GET' })
      
      let status = requestManager.getQueueStatus()
      expect(status.queueSizes.total).toBe(2)

      // Clear the queue
      requestManager.clearQueue()
      
      // Requests should be rejected
      await expect(promise1).rejects.toThrow('Queue cleared')
      await expect(promise2).rejects.toThrow('Queue cleared')
      
      status = requestManager.getQueueStatus()
      expect(status.queueSizes.total).toBe(0)
    })
  })

  describe('Enhanced Statistics', () => {
    it('should provide comprehensive statistics including queue info', async () => {
      mockAxios.mockResolvedValue({ data: 'success', status: 200 })

      await requestManager.makeRequest({ url: '/test', method: 'GET' })
      
      const stats = requestManager.getStats()
      
      expect(stats).toHaveProperty('queue')
      expect(stats.queue).toHaveProperty('status')
      expect(stats.queue).toHaveProperty('activeRequests')
      expect(stats.queue).toHaveProperty('queueSizes')
      expect(stats.queue).toHaveProperty('stats')
      
      expect(stats.queue.stats.totalProcessed).toBe(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle queue overflow gracefully', async () => {
      // Create a queue with very small limits for testing
      const smallQueue = new RequestManager()
      smallQueue.queue.maxQueueSize = 2
      smallQueue.queue.maxConcurrentRequests = 1

      mockAxios.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: 'success', status: 200 }), 200))
      )

      // Fill up the queue
      const promises = []
      for (let i = 0; i < 4; i++) {
        promises.push(
          smallQueue.makeRequest({ url: `/test${i}`, method: 'GET' })
            .catch(error => error) // Catch errors to prevent unhandled rejections
        )
      }

      const results = await Promise.all(promises)
      
      // Some requests should succeed, others should fail with queue overflow
      const errors = results.filter(r => r instanceof Error)
      const successes = results.filter(r => !(r instanceof Error))
      
      expect(errors.length).toBeGreaterThan(0)
      expect(successes.length).toBeGreaterThan(0)
      
      // Check that overflow errors are properly typed
      const overflowErrors = errors.filter(e => e.message.includes('Queue overflow'))
      expect(overflowErrors.length).toBeGreaterThan(0)
    })
  })
})