import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import proxyMonitor from '../services/proxyMonitor'

// Mock fetch
global.fetch = vi.fn()

describe('Enhanced Proxy Monitoring', () => {
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
    globalThis.circuitBreakerStatus = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
    proxyMonitor.stopMonitoring()
  })

  describe('Performance Metrics', () => {
    it('should calculate comprehensive performance metrics', () => {
      // Set up mock data
      globalThis.proxyStats = {
        requests: 100,
        errors: 10,
        timeouts: 5,
        retries: 15,
        lastError: '2023-01-01T00:00:00Z',
        lastSuccess: '2023-01-01T00:01:00Z',
        responseTimeHistory: [100, 200, 150, 300, 250, 180, 220, 160, 190, 210],
        consecutiveFailures: 2,
        isHealthy: true
      }
      
      const metrics = proxyMonitor.getPerformanceMetrics()
      
      expect(metrics).toEqual(expect.objectContaining({
        totalRequests: 100,
        totalErrors: 10,
        totalTimeouts: 5,
        totalRetries: 15,
        errorRate: 10, // (10/100)*100
        successRate: 90, // ((100-10)/100)*100
        retryRate: 15, // (15/100)*100
        averageResponseTime: 196, // Average of response times
        medianResponseTime: 195, // Median of response times
        p95ResponseTime: expect.any(Number),
        healthScore: expect.any(Number)
      }))
      
      expect(metrics.healthScore).toBeGreaterThan(0)
      expect(metrics.healthScore).toBeLessThanOrEqual(100)
    })

    it('should handle empty response time history', () => {
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
      
      const metrics = proxyMonitor.getPerformanceMetrics()
      
      expect(metrics.averageResponseTime).toBeNull()
      expect(metrics.medianResponseTime).toBeNull()
      expect(metrics.p95ResponseTime).toBeNull()
      expect(metrics.healthScore).toBe(100) // Perfect score with no requests
    })

    it('should calculate median correctly for odd and even arrays', () => {
      // Test odd number of values
      expect(proxyMonitor.calculateMedian([1, 2, 3, 4, 5])).toBe(3)
      
      // Test even number of values
      expect(proxyMonitor.calculateMedian([1, 2, 3, 4])).toBe(2.5)
      
      // Test empty array
      expect(proxyMonitor.calculateMedian([])).toBeNull()
      
      // Test single value
      expect(proxyMonitor.calculateMedian([42])).toBe(42)
    })

    it('should calculate percentiles correctly', () => {
      const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
      
      expect(proxyMonitor.calculatePercentile(values, 50)).toBe(500) // Median
      expect(proxyMonitor.calculatePercentile(values, 95)).toBe(1000) // 95th percentile
      expect(proxyMonitor.calculatePercentile(values, 0)).toBe(100) // Min
      
      // Test empty array
      expect(proxyMonitor.calculatePercentile([], 95)).toBeNull()
    })

    it('should calculate health score based on various factors', () => {
      // Perfect health
      let stats = {
        requests: 100,
        errors: 0,
        timeouts: 0,
        consecutiveFailures: 0,
        lastSuccess: new Date().toISOString(),
        lastError: null
      }
      expect(proxyMonitor.calculateHealthScore(stats)).toBe(100)
      
      // High error rate
      stats = {
        requests: 100,
        errors: 50, // 50% error rate
        timeouts: 0,
        consecutiveFailures: 0,
        lastSuccess: null,
        lastError: null
      }
      expect(proxyMonitor.calculateHealthScore(stats)).toBe(50)
      
      // High timeout rate
      stats = {
        requests: 100,
        errors: 0,
        timeouts: 25, // 25% timeout rate, weighted 2x
        consecutiveFailures: 0,
        lastSuccess: null,
        lastError: null
      }
      expect(proxyMonitor.calculateHealthScore(stats)).toBe(50) // 100 - (25*2)
      
      // Consecutive failures penalty
      stats = {
        requests: 100,
        errors: 0,
        timeouts: 0,
        consecutiveFailures: 5, // 5 * 10 = 50 penalty
        lastSuccess: null,
        lastError: null
      }
      expect(proxyMonitor.calculateHealthScore(stats)).toBe(50)
    })
  })

  describe('Connection Quality Assessment', () => {
    it('should assess excellent connection quality', () => {
      globalThis.proxyStats = {
        requests: 100,
        errors: 2, // 2% error rate
        timeouts: 1,
        retries: 3,
        responseTimeHistory: [100, 150, 120, 180, 160], // Fast responses
        consecutiveFailures: 0,
        isHealthy: true
      }
      
      globalThis.circuitBreakerStatus = {
        state: 'CLOSED',
        failureCount: 0
      }
      
      proxyMonitor.status.consecutiveFailures = 0
      
      const quality = proxyMonitor.getConnectionQuality()
      
      expect(quality.quality).toBe('excellent')
      expect(quality.score).toBeGreaterThan(90)
      expect(quality.issues).toHaveLength(0)
      expect(quality.recommendations).toHaveLength(0)
    })

    it('should assess poor connection quality with circuit breaker open', () => {
      globalThis.circuitBreakerStatus = {
        state: 'OPEN',
        failureCount: 5
      }
      
      const quality = proxyMonitor.getConnectionQuality()
      
      expect(quality.quality).toBe('poor')
      expect(quality.issues).toContain('Circuit breaker is open')
      expect(quality.recommendations).toContain('Wait for automatic recovery')
    })

    it('should assess poor connection quality with high error rate', () => {
      globalThis.proxyStats = {
        requests: 100,
        errors: 25, // 25% error rate
        timeouts: 5,
        retries: 30,
        responseTimeHistory: [100, 150, 120],
        consecutiveFailures: 3,
        isHealthy: false
      }
      
      globalThis.circuitBreakerStatus = {
        state: 'CLOSED',
        failureCount: 0
      }
      
      const quality = proxyMonitor.getConnectionQuality()
      
      expect(quality.quality).toBe('poor')
      expect(quality.issues.some(issue => issue.includes('High error rate'))).toBe(true)
      expect(quality.recommendations).toContain('Check backend server status')
    })

    it('should assess poor connection quality with slow response times', () => {
      globalThis.proxyStats = {
        requests: 100,
        errors: 5,
        timeouts: 2,
        retries: 8,
        responseTimeHistory: [6000, 7000, 8000, 5500, 6500], // Slow responses
        consecutiveFailures: 1,
        isHealthy: true
      }
      
      globalThis.circuitBreakerStatus = {
        state: 'CLOSED',
        failureCount: 0
      }
      
      const quality = proxyMonitor.getConnectionQuality()
      
      expect(quality.quality).toBe('poor')
      expect(quality.issues.some(issue => issue.includes('Slow response times'))).toBe(true)
      expect(quality.recommendations).toContain('Check backend performance')
    })

    it('should assess fair connection quality with consecutive failures', () => {
      globalThis.proxyStats = {
        requests: 100,
        errors: 8, // 8% error rate
        timeouts: 2,
        retries: 10,
        responseTimeHistory: [200, 250, 180, 220, 190], // Good response times
        consecutiveFailures: 2,
        isHealthy: true
      }
      
      globalThis.circuitBreakerStatus = {
        state: 'CLOSED',
        failureCount: 0
      }
      
      proxyMonitor.status.consecutiveFailures = 2
      
      const quality = proxyMonitor.getConnectionQuality()
      
      expect(quality.quality).toBe('fair')
      expect(quality.issues.some(issue => issue.includes('consecutive failures'))).toBe(true)
      expect(quality.recommendations).toContain('Check network stability')
    })

    it('should provide appropriate recommendations for different issues', () => {
      const testCases = [
        {
          quality: 'poor',
          issues: ['High error rate: 25.0%'],
          expectedRecommendations: ['Review backend logs for errors', 'Check server resource usage']
        },
        {
          quality: 'poor',
          issues: ['Slow response times: 6000ms avg'],
          expectedRecommendations: ['Check backend performance', 'Consider increasing timeout values']
        },
        {
          quality: 'fair',
          issues: ['2 consecutive failures'],
          expectedRecommendations: ['Check network stability', 'Verify backend service health']
        }
      ]
      
      testCases.forEach(({ quality, issues, expectedRecommendations }) => {
        const recommendations = proxyMonitor.getRecommendations(quality, issues)
        
        expectedRecommendations.forEach(expectedRec => {
          expect(recommendations).toContain(expectedRec)
        })
      })
    })
  })

  describe('Enhanced Diagnostics', () => {
    it('should include performance metrics in diagnostics', () => {
      globalThis.proxyStats = {
        requests: 50,
        errors: 5,
        timeouts: 2,
        retries: 8,
        responseTimeHistory: [100, 200, 150, 300, 250],
        consecutiveFailures: 1,
        isHealthy: true
      }
      
      const diagnostics = proxyMonitor.getDiagnostics()
      
      expect(diagnostics.statistics).toEqual(expect.objectContaining({
        requests: 50,
        errors: 5,
        errorRate: 10,
        successRate: 90,
        retryRate: 16,
        averageResponseTime: 200
      }))
    })

    it('should track monitoring uptime', () => {
      const startTime = Date.now()
      vi.setSystemTime(startTime)
      
      proxyMonitor.startMonitoring()
      
      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000)
      
      const metrics = proxyMonitor.getPerformanceMetrics()
      expect(metrics.uptime).toBe(5 * 60 * 1000) // 5 minutes in milliseconds
      
      proxyMonitor.stopMonitoring()
      
      const metricsAfterStop = proxyMonitor.getPerformanceMetrics()
      expect(metricsAfterStop.uptime).toBe(0) // Should be 0 when not monitoring
    })
  })

  describe('Integration with Existing Features', () => {
    it('should work with existing proxy statistics', () => {
      // Set up existing proxy stats format
      globalThis.proxyStats = {
        requests: 25,
        errors: 3,
        timeouts: 1,
        retries: 5,
        lastError: '2023-01-01T00:00:00Z',
        lastSuccess: '2023-01-01T00:01:00Z',
        responseTimeHistory: [150, 200, 180, 220, 190],
        consecutiveFailures: 0,
        isHealthy: true
      }
      
      const metrics = proxyMonitor.getPerformanceMetrics()
      const quality = proxyMonitor.getConnectionQuality()
      
      expect(metrics.totalRequests).toBe(25)
      expect(metrics.errorRate).toBe(12) // (3/25)*100
      expect(quality.quality).toBe('good') // Should be good with 12% error rate
    })

    it('should handle missing global proxy stats gracefully', () => {
      // Ensure no global stats exist
      globalThis.proxyStats = undefined
      globalThis.circuitBreakerStatus = undefined
      
      const metrics = proxyMonitor.getPerformanceMetrics()
      const quality = proxyMonitor.getConnectionQuality()
      
      expect(metrics.totalRequests).toBe(0)
      expect(metrics.errorRate).toBe(0)
      expect(metrics.healthScore).toBe(100)
      expect(quality.quality).toBe('excellent')
    })
  })
})