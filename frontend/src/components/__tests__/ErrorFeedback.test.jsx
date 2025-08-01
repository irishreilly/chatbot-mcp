import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ErrorFeedback from '../ErrorFeedback';

describe('ErrorFeedback', () => {
  const mockProps = {
    errorId: 'test-error-id',
    onSubmit: vi.fn(),
    onCancel: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render feedback form with required elements', () => {
      render(<ErrorFeedback {...mockProps} />);

      expect(screen.getByText('Help us improve error messages')).toBeInTheDocument();
      expect(screen.getByText('How helpful was this error message? *')).toBeInTheDocument();
      expect(screen.getByText('Did this error message help you understand the problem?')).toBeInTheDocument();
      expect(screen.getByLabelText('Additional comments (optional)')).toBeInTheDocument();
      expect(screen.getByText('Submit Feedback')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should render rating stars', () => {
      render(<ErrorFeedback {...mockProps} />);

      const stars = screen.getAllByLabelText(/Rate \d stars/);
      expect(stars).toHaveLength(5);
    });

    it('should render helpful yes/no radio buttons', () => {
      render(<ErrorFeedback {...mockProps} />);

      expect(screen.getByRole('radio', { name: 'Yes' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'No' })).toBeInTheDocument();
    });

    it('should render advanced options toggle', () => {
      render(<ErrorFeedback {...mockProps} />);

      expect(screen.getByText('▶ Advanced options')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <ErrorFeedback {...mockProps} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('error-feedback', 'custom-class');
    });
  });

  describe('Rating Interaction', () => {
    it('should update rating when star is clicked', () => {
      render(<ErrorFeedback {...mockProps} />);

      const thirdStar = screen.getByLabelText('Rate 3 stars');
      fireEvent.click(thirdStar);

      expect(screen.getByText('Moderately helpful')).toBeInTheDocument();
    });

    it('should show correct rating text for each rating', () => {
      render(<ErrorFeedback {...mockProps} />);

      const ratings = [
        { star: 1, text: 'Not helpful' },
        { star: 2, text: 'Slightly helpful' },
        { star: 3, text: 'Moderately helpful' },
        { star: 4, text: 'Very helpful' },
        { star: 5, text: 'Extremely helpful' }
      ];

      ratings.forEach(({ star, text }) => {
        const starButton = screen.getByLabelText(`Rate ${star} stars`);
        fireEvent.click(starButton);
        expect(screen.getByText(text)).toBeInTheDocument();
      });
    });

    it('should show "Click to rate" when no rating selected', () => {
      render(<ErrorFeedback {...mockProps} />);

      expect(screen.getByText('Click to rate')).toBeInTheDocument();
    });

    it('should highlight selected stars', () => {
      render(<ErrorFeedback {...mockProps} />);

      const thirdStar = screen.getByLabelText('Rate 3 stars');
      fireEvent.click(thirdStar);

      // Check that first 3 stars are active
      for (let i = 1; i <= 3; i++) {
        const star = screen.getByLabelText(`Rate ${i} stars`);
        expect(star).toHaveClass('error-feedback__star--active');
      }

      // Check that last 2 stars are not active
      for (let i = 4; i <= 5; i++) {
        const star = screen.getByLabelText(`Rate ${i} stars`);
        expect(star).not.toHaveClass('error-feedback__star--active');
      }
    });
  });

  describe('Helpful Radio Buttons', () => {
    it('should update helpful state when radio button is selected', () => {
      render(<ErrorFeedback {...mockProps} />);

      const yesRadio = screen.getByRole('radio', { name: 'Yes' });
      const noRadio = screen.getByRole('radio', { name: 'No' });

      fireEvent.click(yesRadio);
      expect(yesRadio).toBeChecked();
      expect(noRadio).not.toBeChecked();

      fireEvent.click(noRadio);
      expect(noRadio).toBeChecked();
      expect(yesRadio).not.toBeChecked();
    });
  });

  describe('Text Input', () => {
    it('should update description when textarea is changed', () => {
      render(<ErrorFeedback {...mockProps} />);

      const textarea = screen.getByLabelText('Additional comments (optional)');
      fireEvent.change(textarea, { target: { value: 'Test feedback' } });

      expect(textarea.value).toBe('Test feedback');
    });

    it('should show placeholder text in textarea', () => {
      render(<ErrorFeedback {...mockProps} />);

      const textarea = screen.getByLabelText('Additional comments (optional)');
      expect(textarea).toHaveAttribute(
        'placeholder',
        'Tell us more about your experience with this error...'
      );
    });
  });

  describe('Advanced Options', () => {
    it('should toggle advanced options when clicked', () => {
      render(<ErrorFeedback {...mockProps} />);

      const toggle = screen.getByText('▶ Advanced options');
      fireEvent.click(toggle);

      expect(screen.getByText('▼ Advanced options')).toBeInTheDocument();
      expect(screen.getByLabelText('Error category')).toBeInTheDocument();
      expect(screen.getByLabelText('What did you expect to happen?')).toBeInTheDocument();
      expect(screen.getByText('Were you able to reproduce this error?')).toBeInTheDocument();
    });

    it('should hide advanced options when toggled off', () => {
      render(<ErrorFeedback {...mockProps} />);

      const toggle = screen.getByText('▶ Advanced options');
      fireEvent.click(toggle);
      fireEvent.click(screen.getByText('▼ Advanced options'));

      expect(screen.getByText('▶ Advanced options')).toBeInTheDocument();
      expect(screen.queryByLabelText('Error category')).not.toBeInTheDocument();
    });

    it('should render category select options', () => {
      render(<ErrorFeedback {...mockProps} />);

      fireEvent.click(screen.getByText('▶ Advanced options'));
      
      const categorySelect = screen.getByLabelText('Error category');
      expect(categorySelect).toBeInTheDocument();

      const options = [
        'Select category...',
        'Confusing message',
        'Missing information',
        'Too technical',
        'Unclear what to do',
        'Incorrect information',
        'Other'
      ];

      options.forEach(option => {
        expect(screen.getByRole('option', { name: option })).toBeInTheDocument();
      });
    });

    it('should update category when selected', () => {
      render(<ErrorFeedback {...mockProps} />);

      fireEvent.click(screen.getByText('▶ Advanced options'));
      
      const categorySelect = screen.getByLabelText('Error category');
      fireEvent.change(categorySelect, { target: { value: 'confusing' } });

      expect(categorySelect.value).toBe('confusing');
    });

    it('should update expected behavior textarea', () => {
      render(<ErrorFeedback {...mockProps} />);

      fireEvent.click(screen.getByText('▶ Advanced options'));
      
      const textarea = screen.getByLabelText('What did you expect to happen?');
      fireEvent.change(textarea, { target: { value: 'Expected success' } });

      expect(textarea.value).toBe('Expected success');
    });

    it('should handle reproduced radio buttons', () => {
      render(<ErrorFeedback {...mockProps} />);

      fireEvent.click(screen.getByText('▶ Advanced options'));
      
      const yesRadio = screen.getByRole('radio', { name: 'Yes, consistently' });
      const noRadio = screen.getByRole('radio', { name: 'No, it was random' });

      fireEvent.click(yesRadio);
      expect(yesRadio).toBeChecked();
      expect(noRadio).not.toBeChecked();

      fireEvent.click(noRadio);
      expect(noRadio).toBeChecked();
      expect(yesRadio).not.toBeChecked();
    });
  });

  describe('Form Validation', () => {
    it('should disable submit button when no rating is selected', () => {
      render(<ErrorFeedback {...mockProps} />);

      const submitButton = screen.getByText('Submit Feedback');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when rating is selected', () => {
      render(<ErrorFeedback {...mockProps} />);

      const firstStar = screen.getByLabelText('Rate 1 stars');
      fireEvent.click(firstStar);

      const submitButton = screen.getByText('Submit Feedback');
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    it('should call onSubmit with correct data when form is submitted', async () => {
      render(<ErrorFeedback {...mockProps} />);

      // Fill out form
      const thirdStar = screen.getByLabelText('Rate 3 stars');
      fireEvent.click(thirdStar);

      const yesRadio = screen.getByRole('radio', { name: 'Yes' });
      fireEvent.click(yesRadio);

      const textarea = screen.getByLabelText('Additional comments (optional)');
      fireEvent.change(textarea, { target: { value: 'Test comment' } });

      // Submit form
      const submitButton = screen.getByText('Submit Feedback');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockProps.onSubmit).toHaveBeenCalledWith(
          'test-error-id',
          expect.objectContaining({
            rating: 3,
            helpful: true,
            description: 'Test comment',
            submittedAt: expect.any(String)
          })
        );
      });
    });

    it('should include advanced options in submission', async () => {
      render(<ErrorFeedback {...mockProps} />);

      // Fill out basic form
      const fourthStar = screen.getByLabelText('Rate 4 stars');
      fireEvent.click(fourthStar);

      // Fill out advanced options
      fireEvent.click(screen.getByText('▶ Advanced options'));
      
      const categorySelect = screen.getByLabelText('Error category');
      fireEvent.change(categorySelect, { target: { value: 'confusing' } });

      const expectedBehavior = screen.getByLabelText('What did you expect to happen?');
      fireEvent.change(expectedBehavior, { target: { value: 'Expected it to work' } });

      const reproducedYes = screen.getByRole('radio', { name: 'Yes, consistently' });
      fireEvent.click(reproducedYes);

      // Submit form
      const submitButton = screen.getByText('Submit Feedback');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockProps.onSubmit).toHaveBeenCalledWith(
          'test-error-id',
          expect.objectContaining({
            rating: 4,
            category: 'confusing',
            expectedBehavior: 'Expected it to work',
            reproduced: true
          })
        );
      });
    });

    it('should show loading state during submission', async () => {
      const slowOnSubmit = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
      render(<ErrorFeedback {...mockProps} onSubmit={slowOnSubmit} />);

      const firstStar = screen.getByLabelText('Rate 1 stars');
      fireEvent.click(firstStar);

      const submitButton = screen.getByText('Submit Feedback');
      fireEvent.click(submitButton);

      expect(screen.getByText('Submitting...')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      await waitFor(() => {
        expect(screen.getByText('Submit Feedback')).toBeInTheDocument();
      });
    });

    it('should handle submission errors gracefully', async () => {
      const errorOnSubmit = vi.fn().mockRejectedValue(new Error('Submission failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<ErrorFeedback {...mockProps} onSubmit={errorOnSubmit} />);

      const firstStar = screen.getByLabelText('Rate 1 stars');
      fireEvent.click(firstStar);

      const submitButton = screen.getByText('Submit Feedback');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to submit feedback:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    it('should prevent submission without rating', () => {
      render(<ErrorFeedback {...mockProps} />);

      const form = screen.getByRole('form');
      fireEvent.submit(form);

      expect(mockProps.onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Cancel Action', () => {
    it('should call onCancel when cancel button is clicked', () => {
      render(<ErrorFeedback {...mockProps} />);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockProps.onCancel).toHaveBeenCalled();
    });

    it('should disable cancel button during submission', async () => {
      const slowOnSubmit = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
      render(<ErrorFeedback {...mockProps} onSubmit={slowOnSubmit} />);

      const firstStar = screen.getByLabelText('Rate 1 stars');
      fireEvent.click(firstStar);

      const submitButton = screen.getByText('Submit Feedback');
      fireEvent.click(submitButton);

      const cancelButton = screen.getByText('Cancel');
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('Initial Feedback', () => {
    it('should populate form with initial feedback values', () => {
      const initialFeedback = {
        rating: 4,
        description: 'Initial comment',
        helpful: true,
        category: 'confusing',
        expectedBehavior: 'Expected success',
        reproduced: false
      };

      render(
        <ErrorFeedback {...mockProps} initialFeedback={initialFeedback} />
      );

      // Check rating
      expect(screen.getByText('Very helpful')).toBeInTheDocument();

      // Check description
      const textarea = screen.getByLabelText('Additional comments (optional)');
      expect(textarea.value).toBe('Initial comment');

      // Check helpful radio
      const yesRadio = screen.getByRole('radio', { name: 'Yes' });
      expect(yesRadio).toBeChecked();

      // Check advanced options
      fireEvent.click(screen.getByText('▶ Advanced options'));
      
      const categorySelect = screen.getByLabelText('Error category');
      expect(categorySelect.value).toBe('confusing');

      const expectedBehavior = screen.getByLabelText('What did you expect to happen?');
      expect(expectedBehavior.value).toBe('Expected success');

      const reproducedNo = screen.getByRole('radio', { name: 'No, it was random' });
      expect(reproducedNo).toBeChecked();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<ErrorFeedback {...mockProps} />);

      expect(screen.getByLabelText('Additional comments (optional)')).toBeInTheDocument();
    });

    it('should have proper ARIA labels for stars', () => {
      render(<ErrorFeedback {...mockProps} />);

      for (let i = 1; i <= 5; i++) {
        expect(screen.getByLabelText(`Rate ${i} stars`)).toBeInTheDocument();
      }
    });

    it('should have proper radio button labels', () => {
      render(<ErrorFeedback {...mockProps} />);

      expect(screen.getByRole('radio', { name: 'Yes' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'No' })).toBeInTheDocument();
    });

    it('should have proper form structure', () => {
      render(<ErrorFeedback {...mockProps} />);

      expect(screen.getByRole('form')).toBeInTheDocument();
    });
  });
});