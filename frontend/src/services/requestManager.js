/**
 * Enhanced Request Manager with timeout, cancellation, and queue management
 */

import { logError, ErrorCategory, ErrorSeverity } from './errorService'
import { RequestQueue, REQUEST_PRIORITY, QueueError } from './requestQueue'

// Request timeout configurations
export const TIMEOUT_CONFIG = {
  chat: 30000,      // 30s for chat messages
  health: 5000,     // 5s for health checks
  default: 15000,   // 15s default timeout
  upload: 60000     // 60s for file uploads
}

// Request status constants
export const REQUEST_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled'
}

class RequestManager {
  constructor() {
    this.activeRequests = new Map()
    this.requestHistory = []
    this.maxHistorySize = 100
    this.globalTimeout = TIMEOUT_CONFIG.default
    this.requestIdCounter = 0
    
    // Initialize request queue with concurrency control
    this.queue = new RequestQueue({
      maxConcurrentRequests: 6,
      maxQueueSize: 50,
      batchSize: 3,
      batchDelay: 100
    })
    
    // Listen to queue events
    this.queue.on('requestComplete', (data) => {
      this._handleQueueRequestComplete(data)
    })
    
    this.queue.on('overflow', (data) => {
      logError(new Error('Request queue overflow'), {
        category: ErrorCategory.PERFORMANCE,
        severity: ErrorSeverity.HIGH,
        context: 'request_manager_queue',
        additionalData: data
      })
    })

    this.queue.on('statusChange', (data) => {
      // Log queue status changes for monitoring
      if (data.newStatus === 'overflow') {
        console.warn('[RequestManager] Queue overflow detected')
      }
    })
  }

  /**
   * Make an HTTP request with enhanced error handling and timeout
   * @param {Object} config - Axios request configuration
   * @param {Object} options - Additional options
   * @returns {Promise} Request promise
   */
  async makeRequest(config, options = {}) {
    const requestId = this._generateRequestId()
    const timeout = options.timeout || this._getTimeoutForRequest(config)
    const priority = this._mapPriorityToQueue(options.priority || this._getPriorityForRequest(config))
    
    // Create abort controller for cancellation
    const abortController = new AbortController()
    
    // Create request metadata
    const requestMeta = {
      id: requestId,
      url: config.url,
      method: config.method || 'GET',
      status: REQUEST_STATUS.PENDING,
      startTime: Date.now(),
      endTime: null,
      retryCount: 0,
      timeout,
      priority,
      abortController,
      config: { ...config },
      options
    }

    // Add abort signal to config
    config.signal = abortController.signal

    // Check for duplicate requests
    if (options.deduplicate !== false) {
      const duplicateRequest = this._findDuplicateRequest(config)
      if (duplicateRequest) {
        return duplicateRequest.promise
      }
    }

    // Add to active requests tracking
    this.activeRequests.set(requestId, requestMeta)

    // Create request function for the queue
    const requestFunction = () => this._executeRequest(requestMeta, config, options)

    // Determine if request should be batched
    const batchable = options.batchable || this._isBatchableRequest(config)

    try {
      // Queue the request with proper priority and options
      const result = await this.queue.enqueue(requestFunction, {
        priority,
        timeout,
        batchable,
        maxRetries: options.maxRetries || 2
      })

      return result
    } catch (error) {
      // Handle queue errors
      if (error instanceof QueueError) {
        requestMeta.status = REQUEST_STATUS.ERROR
        requestMeta.error = error
        
        logError(error, {
          category: ErrorCategory.PERFORMANCE,
          severity: ErrorSeverity.MEDIUM,
          context: 'request_manager_queue',
          additionalData: {
            requestId,
            queueError: error.code,
            url: config.url
          }
        })
        
        throw new RequestError(error.message, error.code, requestMeta, error)
      }
      
      throw error
    } finally {
      // Clean up will be handled by queue completion callback
    }
  }

  /**
   * Execute the actual request with timeout and error handling
   * @private
   */
  async _executeRequest(requestMeta, config, options) {
    const { id, timeout, abortController } = requestMeta

    try {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        abortController.abort()
        requestMeta.status = REQUEST_STATUS.TIMEOUT
      }, timeout)

