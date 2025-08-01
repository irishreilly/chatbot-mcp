import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Vite Proxy Configuration Logic', () => {
  let mockConsole
  let proxyStats
  let retryAttempts
  let retryConfig

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock console
    mockConsole = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn()
    }
    vi.stubGlobal('console', mockConsole)
    
    // Reset global proxy data
    globalThis.proxyStats = undefined
    globalThis.proxyLogs = undefined
    
    // Initialize proxy stats
    proxyStats = {
      requests: 0,
      errors: 0,
      timeouts: 0,
      retries: 0,
      lastError: null,
      lastSuccess: null,
      responseTimeHistory: [],
      consecutiveFailures: 0,
      isHealthy: true
    }
    
    retryAttempts = new Map()
    
    retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      retryMultiplier: 2,
      retryableErrors: ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET']
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const updateProxyStats = (type, data = {}) => {
    switch (type) {
      case 'request':
        proxyStats.requests++
        break
      case 'error':
        proxyStats.errors++
        proxyStats.consecutiveFailures++
        proxyStats.lastError = new Date().toISOString()
        proxyStats.isHealthy = proxyStats.consecutiveFailures < 3
        break
      case 'success':
        proxyStats.consecutiveFailures = 0
        proxyStats.isHealthy = true
        proxyStats.lastSuccess = new Date().toISOString()
        if (data.responseTime) {
          proxyStats.responseTimeHistory.push(data.responseTime)
          if (proxyStats.responseTimeHistory.length > 50) {
            proxyStats.responseTimeHistory = proxyStats.responseTimeHistory.slice(-50)
          }
        }
        break
      case 'timeout':
        proxyStats.timeouts++
        proxyStats.consecutiveFailures++
        proxyStats.isHealthy = proxyStats.consecutiveFailures < 3
        break
      case 'retry':
        proxyStats.retries++
        break
    }
    globalThis.proxyStats = { ...proxyStats }
  }

  const shouldRetry = (error, attempt) => {
    if (attempt >= retryConfig.maxRetries) {
      return false
    }
    
    const isRetryableError = (error.code && retryConfig.retryableErrors.includes(error.code)) || 
                            (error.message && error.message.includes('timeout')) ||
                            (error.message && error.message.includes('ECONNREFUSED'))
    
    return Boolean(isRetryableError)
  }

  const createErrorHandler = () => {
    return (err, req, res) => {
      const requestId = `${req.method}:${req.url}`
      const currentAttempt = retryAttempts.get(requestId) || 0
      
      updateProxyStats('error')

      if (shouldRetry(err, currentAttempt)) {
        const nextAttempt = currentAttempt + 1
        retryAttempts.set(requestId, nextAttempt)
        updateProxyStats('retry')
        return // Don't send response, will retry
      }

      retryAttempts.delete(requestId)

      if (!res.headersSent) {
        let statusCode = 502
        let errorMessage = 'Backend service unavailable'
        
        switch (err.code) {
          case 'ECONNREFUSED':
            statusCode = 503
            errorMessage = 'Backend service is not running'
            break
          case 'ETIMEDOUT':
            statusCode = 504
            errorMessage = 'Backend service timeout'
            break
          case 'ENOTFOUND':
            statusCode = 502
            errorMessage = 'Backend service not found'
            break
          case 'ECONNRESET':
            statusCode = 502
            errorMessage = 'Connection reset by backend'
            break
        }

        res.writeHead(statusCode, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'X-Proxy-Error': 'true',
          'X-Retry-Attempts': currentAttempt.toString()
        })
        
        const errorResponse = {
          error: {
            code: 'PROXY_ERROR',
            message: errorMessage,
            details: {
              type: err.code || 'UNKNOWN',
              timestamp: new Date().toISOString(),
              retryAttempts: currentAttempt,
              maxRetries: retryConfig.maxRetries
            }
          }
        }
        
        res.end(JSON.stringify(errorResponse))
      }
    }
  }

  describe('Proxy Statistics Tracking', () => {
    it('should initialize proxy stats correctly', () => {
      updateProxyStats('request')
      
      expect(globalThis.proxyStats).toEqual({
        requests: 1,
        errors: 0,
        timeouts: 0,
        retries: 0,
        lastError: null,
        lastSuccess: null,
        responseTimeHistory: [],
        consecutiveFailures: 0,
        isHealthy: true
      })
    })

    it('should track errors and consecutive failures', () => {
      updateProxyStats('error')
      updateProxyStats('error')
      
      expect(globalThis.proxyStats.errors).toBe(2)
      expect(globalThis.proxyStats.consecutiveFailures).toBe(2)
      expect(globalThis.proxyStats.isHealthy).toBe(true) // Still healthy under 3 failures
    })

    it('should mark as unhealthy after 3 consecutive failures', () => {
      updateProxyStats('error')
      updateProxyStats('error')
      updateProxyStats('error')
      
      expect(globalThis.proxyStats.consecutiveFailures).toBe(3)
      expect(globalThis.proxyStats.isHealthy).toBe(false)
    })

    it('should reset consecutive failures on success', () => {
      updateProxyStats('error')
      updateProxyStats('error')
      updateProxyStats('success', { responseTime: 100 })
      
      expect(globalThis.proxyStats.consecutiveFailures).toBe(0)
      expect(globalThis.proxyStats.isHealthy).toBe(true)
      expect(globalThis.proxyStats.responseTimeHistory).toEqual([100])
    })

    it('should track retries', () => {
      updateProxyStats('retry')
      updateProxyStats('retry')
      
      expect(globalThis.proxyStats.retries).toBe(2)
    })

    it('should limit response time history to 50 entries', () => {
      for (let i = 0; i < 60; i++) {
        updateProxyStats('success', { responseTime: i * 10 })
      }
      
      expect(globalThis.proxyStats.responseTimeHistory).toHaveLength(50)
      expect(globalThis.proxyStats.responseTimeHistory[0]).toBe(100) // First 10 should be removed
    })
  })

  describe('Retry Logic', () => {
    it('should determine retryable errors correctly', () => {
      expect(shouldRetry({ code: 'ECONNREFUSED' }, 0)).toBe(true)
      expect(shouldRetry({ code: 'ETIMEDOUT' }, 0)).toBe(true)
      expect(shouldRetry({ code: 'ENOTFOUND' }, 0)).toBe(true)
      expect(shouldRetry({ code: 'ECONNRESET' }, 0)).toBe(true)
      expect(shouldRetry({ message: 'timeout occurred' }, 0)).toBe(true)
      expect(shouldRetry({ message: 'ECONNREFUSED' }, 0)).toBe(true)
    })

    it('should not retry non-retryable errors', () => {
      expect(shouldRetry({ code: 'EPERM' }, 0)).toBe(false)
      expect(shouldRetry({ message: 'Invalid request' }, 0)).toBe(false)
    })

    it('should not retry after max attempts', () => {
      expect(shouldRetry({ code: 'ECONNREFUSED' }, 3)).toBe(false)
      expect(shouldRetry({ code: 'ETIMEDOUT' }, 4)).toBe(false)
    })
  })

  describe('Error Handler', () => {
    let errorHandler
    let mockReq
    let mockRes

    beforeEach(() => {
      errorHandler = createErrorHandler()
      
      mockReq = {
        method: 'GET',
        url: '/api/health'
      }
      
      mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
        headersSent: false
      }
    })

    it('should not send response on retryable error within retry limit', () => {
      const mockError = {
        message: 'Connection refused',
        code: 'ECONNREFUSED'
      }

      errorHandler(mockError, mockReq, mockRes)

      expect(mockRes.writeHead).not.toHaveBeenCalled()
      expect(mockRes.end).not.toHaveBeenCalled()
      expect(globalThis.proxyStats.retries).toBe(1)
    })

    it('should send error response after max retries exceeded', () => {
      const mockError = {
        message: 'Connection refused',
        code: 'ECONNREFUSED'
      }

      // Simulate multiple retry attempts
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes)
      }

      expect(mockRes.writeHead).toHaveBeenCalledWith(503, expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Proxy-Error': 'true',
        'X-Retry-Attempts': '3'
      }))

      const responseCall = mockRes.end.mock.calls[0][0]
      const responseData = JSON.parse(responseCall)

      expect(responseData.error.message).toBe('Backend service is not running')
      expect(responseData.error.details.retryAttempts).toBe(3)
      expect(responseData.error.details.maxRetries).toBe(3)
    })

    it('should use appropriate status codes for different error types', () => {
      const testCases = [
        { code: 'ECONNREFUSED', expectedStatus: 503, expectedMessage: 'Backend service is not running' },
        { code: 'ETIMEDOUT', expectedStatus: 504, expectedMessage: 'Backend service timeout' },
        { code: 'ENOTFOUND', expectedStatus: 502, expectedMessage: 'Backend service not found' },
        { code: 'ECONNRESET', expectedStatus: 502, expectedMessage: 'Connection reset by backend' }
      ]

      testCases.forEach(({ code, expectedStatus, expectedMessage }) => {
        // Reset mocks
        mockRes.writeHead.mockClear()
        mockRes.end.mockClear()

        const mockError = { message: 'Test error', code }
        
        // Exceed retry limit to trigger error response
        for (let i = 0; i < 4; i++) {
          errorHandler(mockError, { ...mockReq, url: `/api/test-${code}` }, mockRes)
        }

        expect(mockRes.writeHead).toHaveBeenCalledWith(expectedStatus, expect.any(Object))
        
        const responseCall = mockRes.end.mock.calls[0][0]
        const responseData = JSON.parse(responseCall)
        expect(responseData.error.message).toBe(expectedMessage)
      })
    })

    it('should not send response if headers already sent', () => {
      mockRes.headersSent = true
      
      const mockError = { message: 'Test error', code: 'UNKNOWN' }
      
      // Exceed retry limit
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes)
      }

      expect(mockRes.writeHead).not.toHaveBeenCalled()
      expect(mockRes.end).not.toHaveBeenCalled()
    })
  })

  describe('Retry Attempt Tracking', () => {
    let errorHandler

    beforeEach(() => {
      errorHandler = createErrorHandler()
    })

    it('should track retry attempts per request', () => {
      const mockError = { code: 'ECONNREFUSED' }
      const mockReq1 = { method: 'GET', url: '/api/health' }
      const mockReq2 = { method: 'POST', url: '/api/chat' }
      const mockRes = { headersSent: false, writeHead: vi.fn(), end: vi.fn() }

      // First request - should retry
      errorHandler(mockError, mockReq1, mockRes)
      expect(retryAttempts.get('GET:/api/health')).toBe(1)

      // Second request - should retry independently
      errorHandler(mockError, mockReq2, mockRes)
      expect(retryAttempts.get('POST:/api/chat')).toBe(1)
      expect(retryAttempts.get('GET:/api/health')).toBe(1) // Should remain unchanged
    })

    it('should clean up retry tracking after max attempts', () => {
      const mockError = { code: 'ECONNREFUSED' }
      const mockReq = { method: 'GET', url: '/api/health' }
      const mockRes = { headersSent: false, writeHead: vi.fn(), end: vi.fn() }

      // Exceed retry limit
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes)
      }

      expect(retryAttempts.has('GET:/api/health')).toBe(false)
    })
  })
})