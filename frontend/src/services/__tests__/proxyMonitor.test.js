import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import proxyMonitor from '../proxyMonitor'

// Mock fetch
global.fetch = vi.fn()

describe('ProxyMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    // Reset proxy monitor state
    proxyMonitor.stopMonitoring()
    proxyMonitor.status = {
      isHealthy: true,
      lastCheck: null,
      consecutiveFailures: 0,
      responseTime: null,
      error: null
    }
    
    // Clear global proxy stats
    globalThis.proxyStats = undefined
    globalThis.proxyLogs = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
    proxyMonitor.stopMonitoring()
  })

  describe('Health Monitoring', () => {
    it('should start monitoring and perform initial health check', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      })

      proxyMonitor.startMonitoring()
      
      expect(proxyMonitor.isMonitoring).toBe(true)
      
      // Wait for initial health check
      await vi.runOnlyPendingTimersAsync()
      
      expect(fetch).toHaveBeenCalledWith('/api/health', expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache',
          'X-Health-Check': 'true'
        })
      }))
    })

    it('should stop monitoring and clear intervals', () => {
      proxyMonitor.startMonitoring()
      expect(proxyMonitor.isMonitoring).toBe(true)
      
      proxyMonitor.stopMonitoring()
      expect(proxyMonitor.isMonitoring).toBe(false)
    })

    it('should update status on successful health check', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      })

      await proxyMonitor.performHealthCheck()
      
      const status = proxyMonitor.getStatus()
      expect(status.isHealthy).toBe(true)
      expect(status.consecutiveFailures).toBe(0)
      expect(status.responseTime).toBeGreaterThanOrEqual(0)
      expect(status.lastCheck).toBeTruthy()
      expect(status.error).toBeNull()
    })

    it('should update status on failed health check', async () => {
      const error = new Error('Network error')
      fetch.mockRejectedValueOnce(error)

      await proxyMonitor.performHealthCheck()
      
      const status = proxyMonitor.getStatus()
      expect(status.isHealthy).toBe(true) // Still healthy on first failure
      expect(status.consecutiveFailures).toBe(1)
      expect(status.error).toEqual({
        message: 'Network error',
        name: 'Error',
        timestamp: expect.any(String)
      })
    })

    it('should mark as unhealthy after max consecutive failures', async () => {
      const error = new Error('Network error')
      
      // Fail 3 times (max consecutive failures)
      for (let i = 0; i < 3; i++) {
        fetch.mockRejectedValueOnce(error)
        await proxyMonitor.performHealthCheck()
      }
      
      const status = proxyMonitor.getStatus()
      expect(status.isHealthy).toBe(false)
      expect(status.consecutiveFailures).toBe(3)
    })

    it('should handle timeout in health check', async () => {
      // Mock a request that gets aborted
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      fetch.mockRejectedValueOnce(error)

      await proxyMonitor.performHealthCheck()
      
      const status = proxyMonitor.getStatus()
      expect(status.consecutiveFailures).toBe(1)
    })
  })

  describe('Status Listeners', () => {
    it('should notify listeners when health status changes', async () => {
      const listener = vi.fn()
      const removeListener = proxyMonitor.addListener(listener)
      
      // Start with healthy status
      fetch.mockResolvedValueOnce({ ok: true, status: 200 })
      await proxyMonitor.performHealthCheck()
      
      // Should not notify on same status
      expect(listener).not.toHaveBeenCalled()
      
      // Change to unhealthy
      const error = new Error('Network error')
      for (let i = 0; i < 3; i++) {
        fetch.mockRejectedValueOnce(error)
        await proxyMonitor.performHealthCheck()
      }
      
      // Should notify on status change
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        isHealthy: false,
        consecutiveFailures: 3
      }))
      
      removeListener()
    })

    it('should handle errors in listeners gracefully', async () => {
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error')
      })
      
      proxyMonitor.addListener(faultyListener)
      
      // Should not throw when listener fails
      expect(() => {
        proxyMonitor.notifyListeners({ isHealthy: false })
      }).not.toThrow()
    })
  })

  describe('Proxy Statistics', () => {
    it('should return default stats when none exist', () => {
      const stats = proxyMonitor.getProxyStats()
      
      expect(stats).toEqual({
        requests: 0,
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

    it('should return global proxy stats when available', () => {
      const mockStats = {
        requests: 10,
        errors: 2,
        timeouts: 1,
        retries: 3,
        lastError: '2023-01-01T00:00:00Z',
        lastSuccess: '2023-01-01T00:01:00Z',
        responseTimeHistory: [100, 200, 150],
        consecutiveFailures: 1,
        isHealthy: true
      }
      
      globalThis.proxyStats = mockStats
      
      const stats = proxyMonitor.getProxyStats()
      expect(stats).toEqual(mockStats)
    })

    it('should return limited proxy logs', () => {
      const mockLogs = Array.from({ length: 100 }, (_, i) => ({
        timestamp: `2023-01-01T00:${i.toString().padStart(2, '0')}:00Z`,
        level: 'info',
        message: `Log entry ${i}`
      }))
      
      globalThis.proxyLogs = mockLogs
      
      const logs = proxyMonitor.getProxyLogs(20)
      expect(logs).toHaveLength(20)
      expect(logs[0].message).toBe('Log entry 80') // Last 20 entries
    })

    it('should reset proxy statistics', () => {
      globalThis.proxyStats = { requests: 10, errors: 2 }
      globalThis.proxyLogs = [{ message: 'test' }]
      
      proxyMonitor.resetStats()
      
      expect(globalThis.proxyStats).toEqual({
        requests: 0,
        errors: 0,
        timeouts: 0,
        retries: 0,
        lastError: null,
        lastSuccess: null,
        responseTimeHistory: [],
        consecutiveFailures: 0,
        isHealthy: true
      })
      expect(globalThis.proxyLogs).toEqual([])
    })
  })

  describe('Diagnostics', () => {
    it('should return comprehensive diagnostic information', () => {
      // Set up mock data
      globalThis.proxyStats = {
        requests: 10,
        errors: 2,
        timeouts: 1,
        retries: 3,
        lastError: '2023-01-01T00:00:00Z',
        lastSuccess: '2023-01-01T00:01:00Z',
        responseTimeHistory: [100, 200, 150, 300],
        consecutiveFailures: 1,
        isHealthy: true
      }
      
      globalThis.proxyLogs = [
        { timestamp: '2023-01-01T00:00:00Z', level: 'error', message: 'Test error' }
      ]

      globalThis.circuitBreakerStatus = {
        state: 'CLOSED',
        failureCount: 2,
        lastFailureTime: Date.now() - 30000,
        timeout: 60000,
        threshold: 5
      }
      
      const diagnostics = proxyMonitor.getDiagnostics()
      
      expect(diagnostics).toEqual({
        status: expect.objectContaining({
          isHealthy: expect.any(Boolean),
          consecutiveFailures: expect.any(Number)
        }),
        statistics: expect.objectContaining({
          requests: 10,
          errors: 2,
          timeouts: 1,
          retries: 3,
          averageResponseTime: 187.5, // (100+200+150+300)/4
          errorRate: 20, // (2/10)*100
          retryRate: 30, // (3/10)*100
          successRate: 80 // ((10-2)/10)*100
        }),
        circuitBreaker: expect.objectContaining({
          state: 'CLOSED',
          failureCount: 2,
          isOpen: false,
          isHalfOpen: false,
          timeUntilRetry: 0
        }),
        recentLogs: expect.arrayContaining([
          expect.objectContaining({
            level: 'error',
            message: 'Test error'
          })
        ]),
        configuration: expect.objectContaining({
          healthCheckInterval: 30000,
          maxConsecutiveFailures: 3,
          healthCheckTimeout: 5000
        })
      })
    })
  })

  describe('Endpoint Testing', () => {
    it('should test endpoint connectivity successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: vi.fn().mockResolvedValue({ status: 'healthy' })
      }
      
      fetch.mockResolvedValueOnce(mockResponse)
      
      const result = await proxyMonitor.testEndpoint('/api/health')
      
      expect(result).toEqual({
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: expect.any(Number),
        headers: { 'content-type': 'application/json' },
        data: { status: 'healthy' },
        timestamp: expect.any(String)
      })
    })

    it('should handle endpoint test failures', async () => {
      const error = new Error('Connection failed')
      error.code = 'ECONNREFUSED'
      
      fetch.mockRejectedValueOnce(error)
      
      const result = await proxyMonitor.testEndpoint('/api/health')
      
      expect(result).toEqual({
        success: false,
        error: {
          message: 'Connection failed',
          name: 'Error',
          code: 'ECONNREFUSED'
        },
        responseTime: expect.any(Number),
        timestamp: expect.any(String)
      })
    })

    it('should handle endpoint test timeout', async () => {
      // Mock a request that gets aborted
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      fetch.mockRejectedValueOnce(error)
      
      const result = await proxyMonitor.testEndpoint('/api/health', { timeout: 1000 })
      
      expect(result.success).toBe(false)
      expect(result.error.name).toBe('AbortError')
    })
  })

  describe('Force Health Check', () => {
    it('should perform immediate health check', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      })

      await proxyMonitor.forceHealthCheck()
      
      expect(fetch).toHaveBeenCalledWith('/api/health', expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-Health-Check': 'true'
        })
      }))
      
      const status = proxyMonitor.getStatus()
      expect(status.isHealthy).toBe(true)
      expect(status.lastCheck).toBeTruthy()
    })
  })
})