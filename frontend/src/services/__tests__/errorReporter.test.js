import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import errorReporter, { ErrorReporter, ERROR_SEVERITY, ERROR_CATEGORY } from '../errorReporter';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock console methods
const consoleMock = {
  group: vi.fn(),
  groupEnd: vi.fn(),
  log: vi.fn(),
  warn: vi.fn()
};

Object.defineProperty(window, 'console', {
  value: consoleMock
});

describe('ErrorReporter', () => {
  let reporter;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    
    // Create fresh instance for each test
    reporter = new ErrorReporter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(reporter.listeners).toEqual([]);
      expect(reporter.errorQueue).toEqual([]);
      expect(reporter.maxStoredErrors).toBe(100);
      expect(reporter.isInitialized).toBe(true);
      expect(reporter.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
    });

    it('should set up global error handlers', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      new ErrorReporter();
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    });

    it('should generate unique session IDs', () => {
      const reporter1 = new ErrorReporter();
      const reporter2 = new ErrorReporter();
      
      expect(reporter1.sessionId).not.toBe(reporter2.sessionId);
    });
  });

  describe('Error Reporting', () => {
    it('should report basic error with required fields', () => {
      const errorData = {
        type: ERROR_CATEGORY.NETWORK,
        message: 'Network request failed',
        severity: ERROR_SEVERITY.HIGH
      };

      const errorId = reporter.reportError(errorData);

      expect(errorId).toMatch(/^error_\d+_[a-z0-9]+$/);
      expect(reporter.errorQueue).toHaveLength(1);
      
      const reportedError = reporter.errorQueue[0];
      expect(reportedError.type).toBe(ERROR_CATEGORY.NETWORK);
      expect(reportedError.message).toBe('Network request failed');
      expect(reportedError.severity).toBe(ERROR_SEVERITY.HIGH);
      expect(reportedError.sessionId).toBe(reporter.sessionId);
    });

    it('should create error report with context information', () => {
      const errorData = {
        type: ERROR_CATEGORY.RUNTIME,
        message: 'Runtime error occurred',
        context: { component: 'ChatInterface', action: 'sendMessage' }
      };

      reporter.reportError(errorData);
      const reportedError = reporter.errorQueue[0];

      expect(reportedError.context).toMatchObject({
        component: 'ChatInterface',
        action: 'sendMessage',
        url: expect.any(String),
        userAgent: expect.any(String),
        timestamp: expect.any(String),
        viewport: {
          width: expect.any(Number),
          height: expect.any(Number)
        }
      });
    });

    it('should use default values for missing fields', () => {
      const errorData = {
        message: 'Simple error'
      };

      reporter.reportError(errorData);
      const reportedError = reporter.errorQueue[0];

      expect(reportedError.type).toBe(ERROR_CATEGORY.SYSTEM);
      expect(reportedError.severity).toBe(ERROR_SEVERITY.MEDIUM);
      expect(reportedError.resolved).toBe(false);
      expect(reportedError.userFeedback).toBe(null);
    });

    it('should handle error with stack trace', () => {
      const errorData = {
        type: ERROR_CATEGORY.RUNTIME,
        message: 'Error with stack',
        stack: 'Error: Test error\n    at test.js:1:1',
        filename: 'test.js',
        lineno: 1,
        colno: 1
      };

      reporter.reportError(errorData);
      const reportedError = reporter.errorQueue[0];

      expect(reportedError.stack).toBe('Error: Test error\n    at test.js:1:1');
      expect(reportedError.filename).toBe('test.js');
      expect(reportedError.lineno).toBe(1);
      expect(reportedError.colno).toBe(1);
    });
  });

  describe('Error Persistence', () => {
    it('should persist errors to localStorage', () => {
      const errorData = {
        type: ERROR_CATEGORY.API,
        message: 'API error'
      };

      reporter.reportError(errorData);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'error_log',
        expect.stringContaining('"type":"api"')
      );
    });

    it('should retrieve stored errors', () => {
      const storedErrors = [
        { id: 'error1', message: 'Error 1' },
        { id: 'error2', message: 'Error 2' }
      ];
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify(storedErrors));

      const errors = reporter.getStoredErrors();

      expect(errors).toEqual(storedErrors);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('error_log');
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const errorData = { message: 'Test error' };
      
      expect(() => reporter.reportError(errorData)).not.toThrow();
      expect(consoleMock.warn).toHaveBeenCalledWith(
        'Failed to persist error to localStorage:',
        expect.any(Error)
      );
    });

    it('should limit stored errors to maxStoredErrors', () => {
      reporter.maxStoredErrors = 2;
      
      // Mock existing errors
      const existingErrors = [
        { id: 'error1', message: 'Error 1' },
        { id: 'error2', message: 'Error 2' }
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(existingErrors));

      reporter.reportError({ message: 'New error' });

      const setItemCall = localStorageMock.setItem.mock.calls[1]; // Second call (first is stats)
      const storedData = JSON.parse(setItemCall[1]);
      
      expect(storedData).toHaveLength(2);
      expect(storedData[0].id).toBe('error2'); // First error should be removed
      expect(storedData[1].message).toBe('New error');
    });
  });

  describe('Error Statistics', () => {
    it('should update error statistics', () => {
      const errorData = {
        type: ERROR_CATEGORY.NETWORK,
        severity: ERROR_SEVERITY.HIGH,
        message: 'Network error'
      };

      reporter.reportError(errorData);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'error_stats',
        expect.stringContaining('"totalErrors":1')
      );
    });

    it('should track errors by type and severity', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'error_stats') {
          return JSON.stringify({
            totalErrors: 0,
            errorsByType: {},
            errorsBySeverity: {},
            recentErrors: [],
            sessionId: reporter.sessionId
          });
        }
        return null;
      });

      reporter.reportError({
        type: ERROR_CATEGORY.NETWORK,
        severity: ERROR_SEVERITY.HIGH,
        message: 'Error 1'
      });

      reporter.reportError({
        type: ERROR_CATEGORY.NETWORK,
        severity: ERROR_SEVERITY.MEDIUM,
        message: 'Error 2'
      });

      const statsCall = localStorageMock.setItem.mock.calls.find(call => call[0] === 'error_stats');
      const stats = JSON.parse(statsCall[1]);

      expect(stats.totalErrors).toBe(2);
      expect(stats.errorsByType.network).toBe(2);
      expect(stats.errorsBySeverity.high).toBe(1);
      expect(stats.errorsBySeverity.medium).toBe(1);
    });

    it('should maintain recent errors list', () => {
      const errorData = { message: 'Recent error' };
      
      reporter.reportError(errorData);

      const statsCall = localStorageMock.setItem.mock.calls.find(call => call[0] === 'error_stats');
      const stats = JSON.parse(statsCall[1]);

      expect(stats.recentErrors).toHaveLength(1);
      expect(stats.recentErrors[0]).toMatchObject({
        id: expect.any(String),
        timestamp: expect.any(String),
        type: ERROR_CATEGORY.SYSTEM,
        severity: ERROR_SEVERITY.MEDIUM
      });
    });
  });

  describe('User Feedback', () => {
    it('should add user feedback to error', () => {
      const errorData = { message: 'Test error' };
      const errorId = reporter.reportError(errorData);

      const feedback = {
        rating: 3,
        description: 'Error was confusing',
        helpful: false
      };

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'error_log') {
          return JSON.stringify([{
            id: errorId,
            message: 'Test error',
            userFeedback: null
          }]);
        }
        return null;
      });

      const result = reporter.addUserFeedback(errorId, feedback);

      expect(result).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'error_log',
        expect.stringContaining('"rating":3')
      );
    });

    it('should store user feedback separately', () => {
      const errorId = 'test-error-id';
      const feedback = { rating: 4, description: 'Good error message' };

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'error_log') {
          return JSON.stringify([{ id: errorId, message: 'Test' }]);
        }
        if (key === 'user_feedback') {
          return JSON.stringify([]);
        }
        return null;
      });

      reporter.addUserFeedback(errorId, feedback);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'user_feedback',
        expect.stringContaining('"errorId":"test-error-id"')
      );
    });

    it('should return false for non-existent error ID', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify([]));

      const result = reporter.addUserFeedback('non-existent', { rating: 5 });

      expect(result).toBe(false);
    });
  });

  describe('Error Resolution', () => {
    it('should mark error as resolved', () => {
      const errorId = 'test-error-id';
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify([
        { id: errorId, message: 'Test error', resolved: false }
      ]));

      const result = reporter.markErrorResolved(errorId);

      expect(result).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'error_log',
        expect.stringContaining('"resolved":true')
      );
    });

    it('should add resolved timestamp', () => {
      const errorId = 'test-error-id';
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify([
        { id: errorId, message: 'Test error', resolved: false }
      ]));

      reporter.markErrorResolved(errorId);

      const setItemCall = localStorageMock.setItem.mock.calls.find(call => call[0] === 'error_log');
      const errors = JSON.parse(setItemCall[1]);
      
      expect(errors[0].resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Error Filtering', () => {
    beforeEach(() => {
      const mockErrors = [
        {
          id: 'error1',
          type: ERROR_CATEGORY.NETWORK,
          severity: ERROR_SEVERITY.HIGH,
          resolved: false,
          sessionId: 'session1',
          timestamp: '2024-01-01T10:00:00Z'
        },
        {
          id: 'error2',
          type: ERROR_CATEGORY.RUNTIME,
          severity: ERROR_SEVERITY.MEDIUM,
          resolved: true,
          sessionId: 'session1',
          timestamp: '2024-01-01T11:00:00Z'
        },
        {
          id: 'error3',
          type: ERROR_CATEGORY.NETWORK,
          severity: ERROR_SEVERITY.LOW,
          resolved: false,
          sessionId: 'session2',
          timestamp: '2024-01-01T12:00:00Z'
        }
      ];
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockErrors));
    });

    it('should filter errors by type', () => {
      const errors = reporter.getErrors({ type: ERROR_CATEGORY.NETWORK });
      
      expect(errors).toHaveLength(2);
      expect(errors.every(error => error.type === ERROR_CATEGORY.NETWORK)).toBe(true);
    });

    it('should filter errors by severity', () => {
      const errors = reporter.getErrors({ severity: ERROR_SEVERITY.HIGH });
      
      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe(ERROR_SEVERITY.HIGH);
    });

    it('should filter errors by resolved status', () => {
      const unresolvedErrors = reporter.getErrors({ resolved: false });
      const resolvedErrors = reporter.getErrors({ resolved: true });
      
      expect(unresolvedErrors).toHaveLength(2);
      expect(resolvedErrors).toHaveLength(1);
    });

    it('should filter errors by session ID', () => {
      const errors = reporter.getErrors({ sessionId: 'session1' });
      
      expect(errors).toHaveLength(2);
      expect(errors.every(error => error.sessionId === 'session1')).toBe(true);
    });

    it('should filter errors by date range', () => {
      const errors = reporter.getErrors({
        since: '2024-01-01T10:30:00Z',
        until: '2024-01-01T11:30:00Z'
      });
      
      expect(errors).toHaveLength(1);
      expect(errors[0].id).toBe('error2');
    });

    it('should combine multiple filters', () => {
      const errors = reporter.getErrors({
        type: ERROR_CATEGORY.NETWORK,
        resolved: false
      });
      
      expect(errors).toHaveLength(2);
      expect(errors.every(error => 
        error.type === ERROR_CATEGORY.NETWORK && error.resolved === false
      )).toBe(true);
    });
  });

  describe('Event Listeners', () => {
    it('should add and notify listeners', () => {
      const listener = vi.fn();
      reporter.addListener(listener);

      const errorData = { message: 'Test error' };
      reporter.reportError(errorData);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Test error'
      }));
    });

    it('should remove listeners', () => {
      const listener = vi.fn();
      reporter.addListener(listener);
      reporter.removeListener(listener);

      reporter.reportError({ message: 'Test error' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      
      reporter.addListener(faultyListener);
      
      expect(() => reporter.reportError({ message: 'Test' })).not.toThrow();
      expect(consoleMock.warn).toHaveBeenCalledWith(
        'Error in error reporter listener:',
        expect.any(Error)
      );
    });
  });

  describe('Data Management', () => {
    it('should clear all errors and statistics', () => {
      reporter.errorQueue = [{ id: 'test' }];
      
      const result = reporter.clearErrors();

      expect(result).toBe(true);
      expect(reporter.errorQueue).toEqual([]);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('error_log');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('error_stats');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user_feedback');
    });

    it('should export error data', () => {
      const mockErrors = [{ id: 'error1', message: 'Test' }];
      const mockStats = { totalErrors: 1 };
      const mockFeedback = [{ errorId: 'error1', rating: 5 }];

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'error_log') return JSON.stringify(mockErrors);
        if (key === 'error_stats') return JSON.stringify(mockStats);
        if (key === 'user_feedback') return JSON.stringify(mockFeedback);
        return null;
      });

      const exportData = reporter.exportErrors();

      expect(exportData).toMatchObject({
        errors: mockErrors,
        statistics: mockStats,
        userFeedback: mockFeedback,
        exportedAt: expect.any(String),
        sessionId: reporter.sessionId
      });
    });
  });

  describe('Console Logging', () => {
    beforeEach(() => {
      // Set development environment
      process.env.NODE_ENV = 'development';
    });

    it('should log to console in development', () => {
      const errorData = {
        type: ERROR_CATEGORY.NETWORK,
        severity: ERROR_SEVERITY.HIGH,
        message: 'Network error'
      };

      reporter.reportError(errorData);

      expect(consoleMock.group).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorReporter] NETWORK - HIGH'),
        expect.any(String)
      );
      expect(consoleMock.log).toHaveBeenCalledWith('Message:', 'Network error');
      expect(consoleMock.groupEnd).toHaveBeenCalled();
    });

    it('should use different styles for different severities', () => {
      const severities = [
        ERROR_SEVERITY.LOW,
        ERROR_SEVERITY.MEDIUM,
        ERROR_SEVERITY.HIGH,
        ERROR_SEVERITY.CRITICAL
      ];

      severities.forEach(severity => {
        reporter.reportError({
          message: `${severity} error`,
          severity
        });
      });

      expect(consoleMock.group).toHaveBeenCalledTimes(4);
      
      // Check that different styles are used
      const groupCalls = consoleMock.group.mock.calls;
      const styles = groupCalls.map(call => call[1]);
      
      expect(new Set(styles).size).toBe(4); // All different styles
    });
  });

  describe('Global Error Handlers', () => {
    it('should handle window error events', () => {
      const reportErrorSpy = vi.spyOn(reporter, 'reportError');
      
      // Simulate window error event
      const errorEvent = new ErrorEvent('error', {
        message: 'Script error',
        filename: 'app.js',
        lineno: 42,
        colno: 10,
        error: new Error('Test error')
      });

      window.dispatchEvent(errorEvent);

      expect(reportErrorSpy).toHaveBeenCalledWith({
        type: ERROR_CATEGORY.RUNTIME,
        message: 'Script error',
        filename: 'app.js',
        lineno: 42,
        colno: 10,
        stack: expect.any(String),
        severity: ERROR_SEVERITY.HIGH
      });
    });

    it('should handle unhandled promise rejections', () => {
      const reportErrorSpy = vi.spyOn(reporter, 'reportError');
      
      // Simulate unhandled promise rejection
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.reject('Promise error'),
        reason: 'Promise error'
      });

      window.dispatchEvent(rejectionEvent);

      expect(reportErrorSpy).toHaveBeenCalledWith({
        type: ERROR_CATEGORY.RUNTIME,
        message: 'Unhandled Promise Rejection: Promise error',
        stack: undefined,
        severity: ERROR_SEVERITY.MEDIUM,
        context: { reason: 'Promise error' }
      });
    });
  });
});

describe('Singleton Instance', () => {
  it('should export singleton instance', () => {
    expect(errorReporter).toBeInstanceOf(ErrorReporter);
  });

  it('should maintain same instance across imports', () => {
    const instance1 = errorReporter;
    const instance2 = errorReporter;
    
    expect(instance1).toBe(instance2);
  });
});

describe('Constants', () => {
  it('should export error severity constants', () => {
    expect(ERROR_SEVERITY).toEqual({
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    });
  });

  it('should export error category constants', () => {
    expect(ERROR_CATEGORY).toEqual({
      NETWORK: 'network',
      RUNTIME: 'runtime',
      RENDER: 'render',
      TIMEOUT: 'timeout',
      API: 'api',
      PROXY: 'proxy',
      USER_INPUT: 'user_input',
      SYSTEM: 'system'
    });
  });
});