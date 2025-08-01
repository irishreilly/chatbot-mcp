import { describe, it, expect, beforeEach, vi } from 'vitest'
import errorService, { 
  logError, 
  getUserFriendlyMessage, 
  getErrorStats, 
  clearErrorLogs,
  ErrorSeverity, 
  ErrorCategory 
} from './errorService'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.sessionStorage = sessionStorageMock

// Mock navigator
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true,
})

describe('ErrorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearErrorLogs()
    localStorageMock.getItem.mockReturnValue('[]')
    sessionStorageMock.getItem.mockReturnValue(null)
  })

  describe('logError', () => {
    it('should log a simple error', () => {
      const error = new Error('Test error')
      const errorId = logError(error)
      
      expect(errorId).toBeDefined()
      expect(typeof errorId).toBe('string')
      expect(errorId).toMatch(/^error_/)
    })

    it('should log error with options', () => {
      const error = new Error('Test error')
      const errorId = logError(error, {
        category: ErrorCategory.API,
        severity: ErrorSeverity.HIGH,
        context: 'test_context',
        additionalData: { test: 'data' }
      })
      
      expect(errorId).toBeDefined()
      
      // Check that error was stored in localStorage
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'errorLogs',
        expect.stringContaining('Test error')
      )
    })

    it('should handle string errors', () => {
      const errorId = logError('String error message')
      expect(errorId).toBeDefined()
    })

    it('should handle object errors', () => {
      const errorObj = { message: 'Object error', code: 'TEST_ERROR' }
      const errorId = logError(errorObj)
      expect(errorId).toBeDefined()
    })

    it('should limit error queue size', () => {
      // Log more errors than the max queue size
      for (let i = 0; i < 60; i++) {
        logError(new Error(`Error ${i}`))
      }
      
      const stats = getErrorStats()
      expect(stats.queueSize).toBeLessThanOrEqual(50)
    })
  })

  describe('getUserFriendlyMessage', () => {
    it('should return network error message', () => {
      const error = new Error('Network failed')
      error.name = 'NetworkError'
      
      const message = getUserFriendlyMessage(error)
      expect(message).toContain('Unable to connect')
    })

    it('should return timeout error message', () => {
      const error = new Error('Request timeout')
      error.name = 'TimeoutError'
      
      const message = getUserFriendlyMessage(error)
      expect(message).toContain('took too long')
    })

    it('should return status-specific messages', () => {
      const error = new Error('Unauthorized')
      error.status = 401
      
      const message = getUserFriendlyMessage(error)
      expect(message).toContain('Authentication required')
    })

    it('should return validation error message', () => {
      const error = new Error('Invalid input')
      const message = getUserFriendlyMessage(error, { category: ErrorCategory.VALIDATION })
      expect(message).toContain('Invalid input')
    })

    it('should return default message for unknown errors', () => {
      const error = new Error('Unknown error')
      const message = getUserFriendlyMessage(error)
      expect(message).toContain('unexpected error')
    })
  })

  describe('getErrorStats', () => {
    it('should return error statistics', () => {
      logError(new Error('Error 1'), { category: ErrorCategory.API })
      logError(new Error('Error 2'), { category: ErrorCategory.NETWORK, severity: ErrorSeverity.HIGH })
      
      const stats = getErrorStats()
      
      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('byCategory')
      expect(stats).toHaveProperty('bySeverity')
      expect(stats).toHaveProperty('queueSize')
      expect(stats).toHaveProperty('isOnline')
    })

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage error')
      })
      
      const stats = getErrorStats()
      expect(stats.total).toBe(0)
    })
  })

  describe('clearErrorLogs', () => {
    it('should clear error logs', () => {
      logError(new Error('Test error'))
      clearErrorLogs()
      
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('errorLogs')
    })
  })

  describe('online/offline handling', () => {
    it('should track online status', () => {
      const stats = getErrorStats()
      expect(stats.isOnline).toBe(true)
    })

    it('should handle offline state', () => {
      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', { value: false })
      
      // Trigger offline event
      const offlineEvent = new Event('offline')
      window.dispatchEvent(offlineEvent)
      
      const stats = getErrorStats()
      expect(stats.isOnline).toBe(false)
    })
  })

  describe('global error handlers', () => {
    it('should handle unhandled promise rejections', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation()
      
      // Simulate unhandled promise rejection
      const rejectionEvent = new Event('unhandledrejection')
      rejectionEvent.reason = new Error('Unhandled promise rejection')
      window.dispatchEvent(rejectionEvent)
      
      // Check that error was logged
      expect(localStorageMock.setItem).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })

    it('should handle global errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation()
      
      // Simulate global error
      const errorEvent = new ErrorEvent('error', {
        error: new Error('Global error'),
        filename: 'test.js',
        lineno: 10,
        colno: 5
      })
      window.dispatchEvent(errorEvent)
      
      // Check that error was logged
      expect(localStorageMock.setItem).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })
  })

  describe('session management', () => {
    it('should create session ID if none exists', () => {
      sessionStorageMock.getItem.mockReturnValue(null)
      
      logError(new Error('Test error'))
      
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'sessionId',
        expect.stringMatching(/^session_/)
      )
    })

    it('should use existing session ID', () => {
      const existingSessionId = 'existing_session_123'
      sessionStorageMock.getItem.mockReturnValue(existingSessionId)
      
      logError(new Error('Test error'))
      
      // Should not create new session ID
      expect(sessionStorageMock.setItem).not.toHaveBeenCalledWith(
        'sessionId',
        expect.any(String)
      )
    })
  })
})