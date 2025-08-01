import React, { useState } from 'react';
import './ErrorFeedback.css';

/**
 * ErrorFeedback - Component for collecting user feedback on errors
 * Allows users to rate error messages and provide additional context
 */
const ErrorFeedback = ({ 
  errorId, 
  onSubmit, 
  onCancel, 
  initialFeedback = null,
  className = '' 
}) => {
  const [feedback, setFeedback] = useState({
    rating: initialFeedback?.rating || 0,
    description: initialFeedback?.description || '',
    helpful: initialFeedback?.helpful ?? null,
    category: initialFeedback?.category || '',
    expectedBehavior: initialFeedback?.expectedBehavior || '',
    reproduced: initialFeedback?.reproduced ?? null
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleRatingChange = (rating) => {
    setFeedback(prev => ({ ...prev, rating }));
  };

  const handleHelpfulChange = (helpful) => {
    setFeedback(prev => ({ ...prev, helpful }));
  };

  const handleReproducedChange = (reproduced) => {
    setFeedback(prev => ({ ...prev, reproduced }));
  };

  const handleInputChange = (field, value) => {
    setFeedback(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (feedback.rating === 0) {
      return; // Require at least a rating
    }

    setIsSubmitting(true);
    
    try {
      await onSubmit(errorId, {
        ...feedback,
        submittedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = feedback.rating > 0;

  return (
    <div className={`error-feedback ${className}`}>
      <div className="error-feedback__header">
        <h3>Help us improve error messages</h3>
        <p>Your feedback helps us provide better error information.</p>
      </div>

      <form onSubmit={handleSubmit} className="error-feedback__form">
        {/* Rating Section */}
        <div className="error-feedback__section">
          <label className="error-feedback__label">
            How helpful was this error message? *
          </label>
          <div className="error-feedback__rating">
            {[1, 2, 3, 4, 5].map(rating => (
              <button
                key={rating}
                type="button"
                className={`error-feedback__star ${
                  feedback.rating >= rating ? 'error-feedback__star--active' : ''
                }`}
                onClick={() => handleRatingChange(rating)}
                aria-label={`Rate ${rating} stars`}
              >
                ★
              </button>
            ))}
            <span className="error-feedback__rating-text">
              {feedback.rating === 0 && 'Click to rate'}
              {feedback.rating === 1 && 'Not helpful'}
              {feedback.rating === 2 && 'Slightly helpful'}
              {feedback.rating === 3 && 'Moderately helpful'}
              {feedback.rating === 4 && 'Very helpful'}
              {feedback.rating === 5 && 'Extremely helpful'}
            </span>
          </div>
        </div>

        {/* Helpful Yes/No */}
        <div className="error-feedback__section">
          <label className="error-feedback__label">
            Did this error message help you understand the problem?
          </label>
          <div className="error-feedback__radio-group">
            <label className="error-feedback__radio">
              <input
                type="radio"
                name="helpful"
                checked={feedback.helpful === true}
                onChange={() => handleHelpfulChange(true)}
              />
              Yes
            </label>
            <label className="error-feedback__radio">
              <input
                type="radio"
                name="helpful"
                checked={feedback.helpful === false}
                onChange={() => handleHelpfulChange(false)}
              />
              No
            </label>
          </div>
        </div>

        {/* Description */}
        <div className="error-feedback__section">
          <label className="error-feedback__label" htmlFor="description">
            Additional comments (optional)
          </label>
          <textarea
            id="description"
            className="error-feedback__textarea"
            value={feedback.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="Tell us more about your experience with this error..."
            rows={3}
          />
        </div>

        {/* Advanced Options Toggle */}
        <button
          type="button"
          className="error-feedback__toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▼' : '▶'} Advanced options
        </button>

        {/* Advanced Options */}
        {showAdvanced && (
          <div className="error-feedback__advanced">
            <div className="error-feedback__section">
              <label className="error-feedback__label" htmlFor="category">
                Error category
              </label>
              <select
                id="category"
                className="error-feedback__select"
                value={feedback.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
              >
                <option value="">Select category...</option>
                <option value="confusing">Confusing message</option>
                <option value="missing-info">Missing information</option>
                <option value="technical">Too technical</option>
                <option value="unclear-action">Unclear what to do</option>
                <option value="incorrect">Incorrect information</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="error-feedback__section">
              <label className="error-feedback__label" htmlFor="expectedBehavior">
                What did you expect to happen?
              </label>
              <textarea
                id="expectedBehavior"
                className="error-feedback__textarea"
                value={feedback.expectedBehavior}
                onChange={(e) => handleInputChange('expectedBehavior', e.target.value)}
                placeholder="Describe what you expected to happen..."
                rows={2}
              />
            </div>

            <div className="error-feedback__section">
              <label className="error-feedback__label">
                Were you able to reproduce this error?
              </label>
              <div className="error-feedback__radio-group">
                <label className="error-feedback__radio">
                  <input
                    type="radio"
                    name="reproduced"
                    checked={feedback.reproduced === true}
                    onChange={() => handleReproducedChange(true)}
                  />
                  Yes, consistently
                </label>
                <label className="error-feedback__radio">
                  <input
                    type="radio"
                    name="reproduced"
                    checked={feedback.reproduced === false}
                    onChange={() => handleReproducedChange(false)}
                  />
                  No, it was random
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="error-feedback__actions">
          <button
            type="button"
            className="error-feedback__button error-feedback__button--secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="error-feedback__button error-feedback__button--primary"
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ErrorFeedback;