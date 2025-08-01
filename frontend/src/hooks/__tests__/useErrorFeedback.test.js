import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import useErrorFeedback from '../useErrorFeedback'
import errorReporter from '../../services/errorReporter'

// Mock errorReporter
vi.mock('../../services/errorReporter', () => ({
  default: {
    addUserFeedback: vi.fn(),
    getErrors: vi.fn(),
    markErrorResolved: vi.fn()
  }
}))

describe('useErrorFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Modal State Management', () => {
    it('should initialize with closed modal', () => {
      const { result } = renderHook(() => useErrorFeedback())
      
      expect(result.current.feedbackModal).toEqual({
        isOpen: false,
        errorId: null
      })
    })

    it('should open modal with error ID', () => {
      const { result } = renderHook(() => useErrorFeedback())
      
      act(() => {
        result.current.showFeedback('test-error-id')
      })
      
      expect(result.current.feedbackModal).toEqual({
        isOpen: true,
        errorId: 'test-error-id'
      })
    })

    it('should close modal', () => {
      const { result } = renderHook(() => useErrorFeedback())
      
      // Open modal first
      act(() => {
        result.current.showFeedback('test-error-id')
      })
      
      // Then close it
      act(() => {
        result.current.hideFeedback()
      })
      
      expect(result.current.feedbackModal).toEqual({
        isOpen: false,
        errorId: null
      })
    })
  })

  describe('Feedback Submission', () => {
    it('should submit feedback successfully', async () => {
      errorReporter.addUserFeedback.mockReturnValue(true)
      
      const { result } = renderHook(() => useErrorFeedback())
      
      let submitResult
      await act(async () => {
        submitResult = await result.current.submitFeedback('test-error-id', {
          rating: 5,
          description: 'Great error message'
        })
      })
      
      expect(errorReporter.addUserFeedback).toHaveBeenCalledWith(
        'test-error-id',
        { rating: 5, description: 'Great error message' }
      )
      
      expect(submitResult).toEqual({ success: true })
      expect(result.current.feedbackModal.isOpen).toBe(false)
    })

    it('should handle submission failure', async () => {
      errorReporter.addUserFeedback.mockReturnValue(false)
      
      const { result } = renderHook(() => useErrorFeedback())
      
      let submitResult
      await act(async () => {
        submitResult = await result.current.submitFeedback('test-error-id', {
          rating: 3
        })
      })
      
      expect(submitResult).toEqual({
        success: false,
        error: 'Failed to save feedback'
      })
      
      expect(result.current.feedbackModal.isOpen).toBe(true) // Should remain open
    })

    it('should handle submission error', async () => {
      errorReporter.addUserFeedback.mockImplementation(() => {
        throw new Error('Network error')
      })
      
      const { result } = renderHook(() => useErrorFeedback())
      
      let submitResult
      await act(async () => {
        submitResult = await result.current.submitFeedback('test-error-id', {
          rating: 3
        })
      })
      
      expect(submitResult).toEqual({
        success: false,
        error: 'Network error'
      })
    })
  })

  describe('Data Access', () => {
    it('should get feedback for specific error', () => {
      const mockErrors = [
        {
          id: 'error1',
          userFeedback: { rating: 5, description: 'Good' }
        },
        {
          id: 'error2',
          userFeedback: null
        }
      ]
      
      errorReporter.getErrors.mockReturnValue(mockErrors)
      
      const { result } = renderHook(() => useErrorFeedback())
      
      const feedback = result.current.getFeedback('error1')
      expect(feedback).toEqual({ rating: 5, description: 'Good' })
      
      const noFeedback = result.current.getFeedback('error2')
      expect(noFeedback).toBeNull()
      
      const notFound = result.current.getFeedback('error3')
      expect(notFound).toBeNull()
    })

    it('should get errors needing feedback', () => {
      const mockErrors = [
        {
          id: 'error1',
          userFeedback: { rating: 5 },
          resolved: false
        },
        {
          id: 'error2',
          userFeedback: null,
          resolved: false
        },
        {
          id: 'error3',
          userFeedback: null,
          resolved: true // Resolved errors are excluded
        }
      ]
      
      errorReporter.getErrors.mockReturnValue(mockErrors)
      
      const { result } = renderHook(() => useErrorFeedback())
      
      const errorsNeedingFeedback = result.current.getErrorsNeedingFeedback()
      
      expect(errorsNeedingFeedback).toHaveLength(1)
      expect(errorsNeedingFeedback[0].id).toBe('error2')
    })

    it('should get error details', () => {
      const mockErrors = [
        {
          id: 'error1',
          message: 'Test error',
          severity: 'high'
        }
      ]
      
      errorReporter.getErrors.mockReturnValue(mockErrors)
      
      const { result } = renderHook(() => useErrorFeedback())
      
      const errorDetails = result.current.getErrorDetails('error1')
      expect(errorDetails).toEqual({
        id: 'error1',
        message: 'Test error',
        severity: 'high'
      })
      
      const notFound = result.current.getErrorDetails('error2')
      expect(notFound).toBeNull()
    })

    it('should resolve error', () => {
      errorReporter.markErrorResolved.mockReturnValue(true)
      
      const { result } = renderHook(() => useErrorFeedback())
      
      const resolved = result.current.resolveError('test-error-id')
      
      expect(errorReporter.markErrorResolved).toHaveBeenCalledWith('test-error-id')
      expect(resolved).toBe(true)
    })
  })

  describe('Hook Stability', () => {
    it('should maintain stable function references', () => {
      const { result, rerender } = renderHook(() => useErrorFeedback())
      
      const initialFunctions = {
        showFeedback: result.current.showFeedback,
        hideFeedback: result.current.hideFeedback,
        submitFeedback: result.current.submitFeedback,
        getFeedback: result.current.getFeedback,
        getErrorsNeedingFeedback: result.current.getErrorsNeedingFeedback,
        getErrorDetails: result.current.getErrorDetails,
        resolveError: result.current.resolveError
      }
      
      rerender()
      
      // Functions should be stable across rerenders
      expect(result.current.showFeedback).toBe(initialFunctions.showFeedback)
      expect(result.current.hideFeedback).toBe(initialFunctions.hideFeedback)
      expect(result.current.submitFeedback).toBe(initialFunctions.submitFeedback)
      expect(result.current.getFeedback).toBe(initialFunctions.getFeedback)
      expect(result.current.getErrorsNeedingFeedback).toBe(initialFunctions.getErrorsNeedingFeedback)
      expect(result.current.getErrorDetails).toBe(initialFunctions.getErrorDetails)
      expect(result.current.resolveError).toBe(initialFunctions.resolveError)
    })
  })
})