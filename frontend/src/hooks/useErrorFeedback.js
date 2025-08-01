/**
 * useErrorFeedback - Hook for managing error feedback collection
 * Provides easy integration with ErrorReporter and ErrorFeedbackModal
 */

import { useState, useCallback } from 'react'
import errorReporter from '../services/errorReporter'

export const useErrorFeedback = () => {
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    errorId: null
  })

  // Show feedback modal for a specific error
  const showFeedback = useCallback((errorId) => {
    setFeedbackModal({
      isOpen: true,
      errorId
    })
  }, [])

  // Hide feedback modal
  const hideFeedback = useCallback(() => {
    setFeedbackModal({
      isOpen: false,
      errorId: null
    })
  }, [])

  // Submit feedback and close modal
  const submitFeedback = useCallback(async (errorId, feedback) => {
    try {
      const success = errorReporter.addUserFeedback(errorId, feedback)
      
      if (success) {
        hideFeedback()
        return { success: true }
      } else {
        return { 
          success: false, 
          error: 'Failed to save feedback' 
        }
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error)
      return { 
        success: false, 
        error: error.message || 'Failed to submit feedback' 
      }
    }
  }, [hideFeedback])

  // Get feedback for a specific error
  const getFeedback = useCallback((errorId) => {
    const errors = errorReporter.getErrors({ resolved: false })
    const error = errors.find(e => e.id === errorId)
    return error?.userFeedback || null
  }, [])

  // Get all errors that need feedback
  const getErrorsNeedingFeedback = useCallback(() => {
    const errors = errorReporter.getErrors({ resolved: false })
    return errors.filter(error => !error.userFeedback)
  }, [])

  // Mark error as resolved
  const resolveError = useCallback((errorId) => {
    return errorReporter.markErrorResolved(errorId)
  }, [])

  // Get error details
  const getErrorDetails = useCallback((errorId) => {
    const errors = errorReporter.getErrors()
    return errors.find(e => e.id === errorId) || null
  }, [])

  return {
    // Modal state
    feedbackModal,
    
    // Actions
    showFeedback,
    hideFeedback,
    submitFeedback,
    
    // Data access
    getFeedback,
    getErrorsNeedingFeedback,
    getErrorDetails,
    resolveError
  }
}

export default useErrorFeedback