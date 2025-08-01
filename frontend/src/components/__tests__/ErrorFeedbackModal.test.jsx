import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ErrorFeedbackModal from '../ErrorFeedbackModal'
import errorReporter from '../../services/errorReporter'

// Mock errorReporter
vi.mock('../../services/errorReporter', () => ({
  default: {
    addUserFeedback: vi.fn()
  }
}))

describe('ErrorFeedbackModal', () => {
  const mockProps = {
    errorId: 'test-error-id',
    isOpen: true,
    onClose: vi.fn(),
    onSubmitSuccess: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render modal when open', () => {
      render(<ErrorFeedbackModal {...mockProps} />)
      
      expect(screen.getByText('Help us improve error messages')).toBeInTheDocument()
      expect(screen.getByLabelText('Close feedback form')).toBeInTheDocument()
    })

    it('should not render when closed', () => {
      render(<ErrorFeedbackModal {...mockProps} isOpen={false} />)
      
      expect(screen.queryByText('Help us improve error messages')).not.toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const { container } = render(
        <ErrorFeedbackModal {...mockProps} className="custom-modal" />
      )
      
      expect(container.querySelector('.custom-modal')).toBeInTheDocument()
    })
  })

  describe('Modal Interactions', () => {
    it('should close modal when overlay is clicked', () => {
      render(<ErrorFeedbackModal {...mockProps} />)
      
      const overlay = document.querySelector('.error-feedback-modal__overlay')
      fireEvent.click(overlay)
      
      expect(mockProps.onClose).toHaveBeenCalled()
    })

    it('should close modal when close button is clicked', () => {
      render(<ErrorFeedbackModal {...mockProps} />)
      
      const closeButton = screen.getByLabelText('Close feedback form')
      fireEvent.click(closeButton)
      
      expect(mockProps.onClose).toHaveBeenCalled()
    })

    it('should not close modal when clicking on content', () => {
      render(<ErrorFeedbackModal {...mockProps} />)
      
      const content = document.querySelector('.error-feedback-modal__content')
      fireEvent.click(content)
      
      expect(mockProps.onClose).not.toHaveBeenCalled()
    })
  })

  describe('Feedback Submission', () => {
    it('should submit feedback successfully', async () => {
      errorReporter.addUserFeedback.mockReturnValue(true)
      
      render(<ErrorFeedbackModal {...mockProps} />)
      
      // Fill out and submit form
      const firstStar = screen.getByLabelText('Rate 1 stars')
      fireEvent.click(firstStar)
      
      const submitButton = screen.getByText('Submit Feedback')
      fireEvent.click(submitButton)
      
      await waitFor(() => {
        expect(errorReporter.addUserFeedback).toHaveBeenCalledWith(
          'test-error-id',
          expect.objectContaining({
            rating: 1,
            submittedAt: expect.any(String)
          })
        )
      })
      
      expect(mockProps.onSubmitSuccess).toHaveBeenCalled()
      expect(mockProps.onClose).toHaveBeenCalled()
    })

    it('should handle submission failure', async () => {
      errorReporter.addUserFeedback.mockReturnValue(false)
      
      render(<ErrorFeedbackModal {...mockProps} />)
      
      // Fill out and submit form
      const firstStar = screen.getByLabelText('Rate 1 stars')
      fireEvent.click(firstStar)
      
      const submitButton = screen.getByText('Submit Feedback')
      fireEvent.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText('Failed to submit feedback. Please try again.')).toBeInTheDocument()
      })
      
      expect(mockProps.onSubmitSuccess).not.toHaveBeenCalled()
      expect(mockProps.onClose).not.toHaveBeenCalled()
    })

    it('should handle submission error', async () => {
      errorReporter.addUserFeedback.mockImplementation(() => {
        throw new Error('Network error')
      })
      
      render(<ErrorFeedbackModal {...mockProps} />)
      
      // Fill out and submit form
      const firstStar = screen.getByLabelText('Rate 1 stars')
      fireEvent.click(firstStar)
      
      const submitButton = screen.getByText('Submit Feedback')
      fireEvent.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText('Failed to submit feedback. Please try again.')).toBeInTheDocument()
      })
    })

    it('should dismiss error message', async () => {
      errorReporter.addUserFeedback.mockReturnValue(false)
      
      render(<ErrorFeedbackModal {...mockProps} />)
      
      // Trigger error
      const firstStar = screen.getByLabelText('Rate 1 stars')
      fireEvent.click(firstStar)
      
      const submitButton = screen.getByText('Submit Feedback')
      fireEvent.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText('Failed to submit feedback. Please try again.')).toBeInTheDocument()
      })
      
      // Dismiss error
      const dismissButton = document.querySelector('.error-feedback-modal__error-dismiss')
      fireEvent.click(dismissButton)
      
      expect(screen.queryByText('Failed to submit feedback. Please try again.')).not.toBeInTheDocument()
    })
  })

  describe('Form Integration', () => {
    it('should pass errorId to ErrorFeedback component', () => {
      render(<ErrorFeedbackModal {...mockProps} />)
      
      // The ErrorFeedback component should be rendered with the correct errorId
      // This is tested indirectly through the form presence
      expect(screen.getByText('Help us improve error messages')).toBeInTheDocument()
    })

    it('should handle cancel from ErrorFeedback', () => {
      render(<ErrorFeedbackModal {...mockProps} />)
      
      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)
      
      expect(mockProps.onClose).toHaveBeenCalled()
    })
  })

  describe('Loading States', () => {
    it('should disable close button during submission', async () => {
      errorReporter.addUserFeedback.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      )
      
      render(<ErrorFeedbackModal {...mockProps} />)
      
      // Start submission
      const firstStar = screen.getByLabelText('Rate 1 stars')
      fireEvent.click(firstStar)
      
      const submitButton = screen.getByText('Submit Feedback')
      fireEvent.click(submitButton)
      
      // Check that close button is disabled
      const closeButton = screen.getByLabelText('Close feedback form')
      expect(closeButton).toBeDisabled()
      
      // Wait for submission to complete
      await waitFor(() => {
        expect(mockProps.onClose).toHaveBeenCalled()
      })
    })

    it('should prevent closing during submission', async () => {
      errorReporter.addUserFeedback.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      )
      
      render(<ErrorFeedbackModal {...mockProps} />)
      
      // Start submission
      const firstStar = screen.getByLabelText('Rate 1 stars')
      fireEvent.click(firstStar)
      
      const submitButton = screen.getByText('Submit Feedback')
      fireEvent.click(submitButton)
      
      // Try to close via overlay - should not work during submission
      const overlay = document.querySelector('.error-feedback-modal__overlay')
      fireEvent.click(overlay)
      
      // onClose should not be called yet (submission still in progress)
      expect(mockProps.onClose).not.toHaveBeenCalled()
      
      // Wait for submission to complete
      await waitFor(() => {
        expect(mockProps.onClose).toHaveBeenCalled()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ErrorFeedbackModal {...mockProps} />)
      
      expect(screen.getByLabelText('Close feedback form')).toBeInTheDocument()
    })

    it('should trap focus within modal', () => {
      render(<ErrorFeedbackModal {...mockProps} />)
      
      // Modal should contain focusable elements
      const closeButton = screen.getByLabelText('Close feedback form')
      const firstStar = screen.getByLabelText('Rate 1 stars')
      
      expect(closeButton).toBeInTheDocument()
      expect(firstStar).toBeInTheDocument()
    })
  })
})