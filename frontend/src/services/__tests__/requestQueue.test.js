/**
 * Tests for RequestQueue class
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RequestQueue, REQUEST_PRIORITY, QUEUE_STATUS, QueueError } from '../requestQueue'

// Mock error service
vi.mock('../errorService', () => ({
  logError: vi.fn(),
  ErrorCategory: { NETWORK: 'network' },
  ErrorSeverity: { MEDIUM: 'medium' }
}))

describe('RequestQueue', () => {
  let queue
  let mockRequest
  let mockBatchableRequest

  beforeEach(() => {
    queue = new RequestQueue({
      maxConcurrentRequests: 2,
      maxQueueSize: 10,
      batchSize: 3,
      batchDelay: 50
    })

    mockRequest = vi.fn().mockResolvedValue('success')
    mockBatchableRequest = vi.fn().mockResolvedValue('batch-success')
  })

  afterEach(() => {
    queue.clear()
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  describe('Basic Queue Operations', () => {
    it('should initialize with correct default values', () => {
      const defaultQueue = new RequestQueue()
      expect(defaultQueue.maxConcurrentRequests).toBe(6)
      expect(defaultQueue.maxQueueSize).toBe(50)
      expect(defaultQueue.batchSize).toBe(3)
      expect(defaultQueue.status).toBe(QUEUE_STATUS.IDLE)
    })

    it('should enqueue and process a single request', async () => {
      const result = await queue.enqueue(mockRequest)
      
      expect(result).toBe('success')
      expect(mockRequest).toHaveBeenCalledOnce()
      expect(queue.stats.totalProcessed).toBe(1)
      expect(queue.stats.totalQueued).toBe(1)
    })

    it('should handle multiple requests with priority', async () => {
      const highPriorityRequest = vi.fn().mockResolvedValue('high')
      const normalPriorityRequest = vi.fn().mockResolvedValue('normal')
      const lowPriorityRequest = vi.fn().mockResolvedValue('low')

      // Add requests in reverse priority order
      const lowPromise = queue.enqueue(lowPriorityRequest, { priority: REQUEST_PRIORITY.LOW })
      const normalPromise = queue.enqueue(normalPriorityRequest, { priority: REQUEST_PRIORITY.NORMAL })
      const highPromise = queue.enqueue(highPriorityRequest, { priority: REQUEST_PRIORITY.HIGH })

      const results = await Promise.all([highPromise, normalPromise, lowPromise])
      
      expect(results).toEqual(['high', 'normal', 'low'])
      // Verify all requests were called
      expect(highPriorityRequest).toHaveBeenCalledOnce()
      expect(normalPriorityRequest).toHaveBeenCalledOnce()
      expect(lowPriorityRequest).toHaveBeenCalledOnce()
    })
  })

  describe('Concurrency Control', () => {
    it('should respect maximum concurrent requests limit', async () => {
      const slowRequest = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 100))
      )

      // Start 3 requests (limit is 2)
      const promise1 = queue.enqueue(slowRequest)
      const promise2 = queue.enqueue(slowRequest)
      const promise3 = queue.enqueue(slowRequest)

      // Wait a bit to let first two start
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(queue.activeRequests.size).toBe(2)
      expect(queue.getStatus().queueSizes.total).toBe(1)

      await Promise.all([promise1, promise2, promise3])
      expect(queue.activeRequests.size).toBe(0)
    })

    it('should process queued requests when active requests complete', async () => {
      const fastRequest = vi.fn().mockResolvedValue('fast')
      const slowRequest = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 50))
      )

      // Fill up active slots
      const slowPromise1 = queue.enqueue(slowRequest)
      const slowPromise2 = queue.enqueue(slowRequest)
      
      // This should be queued
      const fastPromise = queue.enqueue(fastRequest)

      expect(queue.activeRequests.size).toBe(2)
      expect(queue.getStatus().queueSizes.total).toBe(1)

      await Promise.all([slowPromise1, slowPromise2, fastPromise])
      
      expect(fastRequest).toHaveBeenCalledOnce()
      expect(queue.activeRequests.size).toBe(0)
    })
  })

  describe('Queue Size Limits', () => {
    it('should reject requests when queue is full', async () => {
      const slowRequest = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 100))
      )

      // Fill up active requests and queue (2 active + 10 queued = 12 total)
      const promises = []
      for (let i = 0; i < 12; i++) {
        promises.push(queue.enqueue(slowRequest))
      }

      // This should be rejected due to overflow
      await expect(queue.enqueue(slowRequest)).rejects.toThrow(QueueError)
      await expect(queue.enqueue(slowRequest)).rejects.toThrow('Queue overflow')

      expect(queue.stats.overflowCount).toBe(2)
      expect(queue.status).toBe(QUEUE_STATUS.OVERFLOW)

      // Clean up
      await Promise.all(promises)
    })

    it('should emit overflow event when queue is full', async () => {
      const overflowHandler = vi.fn()
      queue.on('overflow', overflowHandler)

      const slowRequest = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 100))
      )

      // Fill up queue
      for (let i = 0; i < 12; i++) {
        queue.enqueue(slowRequest).catch(() => {}) // Ignore rejections
      }

      // Try to add one more
      try {
        await queue.enqueue(slowRequest)
      } catch (error) {
        // Expected to fail
      }

      expect(overflowHandler).toHaveBeenCalled()
      expect(overflowHandler).toHaveBeenCalledWith({
        queueSize: 10,
        maxSize: 10
      })
    })
  })

  describe('Request Batching', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should batch requests when batchable option is true', async () => {
      const batchRequest1 = vi.fn().mockResolvedValue('batch1')
      const batchRequest2 = vi.fn().mockResolvedValue('batch2')
      const batchRequest3 = vi.fn().mockResolvedValue('batch3')

      const promise1 = queue.enqueue(batchRequest1, { batchable: true })
      const promise2 = queue.enqueue(batchRequest2, { batchable: true })
      const promise3 = queue.enqueue(batchRequest3, { batchable: true })

      // Should trigger batch processing when batch size is reached
      const results = await Promise.all([promise1, promise2, promise3])
      
      expect(results).toEqual(['batch1', 'batch2', 'batch3'])
      expect(queue.activeRequests.size).toBe(0)
    })

    it('should process batch after delay if batch size not reached', async () => {
      const batchRequest1 = vi.fn().mockResolvedValue('batch1')
      const batchRequest2 = vi.fn().mockResolvedValue('batch2')

      const promise1 = queue.enqueue(batchRequest1, { batchable: true })
      const promise2 = queue.enqueue(batchRequest2, { batchable: true })

      // Advance timer to trigger batch processing
      vi.advanceTimersByTime(60)

      const results = await Promise.all([promise1, promise2])
      
      expect(results).toEqual(['batch1', 'batch2'])
    })

    it('should handle batch request failures individually', async () => {
      vi.useRealTimers() // Use real timers for batch processing
      
      const successRequest = vi.fn().mockResolvedValue('success')
      const failRequest = vi.fn().mockRejectedValue(new Error('batch fail'))

      const successPromise = queue.enqueue(successRequest, { batchable: true })
      const failPromise = queue.enqueue(failRequest, { batchable: true })

      const results = await Promise.allSettled([successPromise, failPromise])
      
      expect(results[0].status).toBe('fulfilled')
      expect(results[0].value).toBe('success')
      expect(results[1].status).toBe('rejected')
      expect(results[1].reason.message).toBe('batch fail')
    }, 5000)
  })

  describe('Request Timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should timeout requests that exceed timeout limit', async () => {
      vi.useRealTimers() // Use real timers for timeout
      
      const slowRequest = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 1000))
      )

      const startTime = Date.now()
      
      try {
        await queue.enqueue(slowRequest, { timeout: 200 })
        expect.fail('Promise should have been rejected')
      } catch (error) {
        const elapsed = Date.now() - startTime
        expect(elapsed).toBeLessThan(500) // Should timeout before request completes
        expect(error).toBeInstanceOf(QueueError)
        expect(error.message).toBe('Request timeout')
        expect(error.code).toBe('TIMEOUT')
      }
    }, 3000)

    it('should not timeout requests that complete within limit', async () => {
      const fastRequest = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('fast'), 500))
      )

      const promise = queue.enqueue(fastRequest, { timeout: 1000 })

      // Advance timer but not past timeout
      vi.advanceTimersByTime(600)

      const result = await promise
      expect(result).toBe('fast')
    })
  })

  describe('Retry Logic', () => {
    it('should retry failed requests up to maxRetries', async () => {
      vi.useRealTimers() // Use real timers for retry delays
      
      let callCount = 0
      const flakyRequest = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          const error = new Error('Network error')
          error.code = 'NETWORK_ERROR'
          return Promise.reject(error)
        }
        return Promise.resolve('success after retry')
      })

      const result = await queue.enqueue(flakyRequest, { maxRetries: 3 })
      
      expect(result).toBe('success after retry')
      expect(flakyRequest).toHaveBeenCalledTimes(3)
    }, 10000)

    it('should not retry non-retryable errors', async () => {
      const badRequest = vi.fn().mockRejectedValue(new Error('Bad request'))
      badRequest.mockRejectedValue({ response: { status: 400 } })

      await expect(queue.enqueue(badRequest, { maxRetries: 3 })).rejects.toThrow()
      expect(badRequest).toHaveBeenCalledTimes(1)
    })

    it('should retry timeout errors', async () => {
      vi.useRealTimers() // Use real timers for retry delays
      
      let callCount = 0
      const timeoutRequest = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 2) {
          const error = new QueueError('Request timeout', 'TIMEOUT')
          return Promise.reject(error)
        }
        return Promise.resolve('success after timeout retry')
      })

      const result = await queue.enqueue(timeoutRequest, { maxRetries: 2 })
      
      expect(result).toBe('success after timeout retry')
      expect(timeoutRequest).toHaveBeenCalledTimes(2)
    }, 10000)
  })

  describe('Queue Control', () => {
    it('should pause and resume queue processing', async () => {
      const request1 = vi.fn().mockResolvedValue('result1')
      const request2 = vi.fn().mockResolvedValue('result2')

      queue.pause()
      expect(queue.isPaused).toBe(true)
      expect(queue.status).toBe(QUEUE_STATUS.PAUSED)

      // These should be queued but not processed
      const promise1 = queue.enqueue(request1)
      const promise2 = queue.enqueue(request2)

      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(request1).not.toHaveBeenCalled()
      expect(request2).not.toHaveBeenCalled()
      expect(queue.getStatus().queueSizes.total).toBe(2)

      queue.resume()
      
      const results = await Promise.all([promise1, promise2])
      expect(results).toEqual(['result1', 'result2'])
    })

    it('should clear all queues', async () => {
      // Pause queue to prevent immediate processing
      queue.pause()
      
      const request1 = vi.fn().mockResolvedValue('result1')
      const request2 = vi.fn().mockResolvedValue('result2')

      const promise1 = queue.enqueue(request1)
      const promise2 = queue.enqueue(request2)

      // Verify requests are queued
      expect(queue.getStatus().queueSizes.total).toBe(2)

      queue.clear()

      await expect(promise1).rejects.toThrow('Queue cleared')
      await expect(promise2).rejects.toThrow('Queue cleared')
      
      expect(queue.getStatus().queueSizes.total).toBe(0)
    })
  })

  describe('Status and Monitoring', () => {
    it('should provide accurate status information', () => {
      const status = queue.getStatus()
      
      expect(status).toHaveProperty('status')
      expect(status).toHaveProperty('isPaused')
      expect(status).toHaveProperty('activeRequests')
      expect(status).toHaveProperty('queueSizes')
      expect(status).toHaveProperty('stats')
      
      expect(status.queueSizes).toHaveProperty('high')
      expect(status.queueSizes).toHaveProperty('normal')
      expect(status.queueSizes).toHaveProperty('low')
      expect(status.queueSizes).toHaveProperty('total')
    })

    it('should track active requests information', async () => {
      const slowRequest = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 100))
      )

      const promise = queue.enqueue(slowRequest, { priority: REQUEST_PRIORITY.HIGH })
      
      // Check active requests while processing
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const activeRequests = queue.getActiveRequests()
      expect(activeRequests).toHaveLength(1)
      expect(activeRequests[0]).toHaveProperty('id')
      expect(activeRequests[0]).toHaveProperty('type', 'single')
      expect(activeRequests[0]).toHaveProperty('priority', REQUEST_PRIORITY.HIGH)
      expect(activeRequests[0]).toHaveProperty('startedAt')
      expect(activeRequests[0]).toHaveProperty('duration')

      await promise
    })

    it('should update statistics correctly', async () => {
      const request1 = vi.fn().mockResolvedValue('success')
      const request2 = vi.fn().mockRejectedValue(new Error('failure'))

      await queue.enqueue(request1)
      
      try {
        await queue.enqueue(request2, { maxRetries: 0 })
      } catch (error) {
        // Expected failure
      }

      const stats = queue.getStatus().stats
      expect(stats.totalQueued).toBe(2)
      expect(stats.totalProcessed).toBe(2)
      expect(stats.totalFailed).toBe(1)
      expect(stats.averageWaitTime).toBeGreaterThanOrEqual(0)
      expect(stats.averageProcessingTime).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Event System', () => {
    it('should emit status change events', () => {
      const statusHandler = vi.fn()
      queue.on('statusChange', statusHandler)

      queue.pause()
      
      expect(statusHandler).toHaveBeenCalledWith({
        oldStatus: QUEUE_STATUS.IDLE,
        newStatus: QUEUE_STATUS.PAUSED
      })
    })

    it('should emit empty event when queue becomes empty', async () => {
      const emptyHandler = vi.fn()
      queue.on('empty', emptyHandler)

      const request = vi.fn().mockResolvedValue('success')
      await queue.enqueue(request)

      expect(emptyHandler).toHaveBeenCalled()
    })

    it('should emit request complete events', async () => {
      const completeHandler = vi.fn()
      queue.on('requestComplete', completeHandler)

      const request = vi.fn().mockResolvedValue('success')
      await queue.enqueue(request)

      expect(completeHandler).toHaveBeenCalledWith({
        request: expect.objectContaining({
          id: expect.any(String),
          priority: REQUEST_PRIORITY.NORMAL
        }),
        success: true
      })
    })

    it('should remove event listeners', () => {
      const handler = vi.fn()
      queue.on('statusChange', handler)
      queue.off('statusChange', handler)

      queue.pause()
      
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle request function errors gracefully', async () => {
      const errorRequest = vi.fn().mockRejectedValue(new Error('Request failed'))

      await expect(queue.enqueue(errorRequest, { maxRetries: 0 })).rejects.toThrow('Request failed')
      
      expect(queue.stats.totalFailed).toBe(1)
      expect(queue.activeRequests.size).toBe(0)
    })

    it('should handle event listener errors gracefully', () => {
      const badHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error')
      })
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      queue.on('statusChange', badHandler)
      queue.pause()

      expect(consoleSpy).toHaveBeenCalledWith('Error in queue event listener:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })
})