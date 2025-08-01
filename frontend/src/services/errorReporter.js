/**
 * ErrorReporter - Centralized error collection and reporting service
 * Provides structured error logging with context information, categorization,
 * severity levels, and persistence for debugging and analysis.
 */

// Error severity levels
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Error categories
export const ERROR_CATEGORY = {
  NETWORK: 'network',
  RUNTIME: 'runtime',
  RENDER: 'render',
  TIMEOUT: 'timeout',
  API: 'api',
  PROXY: 'proxy',
  USER_INPUT: 'user_input',
  SYSTEM: 'system'
};

// Error storage keys
const STORAGE_KEYS = {
  ERROR_LOG: 'error_log',
  ERROR_STATS: 'error_stats',
  USER_FEEDBACK: 'user_feedback'
};

class ErrorReporter {
  constructor() {
    this.listeners = [];
    this.errorQueue = [];
    this.maxStoredErrors = 100;
    this.isInitialized = false;
    this.sessionId = this.generateSessionId();
    
    this.init();
  }

  init() {
    if (this.isInitialized) return;
    
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
    
    // Initialize error statistics
    this.initializeErrorStats();
    
    this.isInitialized = true;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  setupGlobalErrorHandlers() {
    // Handle unhandled JavaScript errors
    window.addEventListener('error', (event) => {
      this.reportError({
        type: ERROR_CATEGORY.RUNTIME,
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        severity: ERROR_SEVERITY.HIGH
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.reportError({
        type: ERROR_CATEGORY.RUNTIME,
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        severity: ERROR_SEVERITY.MEDIUM,
        context: { reason: event.reason }
      });
    });
  }

  /**
   * Report an error with structured logging
   * @param {Object} errorData - Error information
   * @param {string} errorData.type - Error category
   * @param {string} errorData.message - Error message
   * @param {string} errorData.severity - Error severity level
   * @param {Object} errorData.context - Additional context information
   * @param {string} errorData.stack - Stack trace
   * @param {Object} errorData.userAction - User action that triggered the error
   */
  reportError(errorData) {
    const errorReport = this.createErrorReport(errorData);
    
    // Add to error queue
    this.errorQueue.push(errorReport);
    
    // Persist error
    this.persistError(errorReport);
    
    // Update statistics
    this.updateErrorStats(errorReport);
    
    // Notify listeners
    this.notifyListeners(errorReport);
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      this.logToConsole(errorReport);
    }
    
    return errorReport.id;
  }

  createErrorReport(errorData) {
    const timestamp = new Date().toISOString();
    const id = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id,
      timestamp,
      sessionId: this.sessionId,
      type: errorData.type || ERROR_CATEGORY.SYSTEM,
      severity: errorData.severity || ERROR_SEVERITY.MEDIUM,
      message: errorData.message || 'Unknown error',
      stack: errorData.stack || null,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: timestamp,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        ...errorData.context
      },
      userAction: errorData.userAction || null,
      filename: errorData.filename || null,
      lineno: errorData.lineno || null,
      colno: errorData.colno || null,
      resolved: false,
      userFeedback: null
    };
  }

  persistError(errorReport) {
    try {
      const existingErrors = this.getStoredErrors();
      existingErrors.push(errorReport);
      
      // Keep only the most recent errors
      const trimmedErrors = existingErrors.slice(-this.maxStoredErrors);
      
      localStorage.setItem(STORAGE_KEYS.ERROR_LOG, JSON.stringify(trimmedErrors));
    } catch (e) {
      console.warn('Failed to persist error to localStorage:', e);
    }
  }