      // Import axios dynamically to avoid circular dependencies
      const axios = (await import('axios')).default
      
      // Make the request
      const response = await axios(config)
      
      // Clear timeout
      clearTimeout(timeoutId)
      
      // Update status
      requestMeta.status = REQUEST_STATUS.SUCCESS
      requestMeta.response = response
      
      return response

    } catch (error) {
      // Handle different error types
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        requestMeta.status = REQUEST_STATUS.CANCELLED
        throw new RequestError('Request was cancelled', 'CANCELLED', requestMeta)
      }

      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        requestMeta.status = REQUEST_STATUS.TIMEOUT
        throw new RequestError('Request timed out', 'TIMEOUT', requestMeta)
      }

      requestMeta.status = REQUEST_STATUS.ERROR
      requestMeta.error = error

      // Log error
      logError(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        context: 'request_manager',
        additionalData: {
          requestId: id,
          url: config.url,
          method: config.method,
          timeout
        }
      })

      throw new RequestError(error.message, 'NETWORK_ERROR', requestMeta, error)
    }
  }

  /**
   * Cancel a specific request
   * @param {string} requestId - Request ID to cancel
   */
  cancelRequest(requestId) {
    const request = this.activeRequests.get(requestId)
    if (request) {
      request.abortController.abort()
      request.status = REQUEST_STATUS.CANCELLED
      return true
    }
    return false
  }

  /**
   * Cancel all active requests
   */
  cancelAllRequests() {
    const cancelledCount = this.activeRequests.size
    
    // Cancel requests in the queue
    this.queue.clear()
    
    // Cancel active requests
    for (const [requestId, request] of this.activeRequests) {
      request.abortController.abort()
      request.status = REQUEST_STATUS.CANCELLED
    }
    
    this.activeRequests.clear()
    return cancelledCount
  }

  /**
   * Get all active requests
   */
  getActiveRequests() {
    return Array.from(this.activeRequests.values()).map(request => ({
      id: request.id,
      url: request.url,
      method: request.method,
      status: request.status,
      startTime: request.startTime,
      timeout: request.timeout,
      priority: request.priority
    }))
  }

  /**
   * Get request history
   */
  getRequestHistory() {
    return [...this.requestHistory]
  }

  /**
   * Set global timeout for all requests
   */
  setGlobalTimeout(timeout) {
    this.globalTimeout = timeout
  }

  /**
   * Check if there are any active requests
   */
  hasActiveRequests() {
    return this.activeRequests.size > 0
  }

  /**
   * Get request statistics
   */
  getStats() {
    const active = this.activeRequests.size
    const history = this.requestHistory
    const successful = history.filter(r => r.status === REQUEST_STATUS.SUCCESS).length
    const failed = history.filter(r => r.status === REQUEST_STATUS.ERROR).length
    const cancelled = history.filter(r => r.status === REQUEST_STATUS.CANCELLED).length
    const timedOut = history.filter(r => r.status === REQUEST_STATUS.TIMEOUT).length

    // Get queue statistics
    const queueStats = this.queue.getStatus()

    return {
      active,
      total: history.length,
      successful,
      failed,
      cancelled,
      timedOut,
      successRate: history.length > 0 ? (successful / history.length) * 100 : 0,
      queue: {
        status: queueStats.status,
        activeRequests: queueStats.activeRequests,
        queueSizes: queueStats.queueSizes,
        pendingBatch: queueStats.pendingBatch,
        stats: queueStats.stats
      }
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return this.queue.getStatus()
  }

  /**
   * Pause request queue processing
   */
  pauseQueue() {
    this.queue.pause()
  }

  /**
   * Resume request queue processing
   */
  resumeQueue() {
    this.queue.resume()
  }

  /**
   * Clear request queue
   */
  clearQueue() {
    this.queue.clear()
  }

  /**
   * Generate unique request ID
   * @private
   */
  _generateRequestId() {
    return `req_${Date.now()}_${++this.requestIdCounter}`
  }

  /**
   * Get timeout for specific request type
   * @private
   */
  _getTimeoutForRequest(config) {
    const url = config.url || ''
    
    if (url.includes('/chat')) return TIMEOUT_CONFIG.chat
    if (url.includes('/health')) return TIMEOUT_CONFIG.health
    if (url.includes('/upload')) return TIMEOUT_CONFIG.upload
    
    return this.globalTimeout
  }

  /**
   * Get priority for specific request type
   * @private
   */
  _getPriorityForRequest(config) {
    const url = config.url || ''
    
    // Chat messages get high priority
    if (url.includes('/chat') && config.method === 'POST') {
      return 'high'
    }
    
    // Health checks get low priority
    if (url.includes('/health')) {
      return 'low'
    }
    
    // User-initiated actions get normal priority
    return 'normal'
  }

  /**
   * Map priority string to queue priority constants
   * @private
   */
  _mapPriorityToQueue(priority) {
    switch (priority) {
      case 'high':
        return REQUEST_PRIORITY.HIGH
      case 'low':
        return REQUEST_PRIORITY.LOW
      case 'normal':
      default:
        return REQUEST_PRIORITY.NORMAL
    }
  }

  /**
   * Determine if a request can be batched
   * @private
   */
  _isBatchableRequest(config) {
    const url = config.url || ''
    const method = config.method || 'GET'
    
    // Health checks can be batched
    if (url.includes('/health') && method === 'GET') {
      return true
    }
    
    // Analytics or logging requests can be batched
    if (url.includes('/analytics') || url.includes('/logs')) {
      return true
    }
    
    // GET requests for similar resources can be batched
    if (method === 'GET' && (url.includes('/status') || url.includes('/metrics'))) {
      return true
    }
    
    return false
  }

  /**
   * Find duplicate request
   * @private
   */
  _findDuplicateRequest(config) {
    const key = `${config.method || 'GET'}_${config.url}`
    
    for (const [id, request] of this.activeRequests) {
      const requestKey = `${request.method}_${request.url}`
      if (requestKey === key && request.status === REQUEST_STATUS.PENDING) {
        return request
      }
    }
    
    return null
  }

  /**
   * Add request to history
   * @private
   */
  _addToHistory(requestMeta) {
    const historyEntry = {
      id: requestMeta.id,
      url: requestMeta.url,
      method: requestMeta.method,
      status: requestMeta.status,
      startTime: requestMeta.startTime,
      endTime: requestMeta.endTime,
      duration: requestMeta.endTime - requestMeta.startTime,
      retryCount: requestMeta.retryCount,
      error: requestMeta.error ? {
        message: requestMeta.error.message,
        code: requestMeta.error.code,
        status: requestMeta.error.response?.status
      } : null
    }

    this.requestHistory.unshift(historyEntry)
    
    // Limit history size
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory = this.requestHistory.slice(0, this.maxHistorySize)
    }
  }

  /**
   * Handle queue request completion
   * @private
   */
  _handleQueueRequestComplete(data) {
    const { request, success } = data
    
    // Find the corresponding request metadata
    let requestMeta = null
    for (const [id, meta] of this.activeRequests) {
      if (meta.id === request.id) {
        requestMeta = meta
        break
      }
    }
    
    if (requestMeta) {
      requestMeta.endTime = Date.now()
      
      if (success) {
        requestMeta.status = REQUEST_STATUS.SUCCESS
      } else {
        requestMeta.status = REQUEST_STATUS.ERROR
      }
      
      // Remove from active requests and add to history
      this.activeRequests.delete(requestMeta.id)
      this._addToHistory(requestMeta)
    }
  }
}

/**
 * Custom error class for request errors
 */
export class RequestError extends Error {
  constructor(message, code, requestMeta, originalError = null) {
    super(message)
    this.name = 'RequestError'
    this.code = code
    this.requestMeta = requestMeta
    this.originalError = originalError
  }

  isTimeout() {
    return this.code === 'TIMEOUT'
  }

  isCancelled() {
    return this.code === 'CANCELLED'
  }

  isNetworkError() {
    return this.code === 'NETWORK_ERROR'
  }
}

// Export the class for testing
export { RequestManager }

// Create singleton instance
export const requestManager = new RequestManager()

export default requestManager