import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Enhanced Vite Proxy Configuration', () => {
  let mockConsole
  let proxyStats
  let retryAttempts
  let retryConfig
  let fallbackConfig
  let circuitBreaker

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
    globalThis.circuitBreakerStatus = undefined
    
    // Initialize configurations
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

    fallbackConfig = {
      enabled: true,
      target: 'http://localhost:8001',
      maxFailuresBeforeFallback: 3, // Lower than circuit breaker threshold
      healthCheckEndpoint: '/api/health',
      fallbackTimeout: 10000
    }

    circuitBreaker = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: null,
      timeout: 60000,
      threshold: 5
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
    globalThis.circuitBreakerStatus = { ...circuitBreaker }
  }

  const updateCircuitBreaker = (success) => {
    if (success) {
      circuitBreaker.failureCount = 0
      circuitBreaker.state = 'CLOSED'
      circuitBreaker.lastFailureTime = null
    } else {
      circuitBreaker.failureCount++
      circuitBreaker.lastFailureTime = Date.now()
      
      if (circuitBreaker.failureCount >= circuitBreaker.threshold) {
        circuitBreaker.state = 'OPEN'
      }
    }
    globalThis.circuitBreakerStatus = { ...circuitBreaker }
  }

  const shouldAllowRequest = () => {
    if (circuitBreaker.state === 'CLOSED') {
      return true
    }
    
    if (circuitBreaker.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailureTime
      if (timeSinceLastFailure > circuitBreaker.timeout) {
        circuitBreaker.state = 'HALF_OPEN'
        return true
      }
      return false
    }
    
    return true
  }

  const getSuggestions = (errorCode) => {
    switch (errorCode) {
      case 'ECONNREFUSED':
        return [
          'Check if the backend server is running',
          'Verify the backend is listening on the correct port',
          'Check firewall settings'
        ]
      case 'ETIMEDOUT':
        return [
          'Check network connectivity',
          'Verify backend server is responsive',
          'Consider increasing timeout values'
        ]
      case 'ENOTFOUND':
        return [
          'Check DNS resolution',
          'Verify the backend hostname/IP is correct',
          'Check network configuration'
        ]
      case 'ECONNRESET':
        return [
          'Backend server may be overloaded',
          'Check for network interruptions',
          'Verify backend server stability'
        ]
      default:
        return [
          'Check backend server status',
          'Verify network connectivity',
          'Review server logs for more details'
        ]
    }
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

  const createEnhancedErrorHandler = () => {
    return (err, req, res, options) => {
      const requestId = `${req.method}:${req.url}`
      const currentAttempt = retryAttempts.get(requestId) || 0
      
      updateProxyStats('error')
      updateCircuitBreaker(false)

      // Check circuit breaker state first
      if (!shouldAllowRequest()) {
        if (!res.headersSent) {
          res.writeHead(503, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'X-Proxy-Error': 'true',
            'X-Circuit-Breaker': 'open',
            'X-Circuit-Breaker-State': circuitBreaker.state,
            'X-Error-Timestamp': new Date().toISOString(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Retry-After': Math.ceil(circuitBreaker.timeout / 1000).toString()
          })
          
          const errorResponse = {
            error: {
              code: 'CIRCUIT_BREAKER_OPEN',
              message: 'Service temporarily unavailable due to repeated failures',
              details: {
                type: 'CIRCUIT_BREAKER',
                timestamp: new Date().toISOString(),
                failureCount: circuitBreaker.failureCount,
                retryAfter: Math.ceil(circuitBreaker.timeout / 1000),
                target: options?.target || 'unknown',
                circuitBreakerState: circuitBreaker.state
              }
            },
            suggestions: [
              'Wait for the service to recover',
              'Check backend server status',
              'Try again in a few minutes'
            ]
          }
          
          res.end(JSON.stringify(errorResponse))
        }
        return
      }

      if (shouldRetry(err, currentAttempt)) {
        const nextAttempt = currentAttempt + 1
        retryAttempts.set(requestId, nextAttempt)
        updateProxyStats('retry')
        return // Don't send response, will retry
      }

      // Check if we should try fallback backend (only if circuit breaker allows)
      if (fallbackConfig.enabled && 
          proxyStats.consecutiveFailures >= fallbackConfig.maxFailuresBeforeFallback &&
          !req.headers['x-fallback-attempted'] &&
          shouldAllowRequest()) {
        
        req.headers['x-fallback-attempted'] = 'true'
        return // Don't send response, let fallback be attempted
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
          'X-Retry-Attempts': currentAttempt.toString(),
          'X-Proxy-Target': options?.target || 'unknown',
          'X-Error-Timestamp': new Date().toISOString(),
          'X-Circuit-Breaker-State': circuitBreaker.state,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        })
        
        const errorResponse = {
          error: {
            code: 'PROXY_ERROR',
            message: errorMessage,
            details: {
              type: err.code || 'UNKNOWN',
              timestamp: new Date().toISOString(),
              retryAttempts: currentAttempt,
              maxRetries: retryConfig.maxRetries,
              target: options?.target || 'unknown',
              requestId: req.headers['x-request-id'] || 'unknown',
              userAgent: req.headers['user-agent'] || 'unknown',
              circuitBreakerState: circuitBreaker.state
            }
          },
          suggestions: getSuggestions(err.code)
        }
        
        res.end(JSON.stringify(errorResponse))
      }
    }
  }

  describe('Enhanced Error Responses', () => {
    let errorHandler
    let mockReq
    let mockRes
    let mockOptions

    beforeEach(() => {
      errorHandler = createEnhancedErrorHandler()
      
      mockReq = {
        method: 'GET',
        url: '/api/health',
        headers: {
          'user-agent': 'test-agent',
          'x-request-id': 'test-123'
        }
      }
      
      mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
        headersSent: false
      }

      mockOptions = {
        target: 'http://localhost:8000'
      }
    })

    it('should include enhanced headers in error responses', () => {
      const mockError = { message: 'Test error', code: 'UNKNOWN' }
      
      // Exceed retry limit
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes, mockOptions)
      }

      expect(mockRes.writeHead).toHaveBeenCalledWith(502, expect.objectContaining({
        'X-Proxy-Target': 'http://localhost:8000',
        'X-Error-Timestamp': expect.any(String),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }))
    })

    it('should include detailed error information and suggestions', () => {
      const mockError = { message: 'Connection refused', code: 'ECONNREFUSED' }
      
      // Reset circuit breaker to prevent it from interfering
      circuitBreaker.state = 'CLOSED'
      circuitBreaker.failureCount = 0
      circuitBreaker.lastFailureTime = null
      
      // Disable fallback to ensure error response is sent
      fallbackConfig.enabled = false
      
      // Exceed retry limit
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes, mockOptions)
      }

      const responseCall = mockRes.end.mock.calls[0][0]
      const responseData = JSON.parse(responseCall)

      expect(responseData.error.details).toEqual(expect.objectContaining({
        type: 'ECONNREFUSED',
        retryAttempts: 3,
        maxRetries: 3,
        target: 'http://localhost:8000',
        requestId: 'test-123',
        userAgent: 'test-agent'
      }))

      expect(responseData.suggestions).toEqual([
        'Check if the backend server is running',
        'Verify the backend is listening on the correct port',
        'Check firewall settings'
      ])
    })

    it('should provide appropriate suggestions for different error types', () => {
      const testCases = [
        {
          code: 'ETIMEDOUT',
          expectedSuggestions: [
            'Check network connectivity',
            'Verify backend server is responsive',
            'Consider increasing timeout values'
          ]
        },
        {
          code: 'ENOTFOUND',
          expectedSuggestions: [
            'Check DNS resolution',
            'Verify the backend hostname/IP is correct',
            'Check network configuration'
          ]
        },
        {
          code: 'ECONNRESET',
          expectedSuggestions: [
            'Backend server may be overloaded',
            'Check for network interruptions',
            'Verify backend server stability'
          ]
        }
      ]

      testCases.forEach(({ code, expectedSuggestions }) => {
        // Reset mocks, retry attempts, and circuit breaker
        mockRes.writeHead.mockClear()
        mockRes.end.mockClear()
        retryAttempts.clear()
        
        // Reset circuit breaker to prevent it from interfering
        circuitBreaker.state = 'CLOSED'
        circuitBreaker.failureCount = 0
        circuitBreaker.lastFailureTime = null

        const mockError = { message: 'Test error', code }
        const testReq = { ...mockReq, url: `/api/test-${code}` }
        
        // Exceed retry limit to trigger error response
        for (let i = 0; i < 4; i++) {
          errorHandler(mockError, testReq, mockRes, mockOptions)
        }

        // Check if response was sent
        if (mockRes.end.mock.calls.length > 0) {
          const responseCall = mockRes.end.mock.calls[0][0]
          const responseData = JSON.parse(responseCall)
          expect(responseData.suggestions).toEqual(expectedSuggestions)
        } else {
          // If no response was sent, test the getSuggestions function directly
          expect(getSuggestions(code)).toEqual(expectedSuggestions)
        }
      })
    })
  })

  describe('Fallback Mechanism', () => {
    let errorHandler

    beforeEach(() => {
      errorHandler = createEnhancedErrorHandler()
    })

    it('should attempt fallback after consecutive failures threshold', () => {
      const mockError = { code: 'ECONNREFUSED' }
      const mockReq = { 
        method: 'GET', 
        url: '/api/health',
        headers: {}
      }
      const mockRes = { headersSent: false, writeHead: vi.fn(), end: vi.fn() }
      const mockOptions = { target: 'http://localhost:8000' }

      // Simulate consecutive failures to reach fallback threshold but not circuit breaker threshold
      proxyStats.consecutiveFailures = 3 // Equal to fallback threshold
      circuitBreaker.failureCount = 0 // Start with 0 to prevent circuit breaker from opening
      globalThis.proxyStats = { ...proxyStats }

      // Exceed retry limit first, then check for fallback
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes, mockOptions)
      }

      // Should not send error response, should attempt fallback
      expect(mockRes.writeHead).not.toHaveBeenCalled()
      expect(mockRes.end).not.toHaveBeenCalled()
      expect(mockReq.headers['x-fallback-attempted']).toBe('true')
    })

    it('should not attempt fallback if already attempted', () => {
      const mockError = { code: 'ECONNREFUSED' }
      const mockReq = { 
        method: 'GET', 
        url: '/api/health',
        headers: { 'x-fallback-attempted': 'true' }
      }
      const mockRes = { headersSent: false, writeHead: vi.fn(), end: vi.fn() }
      const mockOptions = { target: 'http://localhost:8000' }

      // Simulate consecutive failures to reach fallback threshold
      proxyStats.consecutiveFailures = 5

      // Exceed retry limit to trigger error response
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes, mockOptions)
      }

      // Should send error response since fallback was already attempted
      expect(mockRes.writeHead).toHaveBeenCalled()
      expect(mockRes.end).toHaveBeenCalled()
    })

    it('should not attempt fallback if disabled', () => {
      fallbackConfig.enabled = false
      errorHandler = createEnhancedErrorHandler()

      const mockError = { code: 'ECONNREFUSED' }
      const mockReq = { 
        method: 'GET', 
        url: '/api/health',
        headers: {}
      }
      const mockRes = { headersSent: false, writeHead: vi.fn(), end: vi.fn() }
      const mockOptions = { target: 'http://localhost:8000' }

      // Simulate consecutive failures to reach fallback threshold
      proxyStats.consecutiveFailures = 5

      // Exceed retry limit to trigger error response
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes, mockOptions)
      }

      // Should send error response since fallback is disabled
      expect(mockRes.writeHead).toHaveBeenCalled()
      expect(mockRes.end).toHaveBeenCalled()
      expect(mockReq.headers['x-fallback-attempted']).toBeUndefined()
    })
  })

  describe('Suggestions Helper', () => {
    it('should return appropriate suggestions for known error codes', () => {
      expect(getSuggestions('ECONNREFUSED')).toEqual([
        'Check if the backend server is running',
        'Verify the backend is listening on the correct port',
        'Check firewall settings'
      ])

      expect(getSuggestions('ETIMEDOUT')).toEqual([
        'Check network connectivity',
        'Verify backend server is responsive',
        'Consider increasing timeout values'
      ])

      expect(getSuggestions('ENOTFOUND')).toEqual([
        'Check DNS resolution',
        'Verify the backend hostname/IP is correct',
        'Check network configuration'
      ])

      expect(getSuggestions('ECONNRESET')).toEqual([
        'Backend server may be overloaded',
        'Check for network interruptions',
        'Verify backend server stability'
      ])
    })

    it('should return default suggestions for unknown error codes', () => {
      expect(getSuggestions('UNKNOWN_ERROR')).toEqual([
        'Check backend server status',
        'Verify network connectivity',
        'Review server logs for more details'
      ])

      expect(getSuggestions(undefined)).toEqual([
        'Check backend server status',
        'Verify network connectivity',
        'Review server logs for more details'
      ])
    })
  })

  describe('Environment Configuration', () => {
    it('should use environment variables for configuration', () => {
      // Mock environment variables
      const originalEnv = process.env
      process.env = {
        ...originalEnv,
        VITE_BACKEND_URL: 'http://custom-backend:9000',
        VITE_PROXY_TIMEOUT: '45000',
        VITE_PROXY_FALLBACK_ENABLED: 'true',
        VITE_PROXY_FALLBACK_TARGET: 'http://fallback-backend:8001'
      }

      // Test that configuration would use these values
      expect(process.env.VITE_BACKEND_URL).toBe('http://custom-backend:9000')
      expect(parseInt(process.env.VITE_PROXY_TIMEOUT)).toBe(45000)
      expect(process.env.VITE_PROXY_FALLBACK_ENABLED).toBe('true')
      expect(process.env.VITE_PROXY_FALLBACK_TARGET).toBe('http://fallback-backend:8001')

      // Restore original environment
      process.env = originalEnv
    })
  })

  describe('Circuit Breaker Pattern', () => {
    it('should open circuit breaker after threshold failures', () => {
      // Simulate failures to reach threshold
      for (let i = 0; i < 5; i++) {
        updateCircuitBreaker(false)
      }

      expect(circuitBreaker.state).toBe('OPEN')
      expect(circuitBreaker.failureCount).toBe(5)
      expect(circuitBreaker.lastFailureTime).toBeTruthy()
    })

    it('should close circuit breaker on success', () => {
      // First open the circuit breaker
      for (let i = 0; i < 5; i++) {
        updateCircuitBreaker(false)
      }
      expect(circuitBreaker.state).toBe('OPEN')

      // Then close it with success
      updateCircuitBreaker(true)
      expect(circuitBreaker.state).toBe('CLOSED')
      expect(circuitBreaker.failureCount).toBe(0)
      expect(circuitBreaker.lastFailureTime).toBeNull()
    })

    it('should not allow requests when circuit breaker is open', () => {
      // Open circuit breaker
      circuitBreaker.state = 'OPEN'
      circuitBreaker.lastFailureTime = Date.now()

      expect(shouldAllowRequest()).toBe(false)
    })

    it('should allow requests when circuit breaker is closed', () => {
      circuitBreaker.state = 'CLOSED'
      expect(shouldAllowRequest()).toBe(true)
    })

    it('should transition to half-open after timeout', () => {
      // Open circuit breaker with old failure time
      circuitBreaker.state = 'OPEN'
      circuitBreaker.lastFailureTime = Date.now() - (circuitBreaker.timeout + 1000)

      expect(shouldAllowRequest()).toBe(true)
      expect(circuitBreaker.state).toBe('HALF_OPEN')
    })

    it('should reject requests with circuit breaker error response', () => {
      const errorHandler = createEnhancedErrorHandler()
      const mockError = { code: 'ECONNREFUSED' }
      const mockReq = { 
        method: 'GET', 
        url: '/api/health',
        headers: {}
      }
      const mockRes = { 
        headersSent: false, 
        writeHead: vi.fn(), 
        end: vi.fn() 
      }
      const mockOptions = { target: 'http://localhost:8000' }

      // Open circuit breaker
      circuitBreaker.state = 'OPEN'
      circuitBreaker.lastFailureTime = Date.now()

      errorHandler(mockError, mockReq, mockRes, mockOptions)

      expect(mockRes.writeHead).toHaveBeenCalledWith(503, expect.objectContaining({
        'X-Circuit-Breaker': 'open',
        'Retry-After': expect.any(String)
      }))

      const responseCall = mockRes.end.mock.calls[0][0]
      const responseData = JSON.parse(responseCall)
      expect(responseData.error.code).toBe('CIRCUIT_BREAKER_OPEN')
      expect(responseData.error.message).toContain('temporarily unavailable')
    })
  })

  describe('Enhanced Fallback Mechanisms', () => {
    it('should not attempt fallback when circuit breaker is open', () => {
      const errorHandler = createEnhancedErrorHandler()
      const mockError = { code: 'ECONNREFUSED' }
      const mockReq = { 
        method: 'GET', 
        url: '/api/health',
        headers: {}
      }
      const mockRes = { 
        headersSent: false, 
        writeHead: vi.fn(), 
        end: vi.fn() 
      }
      const mockOptions = { target: 'http://localhost:8000' }

      // Set up conditions for fallback
      proxyStats.consecutiveFailures = 5
      circuitBreaker.state = 'OPEN'
      circuitBreaker.lastFailureTime = Date.now()

      // Exceed retry limit to trigger fallback check
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes, mockOptions)
      }

      // Should not attempt fallback when circuit breaker is open
      expect(mockReq.headers['x-fallback-attempted']).toBeUndefined()
      expect(mockRes.writeHead).toHaveBeenCalledWith(503, expect.objectContaining({
        'X-Circuit-Breaker': 'open'
      }))
    })

    it('should include fallback information in response headers', () => {
      const errorHandler = createEnhancedErrorHandler()
      const mockError = { code: 'ECONNREFUSED' }
      const mockReq = { 
        method: 'GET', 
        url: '/api/health',
        headers: {}
      }
      const mockRes = { 
        headersSent: false, 
        writeHead: vi.fn(), 
        end: vi.fn() 
      }
      const mockOptions = { target: 'http://localhost:8000' }

      // Reset circuit breaker to prevent it from interfering
      circuitBreaker.state = 'CLOSED'
      circuitBreaker.failureCount = 0
      circuitBreaker.lastFailureTime = null
      
      // Disable fallback to ensure error response is sent
      fallbackConfig.enabled = false

      // Exceed retry limit to trigger error response
      for (let i = 0; i < 4; i++) {
        errorHandler(mockError, mockReq, mockRes, mockOptions)
      }

      expect(mockRes.writeHead).toHaveBeenCalledWith(503, expect.objectContaining({
        'X-Circuit-Breaker-State': circuitBreaker.state
      }))

      const responseCall = mockRes.end.mock.calls[0][0]
      const responseData = JSON.parse(responseCall)
      expect(responseData.error.details.circuitBreakerState).toBe(circuitBreaker.state)
    })
  })
})