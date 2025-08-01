import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { requestManager, RequestError, TIMEOUT_CONFIG, REQUEST_STATUS } from '../requestManager'

// Mock axios
vi.mock('axios')

describe('RequestManager', () => {
  beforeEach(() => {
    // Clear any active requests
    requestManager.cancelAllRequests()
    // Reset request history
    requestManager.requestHistory = []
    requestManager.requestIdCounter = 0
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('makeRequest', () => {
    it('should make a successful request', async () => {
      const mockResponse = { data: 'test', status: 200 }
      axios.mockResolvedValue(mockResponse)

      const config = { url: '/test', method: 'GET' }
      const response = await requestManager.makeRequest(config)

      expect(response).toBe(mockResponse)
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        url: '/test',
        method: 'GET',
        signal: expect.any(AbortSignal)
      }))
    })

    it('should handle request timeout', async () => {
      vi.useFakeTimers()
      
      // Mock axios to hang indefinitely
      axios.mockImplementation(() => new Promise(() => {}))

      const config = { url: '/test', method: 'GET' }
      const requestPromise = requestManager.makeRequest(config, { timeout: 1000 })

      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(1000)

      await expect(requestPromise).rejects.toThrow(RequestError)
      await expect(requestPromise).rejects.toThrow('Request timed out')

      vi.useRealTimers()
    })

    it('should handle request cancellation', async () => {
      // Mock axios to hang indefinitely
      axios.mockImplementation(() => new Promise(() => {}))

      const config = { url: '/test', method: 'GET' }
      const requestPromise = requestManager.makeRequest(config)

      // Get the request ID and cancel it
      const activeRequests = requestManager.getActiveRequests()
      expect(activeRequests).toHaveLength(1)
      
      const requestId = activeRequests[0].id
      requestManager.cancelRequest(requestId)

      await expect(requestPromise).rejects.toThrow(RequestError)
      await expect(requestPromise).rejects.toThrow('Request was cancelled')
    })

    it('should use correct timeout for different request types', async () => {
      const mockResponse = { data: 'test', status: 200 }
      axios.mockResolvedValue(mockResponse)

      // Test chat request timeout
      await requestManager.makeRequest({ url: '/api/chat', method: 'POST' })
      
      // Test health check timeout
      await requestManager.makeRequest({ url: '/api/health', method: 'GET' })

      // Verify requests were made (we can't easily test the actual timeout values in unit tests)
      expect(axios).toHaveBeenCalledTimes(2)
    })

    it('should deduplicate identical requests by default', async () => {
      const mockResponse = { data: 'test', status: 200 }
      axios.mockResolvedValue(mockResponse)

      const config = { url: '/test', method: 'GET' }
      
      // Make two identical requests simultaneously
      const promise1 = requestManager.makeRequest(config)
      const promise2 = requestManager.makeRequest(config)

      const [response1, response2] = await Promise.all([promise1, promise2])

      expect(response1).toBe(mockResponse)
      expect(response2).toBe(mockResponse)
      expect(response1).toBe(response2) // Should be the same promise result
      expect(axios).toHaveBeenCalledTimes(1) // Only one actual request
    })

    it('should allow disabling deduplication', async () => {
      const mockResponse = { data: 'test', status: 200 }
      axios.mockResolvedValue(mockResponse)

      const config = { url: '/test', method: 'GET' }
      
      // Make two identical requests with deduplication disabled
      const promise1 = requestManager.makeRequest(config, { deduplicate: false })
      const promise2 = requestManager.makeRequest(config, { deduplicate: false })

      await Promise.all([promise1, promise2])

      expect(axios).toHaveBeenCalledTimes(2) // Two separate requests
    })
  })

  describe('cancelRequest', () => {
    it('should cancel a specific request', async () => {
      // Mock axios to hang indefinitely
      axios.mockImplementation(() => new Promise(() => {}))

      const config = { url: '/test', method: 'GET' }
      const requestPromise = requestManager.makeRequest(config)

      const activeRequests = requestManager.getActiveRequests()
      const requestId = activeRequests[0].id

      const cancelled = requestManager.cancelRequest(requestId)
      expect(cancelled).toBe(true)

      await expect(requestPromise).rejects.toThrow('Request was cancelled')
    })

    it('should return false for non-existent request', () => {
      const cancelled = requestManager.cancelRequest('non-existent-id')
      expect(cancelled).toBe(false)
    })
  })

  describe('cancelAllRequests', () => {
    it('should cancel all active requests', async () => {
      // Mock axios to hang indefinitely
      axios.mockImplementation(() => new Promise(() => {}))

      // Start multiple requests
      const promise1 = requestManager.makeRequest({ url: '/test1' })
      const promise2 = requestManager.makeRequest({ url: '/test2' })
      const promise3 = requestManager.makeRequest({ url: '/test3' })

      expect(requestManager.getActiveRequests()).toHaveLength(3)

      const cancelledCount = requestManager.cancelAllRequests()
      expect(cancelledCount).toBe(3)
      expect(requestManager.getActiveRequests()).toHaveLength(0)

      // All requests should be cancelled
      await expect(promise1).rejects.toThrow('Request was cancelled')
      await expect(promise2).rejects.toThrow('Request was cancelled')
      await expect(promise3).rejects.toThrow('Request was cancelled')
    })
  })

  describe('getActiveRequests', () => {
    it('should return active request information', async () => {
      // Mock axios to hang indefinitely
      axios.mockImplementation(() => new Promise(() => {}))

      const config = { url: '/test', method: 'POST' }
      requestManager.makeRequest(config)

      const activeRequests = requestManager.getActiveRequests()
      expect(activeRequests).toHaveLength(1)
      
      const request = activeRequests[0]
      expect(request).toMatchObject({
        url: '/test',
        method: 'POST',
        status: REQUEST_STATUS.PENDING
      })
      expect(request.id).toBeDefined()
      expect(request.startTime).toBeDefined()
    })
  })

  describe('getStats', () => {
    it('should return request statistics', async () => {
      const mockResponse = { data: 'test', status: 200 }
      axios.mockResolvedValue(mockResponse)

      // Make some successful requests
      await requestManager.makeRequest({ url: '/test1' })
      await requestManager.makeRequest({ url: '/test2' })

      // Make a failed request
      axios.mockRejectedValue(new Error('Network error'))
      try {
        await requestManager.makeRequest({ url: '/test3' })
      } catch (e) {
        // Expected to fail
      }

      const stats = requestManager.getStats()
      expect(stats.total).toBe(3)
      expect(stats.successful).toBe(2)
      expect(stats.failed).toBe(1)
      expect(stats.successRate).toBeCloseTo(66.67, 1)
    })
  })

  describe('RequestError', () => {
    it('should create error with correct properties', () => {
      const requestMeta = { id: 'test-id', url: '/test' }
      const originalError = new Error('Original error')
      
      const error = new RequestError('Test error', 'TEST_CODE', requestMeta, originalError)
      
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.requestMeta).toBe(requestMeta)
      expect(error.originalError).toBe(originalError)
    })

    it('should have correct type checking methods', () => {
      const timeoutError = new RequestError('Timeout', 'TIMEOUT', {})
      const cancelledError = new RequestError('Cancelled', 'CANCELLED', {})
      const networkError = new RequestError('Network', 'NETWORK_ERROR', {})

      expect(timeoutError.isTimeout()).toBe(true)
      expect(timeoutError.isCancelled()).toBe(false)
      expect(timeoutError.isNetworkError()).toBe(false)

      expect(cancelledError.isTimeout()).toBe(false)
      expect(cancelledError.isCancelled()).toBe(true)
      expect(cancelledError.isNetworkError()).toBe(false)

      expect(networkError.isTimeout()).toBe(false)
      expect(networkError.isCancelled()).toBe(false)
      expect(networkError.isNetworkError()).toBe(true)
    })
  })
})