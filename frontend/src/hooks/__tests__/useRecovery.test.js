/**
 * Tests for useRecovery hook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRecovery, useOfflineMode, useDegradation, useSmartRetry } from '../useRecovery'
import { recoveryService, RECOVERY_STRATEGY } from '../../services/recoveryService'
import { healthMonitor } from '../../services/healthMonitor'

// Mock dependencies
vi.mock('../../services/recoveryService')
vi.mock('../../services/healthMonitor')

describe('useRecovery', () => {
  const mockRecoveryStatus = {
    isOfflineMode: false,
    degradationLevel: 0,
    cacheSize: 0,
    circuitBreakers: [],
    connectionStatus: {
      status: 'connected',
      isOnline: true,
      lastHealthCheck: new Date(),
      responseTime: 100,
      errorCount: 0,
      consecutiveErrors: 0
    }
  }

  beforeEach(() => {
    // Mock recovery service methods
    recoveryService.getRecoveryStatus = vi.fn(() => mockRecoveryStatus)
    recoveryService.onRecovery = vi.fn(() => vi.fn()) // Return unsubscribe function
    recoveryService.onOfflineMode = vi.fn(() => vi.fn())
    recoveryService.retryLastFailedRequest = vi.fn()
    recoveryService.refreshApplication = vi.fn()
    recoveryService.clearCache = vi.fn()
    recoveryService.executeWithRecovery = vi.fn()
    recoveryService.isFeatureAvailable = vi.fn()
    recoveryService.getRetryStrategy = vi.fn()

    // Mock health monitor methods
    healthMonitor.onStatusChange = vi.fn(() => vi.fn())
    healthMonitor.forceHealthCheck = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('useRecovery hook', () => {
    it('should initialize with recovery status', () => {
      const { result } = renderHook(() => useRecovery())

      expect(result.current.recoveryStatus).toEqual(mockRecoveryStatus)
      expect(result.current.isRecovering).toBe(false)
      expect(result.current.lastRecoveryAction).toBeNull()
      expect(result.current.isOfflineMode).toBe(false)
      expect(result.current.degradationLevel).toBe(0)
    })

    it('should set up event listeners on mount', () => {
      renderHook(() => useRecovery())

      expect(recoveryService.onRecovery).toHaveBeenCalled()
      expect(recoveryService.onOfflineMode).toHaveBeenCalled()
      expect(healthMonitor.onStatusChange).toHaveBeenCalled()
    })

    it('should clean up event listeners on unmount', () => {
      const unsubscribeRecovery = vi.fn()
      const unsubscribeOffline = vi.fn()
      const unsubscribeHealth = vi.fn()

      recoveryService.onRecovery.mockReturnValue(unsubscribeRecovery)
      recoveryService.onOfflineMode.mockReturnValue(unsubscribeOffline)
      healthMonitor.onStatusChange.mockReturnValue(unsubscribeHealth)

      const { unmount } = renderHook(() => useRecovery())

      unmount()

      expect(unsubscribeRecovery).toHaveBeenCalled()
      expect(unsubscribeOffline).toHaveBeenCalled()
      expect(unsubscribeHealth).toHaveBeenCalled()
    })

    it('should handle retry last request', async () => {
      recoveryService.retryLastFailedRequest.mockResolvedValue()

      const { result } = renderHook(() => useRecovery())

      await act(async () => {
        await result.current.retryLastRequest()
      })

      expect(recoveryService.retryLastFailedRequest).toHaveBeenCalled()
    })

    it('should handle refresh application', async () => {
      recoveryService.refreshApplication.mockResolvedValue()

      const { result } = renderHook(() => useRecovery())

      await act(async () => {
        await result.current.refreshApplication()
      })

      expect(recoveryService.refreshApplication).toHaveBeenCalled()
    })

    it('should handle clear cache', async () => {
      recoveryService.clearCache.mockResolvedValue()

      const { result } = renderHook(() => useRecovery())

      await act(async () => {
        await result.current.clearCache()
      })

      expect(recoveryService.clearCache).toHaveBeenCalled()
    })

    it('should handle force health check', async () => {
      healthMonitor.forceHealthCheck.mockResolvedValue()

      const { result } = renderHook(() => useRecovery())

      await act(async () => {
        await result.current.forceHealthCheck()
      })

      expect(healthMonitor.forceHealthCheck).toHaveBeenCalled()
    })

    it('should set isRecovering state during actions', async () => {
      recoveryService.refreshApplication.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      )

      const { result } = renderHook(() => useRecovery())

      expect(result.current.isRecovering).toBe(false)

      const promise = act(async () => {
        result.current.refreshApplication()
      })

      // Should be recovering during the action
      expect(result.current.isRecovering).toBe(true)

      await promise

      // Should not be recovering after completion
      expect(result.current.isRecovering).toBe(false)
    })

    it('should execute request with recovery', async () => {
      const mockRequest = vi.fn()
      const mockOptions = { strategy: RECOVERY_STRATEGY.EXPONENTIAL_BACKOFF }
      recoveryService.executeWithRecovery.mockResolvedValue('result')

      const { result } = renderHook(() => useRecovery())

      const response = await result.current.executeWithRecovery(mockRequest, mockOptions)

      expect(recoveryService.executeWithRecovery).toHaveBeenCalledWith(mockRequest, mockOptions)
      expect(response).toBe('result')
    })

    it('should check feature availability', () => {
      recoveryService.isFeatureAvailable.mockReturnValue(true)

      const { result } = renderHook(() => useRecovery())

      const isAvailable = result.current.isFeatureAvailable('chat')

      expect(recoveryService.isFeatureAvailable).toHaveBeenCalledWith('chat')
      expect(isAvailable).toBe(true)
    })

    it('should get retry strategy', () => {
      const mockError = new Error('test error')
      const mockStrategy = { strategy: RECOVERY_STRATEGY.EXPONENTIAL_BACKOFF }
      recoveryService.getRetryStrategy.mockReturnValue(mockStrategy)

      const { result } = renderHook(() => useRecovery())

      const strategy = result.current.getRetryStrategy(mockError)

      expect(recoveryService.getRetryStrategy).toHaveBeenCalledWith(mockError)
      expect(strategy).toEqual(mockStrategy)
    })

    it('should update status when recovery events occur', () => {
      let recoveryCallback
      recoveryService.onRecovery.mockImplementation((callback) => {
        recoveryCallback = callback
        return vi.fn()
      })

      const { result } = renderHook(() => useRecovery())

      expect(result.current.lastRecoveryAction).toBeNull()

      // Simulate recovery event
      act(() => {
        recoveryCallback('refresh', { test: 'data' })
      })

      expect(result.current.lastRecoveryAction).toEqual({
        type: 'refresh',
        data: { test: 'data' },
        timestamp: expect.any(Number)
      })
    })
  })

  describe('useOfflineMode hook', () => {
    it('should return offline status', () => {
      recoveryService.getRecoveryStatus.mockReturnValue({
        ...mockRecoveryStatus,
        isOfflineMode: true
      })

      const { result } = renderHook(() => useOfflineMode())

      expect(result.current).toBe(true)
    })

    it('should update when offline mode changes', () => {
      let offlineCallback
      recoveryService.onOfflineMode.mockImplementation((callback) => {
        offlineCallback = callback
        return vi.fn()
      })

      const { result } = renderHook(() => useOfflineMode())

      expect(result.current).toBe(false)

      // Simulate offline mode change
      act(() => {
        offlineCallback(true)
      })

      expect(result.current).toBe(true)
    })
  })

  describe('useDegradation hook', () => {
    it('should return degradation level', () => {
      recoveryService.getRecoveryStatus.mockReturnValue({
        ...mockRecoveryStatus,
        degradationLevel: 2
      })

      const { result } = renderHook(() => useDegradation())

      expect(result.current.degradationLevel).toBe(2)
    })

    it('should update when degradation changes', () => {
      let recoveryCallback
      recoveryService.onRecovery.mockImplementation((callback) => {
        recoveryCallback = callback
        return vi.fn()
      })

      const { result } = renderHook(() => useDegradation())

      expect(result.current.degradationLevel).toBe(0)

      // Simulate degradation change
      act(() => {
        recoveryCallback('degradation', { newLevel: 3 })
      })

      expect(result.current.degradationLevel).toBe(3)
    })

    it('should check feature availability', () => {
      recoveryService.isFeatureAvailable.mockReturnValue(false)

      const { result } = renderHook(() => useDegradation())

      const isAvailable = result.current.isFeatureAvailable('advanced-features')

      expect(recoveryService.isFeatureAvailable).toHaveBeenCalledWith('advanced-features')
      expect(isAvailable).toBe(false)
    })
  })

  describe('useSmartRetry hook', () => {
    it('should execute with smart retry', async () => {
      const mockRequest = vi.fn()
      const mockError = new Error('test error')
      const mockStrategy = { strategy: RECOVERY_STRATEGY.EXPONENTIAL_BACKOFF, maxRetries: 2 }
      
      recoveryService.getRetryStrategy.mockReturnValue(mockStrategy)
      recoveryService.executeWithRecovery.mockResolvedValue('result')

      const { result } = renderHook(() => useSmartRetry())

      const response = await result.current.executeWithSmartRetry(mockRequest, mockError)

      expect(recoveryService.getRetryStrategy).toHaveBeenCalledWith(mockError)
      expect(recoveryService.executeWithRecovery).toHaveBeenCalledWith(mockRequest, mockStrategy)
      expect(response).toBe('result')
    })

    it('should use default strategy when no error provided', async () => {
      const mockRequest = vi.fn()
      recoveryService.executeWithRecovery.mockResolvedValue('result')

      const { result } = renderHook(() => useSmartRetry())

      await result.current.executeWithSmartRetry(mockRequest)

      expect(recoveryService.executeWithRecovery).toHaveBeenCalledWith(
        mockRequest,
        { strategy: RECOVERY_STRATEGY.EXPONENTIAL_BACKOFF, maxRetries: 2 }
      )
    })
  })

  describe('Error handling', () => {
    it('should handle errors in recovery actions gracefully', async () => {
      const error = new Error('Recovery failed')
      recoveryService.refreshApplication.mockRejectedValue(error)

      const { result } = renderHook(() => useRecovery())

      await expect(
        act(async () => {
          await result.current.refreshApplication()
        })
      ).rejects.toThrow('Recovery failed')

      // Should reset isRecovering state even on error
      expect(result.current.isRecovering).toBe(false)
    })

    it('should handle callback errors gracefully', () => {
      let recoveryCallback
      recoveryService.onRecovery.mockImplementation((callback) => {
        recoveryCallback = callback
        return vi.fn()
      })

      // Mock console.error to avoid test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      renderHook(() => useRecovery())

      // This should not crash the hook
      act(() => {
        recoveryCallback('test', null)
      })

      consoleSpy.mockRestore()
    })
  })
})