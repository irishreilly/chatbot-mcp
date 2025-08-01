/**
 * ErrorFeedbackModal - Modal wrapper for collecting user feedback on errors
 * Integrates ErrorFeedback component with ErrorReporter service
 */

import React, { useState } from 'react'
import ErrorFeedback from './ErrorFeedback'
import errorReporter from '../services/errorReporter'

const ErrorFeedbackModal = ({ 
  errorId, 
  isOpen, 
  onClose, 
  onSubmitSuccess,
  className = '' 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const handleSubmit = async (errorId, feedback) => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Add feedback to ErrorReporter
      const success = errorReporter.addUserFeedback(errorId, feedback)
      
      if (success) {
        // Call success callback if provided
        if (onSubmitSuccess) {
          onSubmitSuccess(errorId, feedback)
        }
        
        // Close modal
        onClose()
      } else {
        throw new Error('Failed to save feedback')
      }
    } catch (error) {
      console.error('Failed to submit error feedback:', error)
      setSubmitError('Failed to submit feedback. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (!isSubmitting) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className={`error-feedback-modal ${className}`}>
      <div 
        className="error-feedback-modal__overlay" 
        onClick={handleCancel}
      />
      
      <div className="error-feedback-modal__content">
        <div className="error-feedback-modal__header">
          <button
            className="error-feedback-modal__close"
            onClick={handleCancel}
            disabled={isSubmitting}
            aria-label="Close feedback form"
          >
            ×
          </button>
        </div>

        {submitError && (
          <div className="error-feedback-modal__error">
            <div className="error-feedback-modal__error-icon">⚠️</div>
            <div className="error-feedback-modal__error-message">
              {submitError}
            </div>
            <button
              className="error-feedback-modal__error-dismiss"
              onClick={() => setSubmitError(null)}
            >
              ×
            </button>
          </div>
        )}

        <ErrorFeedback
          errorId={errorId}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          className="error-feedback-modal__form"
        />
      </div>

      <style jsx>{`
        .error-feedback-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .error-feedback-modal__overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(2px);
        }

        .error-feedback-modal__content {
          position: relative;
          background: white;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          max-width: 600px;
          width: 90%;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .error-feedback-modal__header {
          display: flex;
          justify-content: flex-end;
          padding: 16px 20px 0;
        }

        .error-feedback-modal__close {
          background: none;
          border: none;
          font-size: 24px;
          color: #666;
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .error-feedback-modal__close:hover {
          background: #f0f0f0;
          color: #333;
        }

        .error-feedback-modal__close:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .error-feedback-modal__error {
          margin: 0 20px 16px;
          padding: 12px;
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 4px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .error-feedback-modal__error-icon {
          font-size: 16px;
          flex-shrink: 0;
        }

        .error-feedback-modal__error-message {
          flex: 1;
          font-size: 14px;
          color: #856404;
        }

        .error-feedback-modal__error-dismiss {
          background: none;
          border: none;
          font-size: 18px;
          color: #856404;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          flex-shrink: 0;
        }

        .error-feedback-modal__form {
          flex: 1;
          overflow-y: auto;
        }

        @media (max-width: 768px) {
          .error-feedback-modal__content {
            width: 95%;
            max-height: 90vh;
          }
        }
      `}</style>
    </div>
  )
}

export default ErrorFeedbackModal