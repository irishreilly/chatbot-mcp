import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chatAPI, errorUtils, APIError } from '../apiClient'
import { requestManager } from '../requestManager'

// Mock the proxy monitor
vi.mock('../proxyMonitor', () => ({
  default: {
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    addListener: vi.fn(() => vi.fn()), // Return unsubscribe function
    getDiagnostics: vi.fn(() => ({
      status: { isHealthy: true },
      statistics: { requests: 0, errors: 0 },
      recentLogs: [],
      configuration: {}
    })),
    testEndpoint: vi.fn(),
    forceHealthCheck: vi.fn(),
    resetStats: vi.fn()
  }
}))

// Mock the request manager
vi.mock('../requestManager', () => ({
  requestManager: {
    makeRequest: vi.fn(),
    cancelRequest: vi.fn(),
    cancelAllRequests: vi.fn(),
    getActiveRequests: vi.fn(),
    getStats: vi.fn()
  },
  RequestError: class RequestError extends Error {
    constructor(message, code, requestMeta, originalError) {
      super(message)
      this.code = code
      this.requestMeta = requestMeta
      this.originalError = originalError
    }
    isTimeout() { return this.code === 'TIMEOUT' }
    isCancelled() { return this.code === 'CANCELLED' }
    isNetworkError() { return this.code === 'NETWORK_ERROR' }
  },
  TIMEOUT_CONFIG: {
    chat: 30000,
    health: 5000,
    default: 15000
  }
}))

