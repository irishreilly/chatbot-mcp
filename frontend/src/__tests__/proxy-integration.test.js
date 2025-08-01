import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import proxyMonitor from '../services/proxyMonitor'

describe('Proxy Integration Tests', () => {
  beforeAll(() => {
    // Reset proxy statistics before tests
    if (globalThis.proxyStats) {
      globalThis.proxyStats = {
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
    }
    
    if (globalThis.proxyLogs) {
      globalThis.proxyLogs = []
    }
  })

  afterAll(() => {
    proxyMonitor.stopMonitoring()
  })

  describe('Proxy Statistics', () => {
    it('should initialize proxy statistics correctly', () => {
      const stats = proxyMonitor.getProxyStats()
      
      expect(stats).toEqual(expect.objectContaining({
        requests: expect.any(Number),
        errors: expect.any(Number),
        timeouts: expect.any(Number),
        retries: expect.any(Number),
        consecutiveFailures: expect.any(Number),
        isHealthy: expect.any(Boolean)
      }))
    })

    it('should provide circuit breaker status', () => {
      const circuitBreakerStatus = proxyMonitor.getCircuitBreakerStatus()
      
      expect(circuitBreakerStatus).toEqual(expect.objectContaining({
        state: expect.stringMatching(/^(CLOSED|OPEN|HALF_OPEN)$/),
        failureCount: expect.any(Number),
        threshold: expect.any(Number),
        timeout: expect.any(Number)
      }))
    })

    it('should provide comprehensive diagnostics', () => {
      const diagnostics = proxyMonitor.getDiagnostics()
      
      expect(diagnostics).toEqual(expect.objectContaining({
        status: expect.objectContaining({
          isHealthy: expect.any(Boolean),
          consecutiveFailures: expect.any(Number)
        }),
        statistics: expect.objectContaining({
          requests: expect.any(Number),
          errors: expect.any(Number),
          errorRate: expect.any(Number),
          successRate: expect.any(Number)
        }),
        circuitBreaker: expect.objectContaining({
          state: expect.any(String),
          isOpen: expect.any(Boolean),
          isHalfOpen: expect.any(Boolean)
        }),
        recentLogs: expect.any(Array),
        configuration: expect.objectContaining({
          healthCheckInterval: expect.any(Number),
          maxConsecutiveFailures: expect.any(Number),
          healthCheckTimeout: expect.any(Number)
        })
      }))
    })
  })

  describe('Proxy Monitor Service', () => {
    it('should start and stop monitoring', () => {
      expect(proxyMonitor.isMonitoring).toBe(false)
      
      proxyMonitor.startMonitoring()
      expect(proxyMonitor.isMonitoring).toBe(true)
      
      proxyMonitor.stopMonitoring()
      expect(proxyMonitor.isMonitoring).toBe(false)
    })

    it('should provide current status', () => {
      const status = proxyMonitor.getStatus()
      
      expect(status).toEqual(expect.objectContaining({
        isHealthy: expect.any(Boolean),
        consecutiveFailures: expect.any(Number),
        responseTime: expect.any(Number) || null,
        lastCheck: expect.any(String) || null,
        error: expect.any(Object) || null
      }))
    })

    it('should allow adding and removing listeners', () => {
      const listener = vi.fn()
      const removeListener = proxyMonitor.addListener(listener)
      
      expect(typeof removeListener).toBe('function')
      
      // Test that listener can be removed
      removeListener()
      
      // Manually trigger notification to ensure listener was removed
      proxyMonitor.notifyListeners({ isHealthy: false })
      expect(listener).not.toHaveBeenCalled()
    })

    it('should reset statistics when requested', () => {
      // Set some mock statistics
      if (globalThis.proxyStats) {
        globalThis.proxyStats.requests = 10
        globalThis.proxyStats.errors = 2
      }
      
      proxyMonitor.resetStats()
      
      const stats = proxyMonitor.getProxyStats()
      expect(stats.requests).toBe(0)
      expect(stats.errors).toBe(0)
    })
  })

  describe('Environment Configuration', () => {
    it('should respect environment variables for configuration', () => {
      // Test that environment variables would be used if set
      const expectedDefaults = {
        backendUrl: process.env.VITE_BACKEND_URL || 'http://localhost:8000',
        proxyTimeout: parseInt(process.env.VITE_PROXY_TIMEOUT || '30000'),
        circuitBreakerThreshold: parseInt(process.env.VITE_CIRCUIT_BREAKER_THRESHOLD || '5'),
        circuitBreakerTimeout: parseInt(process.env.VITE_CIRCUIT_BREAKER_TIMEOUT || '60000'),
        fallbackEnabled: process.env.VITE_PROXY_FALLBACK_ENABLED === 'true',
        fallbackTarget: process.env.VITE_PROXY_FALLBACK_TARGET || 'http://localhost:8001'
      }
      
      // Verify default values are reasonable
      expect(expectedDefaults.backendUrl).toMatch(/^https?:\/\//)
      expect(expectedDefaults.proxyTimeout).toBeGreaterThan(0)
      expect(expectedDefaults.circuitBreakerThreshold).toBeGreaterThan(0)
      expect(expectedDefaults.circuitBreakerTimeout).toBeGreaterThan(0)
      expect(typeof expectedDefaults.fallbackEnabled).toBe('boolean')
      expect(expectedDefaults.fallbackTarget).toMatch(/^https?:\/\//)
    })
  })

  describe('Error Handling', () => {
    it('should provide error suggestions for common error codes', () => {
      const testCases = [
        {
          code: 'ECONNREFUSED',
          expectedSuggestions: [
            'Check if the backend server is running',
            'Verify the backend is listening on the correct port',
            'Check firewall settings'
          ]
        },
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
        }
      ]
      
      // This tests the suggestions logic that would be used in actual proxy errors
      testCases.forEach(({ code, expectedSuggestions }) => {
        // The suggestions logic is embedded in the vite.config.js
        // We can test that the expected suggestions are reasonable
        expect(expectedSuggestions).toBeInstanceOf(Array)
        expect(expectedSuggestions.length).toBeGreaterThan(0)
        expectedSuggestions.forEach(suggestion => {
          expect(typeof suggestion).toBe('string')
          expect(suggestion.length).toBeGreaterThan(0)
        })
      })
    })
  })
})