  getStoredErrors() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ERROR_LOG);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('Failed to retrieve stored errors:', e);
      return [];
    }
  }

  updateErrorStats(errorReport) {
    try {
      const stats = this.getErrorStats();
      
      // Update counters
      stats.totalErrors++;
      stats.errorsByType[errorReport.type] = (stats.errorsByType[errorReport.type] || 0) + 1;
      stats.errorsBySeverity[errorReport.severity] = (stats.errorsBySeverity[errorReport.severity] || 0) + 1;
      
      // Update recent errors
      stats.recentErrors.push({
        id: errorReport.id,
        timestamp: errorReport.timestamp,
        type: errorReport.type,
        severity: errorReport.severity
      });
      
      // Keep only recent errors (last 50)
      stats.recentErrors = stats.recentErrors.slice(-50);
      
      localStorage.setItem(STORAGE_KEYS.ERROR_STATS, JSON.stringify(stats));
    } catch (e) {
      console.warn('Failed to update error statistics:', e);
    }
  }

  getErrorStats() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ERROR_STATS);
      return stored ? JSON.parse(stored) : this.createEmptyStats();
    } catch (e) {
      return this.createEmptyStats();
    }
  }

  createEmptyStats() {
    return {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      recentErrors: [],
      sessionId: this.sessionId,
      lastUpdated: new Date().toISOString()
    };
  }

  initializeErrorStats() {
    const stats = this.getErrorStats();
    if (stats.sessionId !== this.sessionId) {
      // New session, reset recent errors but keep historical data
      stats.sessionId = this.sessionId;
      stats.recentErrors = [];
      localStorage.setItem(STORAGE_KEYS.ERROR_STATS, JSON.stringify(stats));
    }
  }

  logToConsole(errorReport) {
    const style = this.getConsoleStyle(errorReport.severity);
    console.group(`%c[ErrorReporter] ${errorReport.type.toUpperCase()} - ${errorReport.severity.toUpperCase()}`, style);
    console.log('Message:', errorReport.message);
    console.log('Timestamp:', errorReport.timestamp);
    console.log('Context:', errorReport.context);
    if (errorReport.stack) {
      console.log('Stack:', errorReport.stack);
    }
    console.groupEnd();
  }

  getConsoleStyle(severity) {
    const styles = {
      [ERROR_SEVERITY.LOW]: 'color: #666; font-weight: normal;',
      [ERROR_SEVERITY.MEDIUM]: 'color: #ff9800; font-weight: bold;',
      [ERROR_SEVERITY.HIGH]: 'color: #f44336; font-weight: bold;',
      [ERROR_SEVERITY.CRITICAL]: 'color: #d32f2f; font-weight: bold; background: #ffebee;'
    };
    return styles[severity] || styles[ERROR_SEVERITY.MEDIUM];
  }

  /**
   * Add user feedback to an error report
   * @param {string} errorId - Error ID
   * @param {Object} feedback - User feedback data
   */
  addUserFeedback(errorId, feedback) {
    try {
      const errors = this.getStoredErrors();
      const errorIndex = errors.findIndex(error => error.id === errorId);
      
      if (errorIndex !== -1) {
        errors[errorIndex].userFeedback = {
          ...feedback,
          timestamp: new Date().toISOString()
        };
        
        localStorage.setItem(STORAGE_KEYS.ERROR_LOG, JSON.stringify(errors));
        
        // Also store in separate user feedback collection
        this.storeUserFeedback(errorId, feedback);
        
        return true;
      }
      
      return false;
    } catch (e) {
      console.warn('Failed to add user feedback:', e);
      return false;
    }
  }

  storeUserFeedback(errorId, feedback) {
    try {
      const existingFeedback = this.getUserFeedback();
      existingFeedback.push({
        errorId,
        feedback,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId
      });
      
      localStorage.setItem(STORAGE_KEYS.USER_FEEDBACK, JSON.stringify(existingFeedback));
    } catch (e) {
      console.warn('Failed to store user feedback:', e);
    }
  }

  getUserFeedback() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.USER_FEEDBACK);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Mark an error as resolved
   * @param {string} errorId - Error ID
   */
  markErrorResolved(errorId) {
    try {
      const errors = this.getStoredErrors();
      const errorIndex = errors.findIndex(error => error.id === errorId);
      
      if (errorIndex !== -1) {
        errors[errorIndex].resolved = true;
        errors[errorIndex].resolvedAt = new Date().toISOString();
        
        localStorage.setItem(STORAGE_KEYS.ERROR_LOG, JSON.stringify(errors));
        return true;
      }
      
      return false;
    } catch (e) {
      console.warn('Failed to mark error as resolved:', e);
      return false;
    }
  }

  /**
   * Get errors filtered by criteria
   * @param {Object} filters - Filter criteria
   */
  getErrors(filters = {}) {
    const errors = this.getStoredErrors();
    
    return errors.filter(error => {
      if (filters.type && error.type !== filters.type) return false;
      if (filters.severity && error.severity !== filters.severity) return false;
      if (filters.resolved !== undefined && error.resolved !== filters.resolved) return false;
      if (filters.sessionId && error.sessionId !== filters.sessionId) return false;
      if (filters.since && new Date(error.timestamp) < new Date(filters.since)) return false;
      if (filters.until && new Date(error.timestamp) > new Date(filters.until)) return false;
      
      return true;
    });
  }

  /**
   * Clear all stored errors
   */
  clearErrors() {
    try {
      localStorage.removeItem(STORAGE_KEYS.ERROR_LOG);
      localStorage.removeItem(STORAGE_KEYS.ERROR_STATS);
      localStorage.removeItem(STORAGE_KEYS.USER_FEEDBACK);
      this.errorQueue = [];
      this.initializeErrorStats();
      return true;
    } catch (e) {
      console.warn('Failed to clear errors:', e);
      return false;
    }
  }

  /**
   * Add listener for error events
   * @param {Function} listener - Callback function
   */
  addListener(listener) {
    this.listeners.push(listener);
  }

  /**
   * Remove error event listener
   * @param {Function} listener - Callback function to remove
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  notifyListeners(errorReport) {
    this.listeners.forEach(listener => {
      try {
        listener(errorReport);
      } catch (e) {
        console.warn('Error in error reporter listener:', e);
      }
    });
  }

  /**
   * Export error data for analysis
   * @param {Object} options - Export options
   */
  exportErrors(options = {}) {
    const errors = this.getErrors(options.filters);
    const stats = this.getErrorStats();
    const feedback = this.getUserFeedback();
    
    return {
      errors,
      statistics: stats,
      userFeedback: feedback,
      exportedAt: new Date().toISOString(),
      sessionId: this.sessionId
    };
  }
}

// Create singleton instance
const errorReporter = new ErrorReporter();

export default errorReporter;
export { ErrorReporter };