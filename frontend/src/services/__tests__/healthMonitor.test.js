import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { healthMonitor, CONNECTION_STATUS } from '../healthMonitor'
import { requestManager } from '../requestManager'

// Mock the request manager
vi.mock('../requestManager', () => ({
  requestManager: {
    makeRequest: vi.fn()
  }
}))

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
})

describe('HealthMonitor', () => {
  beforeEach(() => {
    // Reset health monitor state
    healthMonitor.stopMonitoring()
    healthMonitor.status = CONNECTION_STATUS.UNKNOWN
    healthMonitor.lastHealthCheck = null
    healthMonitor.responseTime = null
    healthMonitor.errorCount = 0
    healthMonitor.consecutiveErrors = 0
    healthMonitor.statusChangeCallbacks = []
    healthMonitor.healthHistory = []
    
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  afterEach(() => {
    healthMonitor.stopMonitoring()
    vi.clearAllTimers()
  })

  describe('startMonitoring', () => {
    it('should start monitoring and perform initial health check', async () => {
      const mockResponse = { data: { status: 'ok' }, status: 200 }
      requestManager.makeRequest.mockResolvedValue(mockResponse)

      healthMonitor.startMonitoring()

      expect(healthMonitor.isMonitoring).toBe(true)
      
      // Wait for initial health check
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(requestManager.makeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/health',
          method: 'GET'
        }),
        expect.objectContaining({
          timeout: 5000,
          deduplicate: false
        })
      )
    })

    it('should not start monitoring if already monitoring', () => {
      healthMonitor.isMonitoring = true
      const spy = vi.spyOn(healthMonitor, 'forceHealthCheck')
      
      healthMonitor.startMonitoring()
      
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('stopMonitoring', () => {
    it('should stop monitoring and clear intervals', () => {
      healthMonitor.startMonitoring()
      expect(healthMonitor.isMonitoring).toBe(true)
      
      healthMonitor.stopMonitoring()
      
      expect(healthMonitor.isMonitoring).toBe(false)
      expect(healthMonitor.healthCheckInterval).toBe(null)
    })
  })

  describe('forceHealthCheck', () => {
    it('should perform successful health check', async () => {
      const mockResponse = { data: { status: 'ok' }, status: 200 }
      requestManager.makeRequest.mockResolvedValue(mockResponse)

      const result = await healthMonitor.forceHealthCheck()

      expect(result).toBe(true)
      expect(healthMonitor.status).toBe(CONNECTION_STATUS.CONNECTED)
      expect(healthMonitor.lastHealthCheck).toBeInstanceOf(Date)
      expect(healthMonitor.responseTime).toBeGreaterThan(0)
      expect(healthMonitor.consecutiveErrors).toBe(0)
    })

    it('should handle failed health check', async () => {
      const mockError = new Error('Network error')
      requestManager.makeRequest.mockRejectedValue(mockError)

      const result = await healthMonitor.forceHealthCheck()

      expect(result).toBe(false)
      expect(healthMonitor.status).toBe(CONNECTION_STATUS.DISCONNECTED)
      expect(healthMonitor.errorCount).toBe(1)
      expect(healthMonitor.consecutiveErrors).toBe(1)
    })

    it('should detect slow connection', async () => {
      const mockResponse = { data: { status: 'ok' }, status: 200 }
      
      // Mock a slow response by delaying the promise
      requestManager.makeRequest.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockResponse), 6000))
      )

      vi.useFakeTimers()
      const healthCheckPromise = healthMonitor.forceHealthCheck()
      
      // Fast-forward time to simulate slow response
      vi.advanceTimersByTime(6000)
      
      const result = await healthCheckPromise
      
      expect(result).toBe(true)
      expect(healthMonitor.status).toBe(CONNECTION_STATUS.SLOW)
      
      vi.useRealTimers()
    })

    it('should return false when offline', async () => {
      // Mock navigator.onLine to false
      Object.defineProperty(navigator, 'onLine', { value: false })

      const result = await healthMonitor.forceHealthCheck()

      expect(result).toBe(false)
      expect(healthMonitor.status).toBe(CONNECTION_STATUS.DISCONNECTED)
      expect(requestManager.makeRequest).not.toHaveBeenCalled()
    })
  })

  describe('onStatusChange', () => {
    it('should register and call status change callbacks', async () => {
      const callback = vi.fn()
      const unsubscribe = healthMonitor.onStatusChange(callback)

      // Trigger status change
      const mockResponse = { data: { status: 'ok' }, status: 200 }
      requestManager.makeRequest.mockResolvedValue(mockResponse)
      
      await healthMonitor.forceHealthCheck()

      expect(callback).toHaveBeenCalledWith(
        CONNECTION_STATUS.CONNECTED,
        CONNECTION_STATUS.UNKNOWN
      )

      // Test unsubscribe
      unsubscribe()
      callback.mockClear()
      
      // Trigger another status change
      const mockError = new Error('Network error')
      requestManager.makeRequest.mockRejectedValue(mockError)
      
      await healthMonitor.forceHealthCheck()
      
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('getConnectionStatus', () => {
    it('should return current connection status', () => {
      healthMonitor.status = CONNECTION_STATUS.CONNECTED
      healthMonitor.lastHealthCheck = new Date()
      healthMonitor.responseTime = 500
      healthMonitor.errorCount = 2
      healthMonitor.consecutiveErrors = 0

      const status = healthMonitor.getConnectionStatus()

      expect(status).toMatchObject({
        status: CONNECTION_STATUS.CONNECTED,
        isOnline: true,
        lastHealthCheck: expect.any(Date),
        responseTime: 500,
        errorCount: 2,
        consecutiveErrors: 0
      })
    })
  })

  describe('getHealthStats', () => {
    it('should return health statistics', () => {
      // Add some mock history
      healthMonitor.healthHistory = [
        { success: true, responseTime: 100 },
        { success: true, responseTime: 200 },
        { success: false, responseTime: 5000 },
        { success: true, responseTime: 150 }
      ]
      healthMonitor.status = CONNECTION_STATUS.CONNECTED
      healthMonitor.consecutiveErrors = 0

      const stats = healthMonitor.getHealthStats()

      expect(stats).toMatchObject({
        total: 4,
        successful: 3,
        failed: 1,
        successRate: 75,
        averageResponseTime: 150, // (100 + 200 + 150) / 3
        currentStatus: CONNECTION_STATUS.CONNECTED,
        consecutiveErrors: 0
      })
    })

    it('should handle empty history', () => {
      const stats = healthMonitor.getHealthStats()

      expect(stats).toMatchObject({
        total: 0,
        successful: 0,
        failed: 0,
        successRate: 0,
        averageResponseTime: null
      })
    })
  })

  describe('browser events', () => {
    it('should handle online event', () => {
      const spy = vi.spyOn(healthMonitor, 'forceHealthCheck')
      healthMonitor.isMonitoring = true

      // Simulate browser online event
      healthMonitor.handleOnline()

      // Should schedule a health check
      setTimeout(() => {
        expect(spy).toHaveBeenCalled()
      }, 150)
    })

    it('should handle offline event', () => {
      healthMonitor.status = CONNECTION_STATUS.CONNECTED

      // Simulate browser offline event
      healthMonitor.handleOffline()

      expect(healthMonitor.status).toBe(CONNECTION_STATUS.DISCONNECTED)
    })
  })
})