describe('Enhanced API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('chatAPI', () => {
    describe('sendMessage', () => {
      it('should send message successfully', async () => {
        const mockResponse = {
          data: {
            response: 'Hello!',
            timestamp: '2024-01-01T00:00:00Z',
            mcp_tools_used: []
          },
          status: 200
        }
        
        requestManager.makeRequest.mockResolvedValue(mockResponse)

        const result = await chatAPI.sendMessage('Hello', 'conv123')

        expect(requestManager.makeRequest).toHaveBeenCalledWith({
          url: '/api/chat',
          method: 'POST',
          data: {
            message: 'Hello',
            conversation_id: 'conv123'
          },
          headers: {
            'Content-Type': 'application/json'
          }
        })

        expect(result).toEqual(mockResponse.data)
      })

      it('should handle request timeout', async () => {
        const { RequestError } = await import('../requestManager')
        const timeoutError = new RequestError('Request timed out', 'TIMEOUT', { id: 'req1' })
        
        requestManager.makeRequest.mockRejectedValue(timeoutError)

        await expect(chatAPI.sendMessage('Hello')).rejects.toThrow(APIError)
        await expect(chatAPI.sendMessage('Hello')).rejects.toThrow('Request timed out - please try again')
      })

      it('should handle network error', async () => {
        const { RequestError } = await import('../requestManager')
        const networkError = new RequestError('Network error', 'NETWORK_ERROR', { id: 'req1' })
        
        requestManager.makeRequest.mockRejectedValue(networkError)

        await expect(chatAPI.sendMessage('Hello')).rejects.toThrow(APIError)
        await expect(chatAPI.sendMessage('Hello')).rejects.toThrow('Network error - please check your connection')
      })

      it('should handle server error response', async () => {
        const { RequestError } = await import('../requestManager')
        const serverError = new RequestError('Server error', 'NETWORK_ERROR', { id: 'req1' }, {
          response: {
            status: 500,
            data: {
              error: {
                message: 'Internal server error',
                code: 'INTERNAL_ERROR'
              }
            }
          }
        })
        
        requestManager.makeRequest.mockRejectedValue(serverError)

        await expect(chatAPI.sendMessage('Hello')).rejects.toThrow(APIError)
        await expect(chatAPI.sendMessage('Hello')).rejects.toThrow('Internal server error')
      })
    })

    describe('getConversation', () => {
      it('should get conversation successfully', async () => {
        const mockResponse = {
          data: {
            id: 'conv123',
            messages: []
          },
          status: 200
        }
        
        requestManager.makeRequest.mockResolvedValue(mockResponse)

        const result = await chatAPI.getConversation('conv123')

        expect(requestManager.makeRequest).toHaveBeenCalledWith({
          url: '/api/conversations/conv123',
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        expect(result).toEqual(mockResponse.data)
      })
    })

    describe('healthCheck', () => {
      it('should perform health check successfully', async () => {
        const mockResponse = {
          data: { status: 'ok' },
          status: 200
        }
        
        requestManager.makeRequest.mockResolvedValue(mockResponse)

        const result = await chatAPI.healthCheck()

        expect(requestManager.makeRequest).toHaveBeenCalledWith({
          url: '/api/health',
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        expect(result).toEqual(mockResponse.data)
      })
    })
  })

  describe('errorUtils', () => {
    describe('isRetryable', () => {
      it('should identify retryable errors', () => {
        const networkError = new APIError('Network error', 0, 'NETWORK_ERROR')
        const timeoutError = new APIError('Timeout', 0, 'TIMEOUT_ERROR')
        const serverError = new APIError('Server error', 500, 'SERVER_ERROR')
        const clientError = new APIError('Client error', 400, 'CLIENT_ERROR')

        expect(errorUtils.isRetryable(networkError)).toBe(true)
        expect(errorUtils.isRetryable(timeoutError)).toBe(true)
        expect(errorUtils.isRetryable(serverError)).toBe(true)
        expect(errorUtils.isRetryable(clientError)).toBe(false)
      })

      it('should not retry non-APIError instances', () => {
        const genericError = new Error('Generic error')
        expect(errorUtils.isRetryable(genericError)).toBe(false)
      })
    })

    describe('getUserMessage', () => {
      it('should return user-friendly messages for different error types', () => {
        const networkError = new APIError('Network error', 0, 'NETWORK_ERROR')
        const timeoutError = new APIError('Timeout', 0, 'TIMEOUT_ERROR')
        const rateLimitError = new APIError('Rate limit', 429, 'RATE_LIMIT')
        const serverError = new APIError('Server error', 500, 'SERVER_ERROR')

        expect(errorUtils.getUserMessage(networkError)).toContain('Unable to connect')
        expect(errorUtils.getUserMessage(timeoutError)).toContain('timed out')
        expect(errorUtils.getUserMessage(rateLimitError)).toContain('Too many requests')
        expect(errorUtils.getUserMessage(serverError)).toContain('Server error')
      })

      it('should handle non-APIError instances', () => {
        const genericError = new Error('Generic error')
        expect(errorUtils.getUserMessage(genericError)).toBe('An unexpected error occurred. Please try again.')
      })
    })

    describe('retry', () => {
      it('should retry retryable errors with exponential backoff', async () => {
        vi.useFakeTimers()
        
        const mockFn = vi.fn()
        const retryableError = new APIError('Network error', 0, 'NETWORK_ERROR')
        
        // Fail twice, then succeed
        mockFn
          .mockRejectedValueOnce(retryableError)
          .mockRejectedValueOnce(retryableError)
          .mockResolvedValueOnce('success')

        const retryPromise = errorUtils.retry(mockFn, 3, 100)
        
        // Fast-forward through retry delays
        await vi.runAllTimersAsync()
        
        const result = await retryPromise
        
        expect(result).toBe('success')
        expect(mockFn).toHaveBeenCalledTimes(3)
        
        vi.useRealTimers()
      })

      it('should not retry non-retryable errors', async () => {
        const mockFn = vi.fn()
        const nonRetryableError = new APIError('Client error', 400, 'CLIENT_ERROR')
        
        mockFn.mockRejectedValue(nonRetryableError)

        await expect(errorUtils.retry(mockFn, 3, 100)).rejects.toThrow(nonRetryableError)
        expect(mockFn).toHaveBeenCalledTimes(1)
      })

      it('should give up after max retries', async () => {
        vi.useFakeTimers()
        
        const mockFn = vi.fn()
        const retryableError = new APIError('Network error', 0, 'NETWORK_ERROR')
        
        mockFn.mockRejectedValue(retryableError)

        const retryPromise = errorUtils.retry(mockFn, 2, 100)
        
        await vi.runAllTimersAsync()
        
        await expect(retryPromise).rejects.toThrow(retryableError)
        expect(mockFn).toHaveBeenCalledTimes(3) // Initial + 2 retries
        
        vi.useRealTimers()
      })
    })

    describe('request management utilities', () => {
      it('should delegate to request manager', () => {
        requestManager.cancelRequest.mockReturnValue(true)
        requestManager.cancelAllRequests.mockReturnValue(5)
        requestManager.getActiveRequests.mockReturnValue([])
        requestManager.getStats.mockReturnValue({ active: 0, total: 10 })

        expect(errorUtils.cancelRequest('req1')).toBe(true)
        expect(errorUtils.cancelAllRequests()).toBe(5)
        expect(errorUtils.getActiveRequests()).toEqual([])
        expect(errorUtils.getRequestStats()).toEqual({ active: 0, total: 10 })

        expect(requestManager.cancelRequest).toHaveBeenCalledWith('req1')
        expect(requestManager.cancelAllRequests).toHaveBeenCalled()
        expect(requestManager.getActiveRequests).toHaveBeenCalled()
        expect(requestManager.getStats).toHaveBeenCalled()
      })
    })
  })

  describe('APIError', () => {
    it('should create error with correct properties', () => {
      const error = new APIError('Test error', 404, 'NOT_FOUND', { detail: 'Resource not found' })
      
      expect(error.message).toBe('Test error')
      expect(error.status).toBe(404)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.details).toEqual({ detail: 'Resource not found' })
    })

    it('should have correct type checking methods', () => {
      const networkError = new APIError('Network error', 0, 'NETWORK_ERROR')
      const serverError = new APIError('Server error', 500, 'SERVER_ERROR')
      const clientError = new APIError('Client error', 400, 'CLIENT_ERROR')
      const timeoutError = new APIError('Timeout error', 0, 'ECONNABORTED')

      expect(networkError.isNetworkError()).toBe(true)
      expect(networkError.isServerError()).toBe(false)
      expect(networkError.isClientError()).toBe(false)

      expect(serverError.isNetworkError()).toBe(false)
      expect(serverError.isServerError()).toBe(true)
      expect(serverError.isClientError()).toBe(false)

      expect(clientError.isNetworkError()).toBe(false)
      expect(clientError.isServerError()).toBe(false)
      expect(clientError.isClientError()).toBe(true)

      expect(timeoutError.isTimeout()).toBe(true)
    })
  })
}) 
 describe('Proxy Functionality', () => {
    let apiClientInstance

    beforeEach(async () => {
      // Import the default export to get the singleton instance
      const module = await import('../apiClient')
      apiClientInstance = module.default
      
      // Reset proxy state
      apiClientInstance.useDirectConnection = false
      apiClientInstance.proxyFailureCount = 0
    })

    describe('Proxy Error Detection', () => {
      it('should detect proxy-related errors', () => {
        const { RequestError } = require('../requestManager')
        
        const proxyErrors = [
          new RequestError('Connection refused', 'NETWORK_ERROR', {}, { code: 'ECONNREFUSED' }),
          new RequestError('Connection reset', 'NETWORK_ERROR', {}, { code: 'ECONNRESET' }),
          new RequestError('Not found', 'NETWORK_ERROR', {}, { code: 'ENOTFOUND' }),
          new RequestError('Bad Gateway', 'NETWORK_ERROR', {}, { message: '502 Bad Gateway' }),
          new RequestError('Proxy error', 'NETWORK_ERROR', {}, { message: 'proxy timeout' }),
          new RequestError('Timeout', 'TIMEOUT', {}, {})
        ]

        proxyErrors.forEach(error => {
          expect(apiClientInstance._isProxyError(error)).toBe(true)
        })
      })

      it('should not detect non-proxy errors as proxy errors', () => {
        const { RequestError } = require('../requestManager')
        
        const nonProxyErrors = [
          new RequestError('Server error', 'NETWORK_ERROR', {}, { message: '500 Internal Server Error' }),
          new RequestError('Cancelled', 'CANCELLED', {}, {}),
          new Error('Generic error')
        ]

        nonProxyErrors.forEach(error => {
          expect(apiClientInstance._isProxyError(error)).toBe(false)
        })
      })
    })

    describe('Connection Mode Switching', () => {
      it('should switch to direct connection after max proxy failures in dev mode', async () => {
        // Mock development environment
        vi.stubEnv('DEV', true)
        
        const { RequestError } = require('../requestManager')
        const proxyError = new RequestError('Connection refused', 'NETWORK_ERROR', {}, { code: 'ECONNREFUSED' })
        
        // Mock request manager to fail with proxy error, then succeed with direct connection
        requestManager.makeRequest
          .mockRejectedValueOnce(proxyError) // First proxy attempt fails
          .mockRejectedValueOnce(proxyError) // Second proxy attempt fails  
          .mockRejectedValueOnce(proxyError) // Third proxy attempt fails (triggers fallback)
          .mockResolvedValueOnce({ data: 'success', status: 200 }) // Direct connection succeeds

        const result = await apiClientInstance.get('/test')
        
        expect(apiClientInstance.useDirectConnection).toBe(true)
        expect(result.data).toBe('success')
        expect(requestManager.makeRequest).toHaveBeenCalledTimes(4) // 3 proxy attempts + 1 direct
        
        vi.unstubAllEnvs()
      })

      it('should not switch to direct connection in production', async () => {
        // Mock production environment
        vi.stubEnv('DEV', false)
        
        const { RequestError } = require('../requestManager')
        const proxyError = new RequestError('Connection refused', 'NETWORK_ERROR', {}, { code: 'ECONNREFUSED' })
        
        requestManager.makeRequest.mockRejectedValue(proxyError)

        await expect(apiClientInstance.get('/test')).rejects.toThrow()
        
        expect(apiClientInstance.useDirectConnection).toBe(false)
        
        vi.unstubAllEnvs()
      })

      it('should manually switch connection mode in development', () => {
        vi.stubEnv('DEV', true)
        
        expect(apiClientInstance.setConnectionMode('direct')).toBe(true)
        expect(apiClientInstance.useDirectConnection).toBe(true)
        
        expect(apiClientInstance.setConnectionMode('proxy')).toBe(true)
        expect(apiClientInstance.useDirectConnection).toBe(false)
        expect(apiClientInstance.proxyFailureCount).toBe(0)
        
        expect(apiClientInstance.setConnectionMode('invalid')).toBe(false)
        
        vi.unstubAllEnvs()
      })

      it('should not allow manual connection mode switching in production', () => {
        vi.stubEnv('DEV', false)
        
        expect(apiClientInstance.setConnectionMode('direct')).toBe(false)
        expect(apiClientInstance.useDirectConnection).toBe(false)
        
        vi.unstubAllEnvs()
      })
    })

    describe('Proxy Diagnostics', () => {
      it('should return comprehensive proxy diagnostics', () => {
        const mockDiagnostics = {
          status: { isHealthy: true, lastCheck: '2023-01-01T00:00:00Z' },
          statistics: { requests: 10, errors: 2, averageResponseTime: 150 },
          recentLogs: [{ level: 'info', message: 'Test log' }],
          configuration: { healthCheckInterval: 30000 }
        }
        
        const proxyMonitor = require('../proxyMonitor').default
        proxyMonitor.getDiagnostics.mockReturnValue(mockDiagnostics)
        
        const diagnostics = apiClientInstance.getProxyDiagnostics()
        
        expect(diagnostics).toEqual({
          ...mockDiagnostics,
          connectionMode: 'proxy',
          proxyFailureCount: 0,
          maxProxyFailures: 3,
          fallbackAvailable: expect.any(Boolean)
        })
      })

      it('should test proxy connectivity', async () => {
        const mockResult = { success: true, responseTime: 100 }
        
        const proxyMonitor = require('../proxyMonitor').default
        proxyMonitor.testEndpoint.mockResolvedValue(mockResult)
        
        const result = await apiClientInstance.testProxyConnectivity()
        
        expect(result).toEqual(mockResult)
        expect(proxyMonitor.testEndpoint).toHaveBeenCalledWith('/api/health')
      })

      it('should force proxy health check', async () => {
        const proxyMonitor = require('../proxyMonitor').default
        proxyMonitor.forceHealthCheck.mockResolvedValue()
        
        await apiClientInstance.forceProxyHealthCheck()
        
        expect(proxyMonitor.forceHealthCheck).toHaveBeenCalled()
      })

      it('should reset proxy statistics', () => {
        const proxyMonitor = require('../proxyMonitor').default
        proxyMonitor.resetStats.mockImplementation(() => {})
        
        apiClientInstance.proxyFailureCount = 5
        apiClientInstance.resetProxyStats()
        
        expect(proxyMonitor.resetStats).toHaveBeenCalled()
        expect(apiClientInstance.proxyFailureCount).toBe(0)
      })
    })

    describe('Request Headers', () => {
      it('should add connection mode header to requests', async () => {
        requestManager.makeRequest.mockResolvedValue({ data: 'success', status: 200 })
        
        await apiClientInstance.get('/test')
        
        expect(requestManager.makeRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Connection-Mode': 'proxy'
            })
          })
        )
      })

      it('should add direct connection header when using fallback', async () => {
        vi.stubEnv('DEV', true)
        apiClientInstance.useDirectConnection = true
        
        requestManager.makeRequest.mockResolvedValue({ data: 'success', status: 200 })
        
        await apiClientInstance.get('/test')
        
        expect(requestManager.makeRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:8000/api/test',
            headers: expect.objectContaining({
              'X-Connection-Mode': 'direct'
            })
          })
        )
        
        vi.unstubAllEnvs()
      })
    })

    describe('URL Construction', () => {
      it('should use proxy URL by default', () => {
        expect(apiClientInstance._getBaseURL()).toBe('/api')
      })

      it('should use direct URL when in direct connection mode', () => {
        apiClientInstance.useDirectConnection = true
        expect(apiClientInstance._getBaseURL()).toBe('http://localhost:8000/api')
      })
    })
  })