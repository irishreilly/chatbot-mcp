/**
 * Error Service - Centralized error handling and logging
 * Enhanced with comprehensive error reporting and user feedback collection
 */

import errorReporter, { ERROR_SEVERITY, ERROR_CATEGORY } from './errorReporter.js';

// Re-export constants for backward compatibility
export const ErrorSeverity = ERROR_SEVERITY;
export const ErrorCategory = ERROR_CATEGORY;

class ErrorService {
  constructor() {
    this.errorQueue = []
    this.maxQueueSize = 50
    this.isOnline = navigator.onLine
    this.errorReporter = errorReporter
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true
      this.flushErrorQueue()
    })
    
    window.addEventListener('offline', () => {
      this.isOnline = false
    })
    
    // Note: Global error handlers are now managed by ErrorReporter
    // This prevents duplicate error handling
  }

  /**
   * Log an error with context information
   * @param {Error|string} error - The error to log
   * @param {Object} options - Additional options
   */
  logError(error, options = {}) {
    // Convert error to ErrorReporter format
    const errorData = this.convertToReporterFormat(error, options)
    
    // Use ErrorReporter for comprehensive logging
    const errorId = this.errorReporter.reportError(errorData)
    
    // Add to legacy queue for backward compatibility
    const legacyErrorData = this.createErrorData(error, options)
    this.addToQueue(legacyErrorData)
    
    // Try to send immediately if online
    if (this.isOnline) {
      this.sendError(legacyErrorData)
    }
    
    return errorId
  }

  /**
   * Convert error to ErrorReporter format
   * @param {Error|string} error - The error to convert
   * @param {Object} options - Additional options
   * @returns {Object} ErrorReporter compatible error data
   */
  convertToReporterFormat(error, options = {}) {
    let message = 'Unknown error'
    let stack = null
    
    if (error instanceof Error) {
      message = error.message
      stack = error.stack
    } else if (typeof error === 'string') {
      message = error
    } else if (error && typeof error === 'object') {
      message = error.message || JSON.stringify(error)
      stack = error.stack
    }
    
    return {
      type: options.category || ERROR_CATEGORY.RUNTIME,
      message,
      stack,
      severity: options.severity || ERROR_SEVERITY.MEDIUM,
      context: {
        ...options.additionalData,
        originalContext: options.context,
        userId: options.userId,
        filename: options.filename,
        lineno: options.lineno,
        colno: options.colno
      },
      userAction: options.userAction || null
    }
  }

  /**
   * Create structured error data
   * @param {Error|string} error - The error
   * @param {Object} options - Additional options
   * @returns {Object} Structured error data
   */
  createErrorData(error, options = {}) {
    const timestamp = new Date().toISOString()
    const id = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    let errorInfo = {
      message: 'Unknown error',
      stack: null,
      name: 'Error'
    }
    
    if (error instanceof Error) {
      errorInfo = {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    } else if (typeof error === 'string') {
      errorInfo.message = error
    } else if (error && typeof error === 'object') {
      errorInfo.message = error.message || JSON.stringify(error)
      errorInfo.stack = error.stack
      errorInfo.name = error.name || 'Error'
    }
    
    return {
      id,
      timestamp,
      ...errorInfo,
      category: options.category || ErrorCategory.RUNTIME,
      severity: options.severity || ErrorSeverity.MEDIUM,
      context: options.context || 'unknown',
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: options.userId || null,
      sessionId: this.getSessionId(),
      additionalData: options.additionalData || {},
      ...options
    }
  }

  /**
   * Add error to local queue
   * @param {Object} errorData - Error data to queue
   */
  addToQueue(errorData) {
    this.errorQueue.push(errorData)
    
    // Limit queue size
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift()
    }
    
    // Store in localStorage as backup
    try {
      const existingErrors = JSON.parse(localStorage.getItem('errorLogs') || '[]')
      existingErrors.push(errorData)
      
      // Keep only recent errors
      const recentErrors = existingErrors.slice(-20)
      localStorage.setItem('errorLogs', JSON.stringify(recentErrors))
    } catch (e) {
      console.warn('Failed to store error in localStorage:', e)
    }
  }

  /**
   * Send error to logging service
   * @param {Object} errorData - Error data to send
   */
  async sendError(errorData) {
    try {
      // In a real application, you would send to your logging service
      // For now, we'll just simulate the API call
      
      // Example: Send to your backend logging endpoint
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorData)
      // })
      
      // For demo purposes, just log to console
      console.log('Error would be sent to logging service:', errorData)
      
      return true
    } catch (e) {
      console.warn('Failed to send error to logging service:', e)
      return false
    }
  }

  /**
   * Flush error queue when back online
   */
  async flushErrorQueue() {
    if (this.errorQueue.length === 0) return
    
    const errors = [...this.errorQueue]
    this.errorQueue = []
    
    for (const error of errors) {
      await this.sendError(error)
    }
  }

  /**
   * Get or create session ID
   * @returns {string} Session ID
   */
  getSessionId() {
    let sessionId = sessionStorage.getItem('sessionId')
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      sessionStorage.setItem('sessionId', sessionId)
    }
    return sessionId
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    try {
      // Get comprehensive stats from ErrorReporter
      const reporterStats = this.errorReporter.getErrorStats()
      
      // Get legacy stats for backward compatibility
      const errors = JSON.parse(localStorage.getItem('errorLogs') || '[]')
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      
      const recentErrors = errors.filter(e => new Date(e.timestamp) > oneHourAgo)
      const dailyErrors = errors.filter(e => new Date(e.timestamp) > oneDayAgo)
      
      const categoryCounts = errors.reduce((acc, error) => {
        acc[error.category] = (acc[error.category] || 0) + 1
        return acc
      }, {})
      
      const severityCounts = errors.reduce((acc, error) => {
        acc[error.severity] = (acc[error.severity] || 0) + 1
        return acc
      }, {})
      
      return {
        // Enhanced stats from ErrorReporter
        ...reporterStats,
        // Legacy stats for backward compatibility
        total: Math.max(errors.length, reporterStats.totalErrors || 0),
        recentHour: recentErrors.length,
        dailyTotal: dailyErrors.length,
        byCategory: { ...categoryCounts, ...reporterStats.errorsByType },
        bySeverity: { ...severityCounts, ...reporterStats.errorsBySeverity },
        queueSize: this.errorQueue.length,
        isOnline: this.isOnline
      }
    } catch (e) {
      console.warn('Failed to get error stats:', e)
      return {
        total: 0,
        recentHour: 0,
        dailyTotal: 0,
        byCategory: {},
        bySeverity: {},
        queueSize: this.errorQueue.length,
        isOnline: this.isOnline
      }
    }
  }

  /**
   * Clear error logs
   */
  clearErrorLogs() {
    this.errorQueue = []
    
    // Clear ErrorReporter data
    this.errorReporter.clearErrors()
    
    try {
      localStorage.removeItem('errorLogs')
    } catch (e) {
      console.warn('Failed to clear error logs:', e)
    }
  }

  /**
   * Add user feedback to an error
   * @param {string} errorId - Error ID
   * @param {Object} feedback - User feedback data
   * @returns {boolean} Success status
   */
  addUserFeedback(errorId, feedback) {
    return this.errorReporter.addUserFeedback(errorId, feedback)
  }

  /**
   * Mark an error as resolved
   * @param {string} errorId - Error ID
   * @returns {boolean} Success status
   */
  markErrorResolved(errorId) {
    return this.errorReporter.markErrorResolved(errorId)
  }

  /**
   * Get errors with filtering options
   * @param {Object} filters - Filter criteria
   * @returns {Array} Filtered errors
   */
  getErrors(filters = {}) {
    return this.errorReporter.getErrors(filters)
  }

  /**
   * Export error data for analysis
   * @param {Object} options - Export options
   * @returns {Object} Exported error data
   */
  exportErrors(options = {}) {
    return this.errorReporter.exportErrors(options)
  }

  /**
   * Add error event listener
   * @param {Function} listener - Callback function
   */
  addErrorListener(listener) {
    this.errorReporter.addListener(listener)
  }

  /**
   * Remove error event listener
   * @param {Function} listener - Callback function
   */
  removeErrorListener(listener) {
    this.errorReporter.removeListener(listener)
  }

  /**
   * Create user-friendly error message
   * @param {Error} error - The error
   * @param {Object} context - Additional context
   * @returns {string} User-friendly message
   */
  getUserFriendlyMessage(error, context = {}) {
    // Network errors
    if (error.name === 'NetworkError' || error.code === 'NETWORK_ERROR') {
      return 'Unable to connect to the server. Please check your internet connection and try again.'
    }
    
    // Timeout errors
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return 'The request took too long to complete. Please try again.'
    }
    
    // API errors
    if (error.status) {
      switch (error.status) {
        case 400:
          return 'Invalid request. Please check your input and try again.'
        case 401:
          return 'Authentication required. Please log in and try again.'
        case 403:
          return 'You don\'t have permission to perform this action.'
        case 404:
          return 'The requested resource was not found.'
        case 429:
          return 'Too many requests. Please wait a moment and try again.'
        case 500:
          return 'Server error. Please try again later.'
        case 503:
          return 'Service temporarily unavailable. Please try again later.'
        default:
          return `Server error (${error.status}). Please try again later.`
      }
    }
    
    // Validation errors
    if (context.category === ErrorCategory.VALIDATION) {
      return error.message || 'Please check your input and try again.'
    }
    
    // Default fallback
    return 'An unexpected error occurred. Please try again.'
  }
}

// Create singleton instance
const errorService = new ErrorService()

// Convenience functions
export const logError = (error, options) => errorService.logError(error, options)
export const getUserFriendlyMessage = (error, context) => errorService.getUserFriendlyMessage(error, context)
export const getErrorStats = () => errorService.getErrorStats()
export const clearErrorLogs = () => errorService.clearErrorLogs()
export const addUserFeedback = (errorId, feedback) => errorService.addUserFeedback(errorId, feedback)
export const markErrorResolved = (errorId) => errorService.markErrorResolved(errorId)
export const getErrors = (filters) => errorService.getErrors(filters)
export const exportErrors = (options) => errorService.exportErrors(options)
export const addErrorListener = (listener) => errorService.addErrorListener(listener)
export const removeErrorListener = (listener) => errorService.removeErrorListener(listener)

export default errorService