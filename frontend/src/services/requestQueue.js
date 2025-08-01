/**
 * Request Queue Management with Concurrency Control and Prioritization
 */

import { logError, ErrorCategory, ErrorSeverity } from './errorService'

// Priority levels for requests
export const REQUEST_PRIORITY = {
  HIGH: 'high',      // Chat messages, user interactions
  NORMAL: 'normal',  // Regular API calls
  LOW: 'low'         // Health checks, background tasks
}

// Queue status constants
export const QUEUE_STATUS = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  OVERFLOW: 'overflow',
  PAUSED: 'paused'
}

/**
 * Request Queue Class for managing concurrent requests with prioritization
 */
export class RequestQueue {
  constructor(options = {}) {
    this.maxConcurrentRequests = options.maxConcurrentRequests || 6
    this.maxQueueSize = options.maxQueueSize || 50
    this.batchSize = options.batchSize || 3
    this.batchDelay = options.batchDelay || 100 // ms
    
    // Queue storage by priority
    this.queues = {
      [REQUEST_PRIORITY.HIGH]: [],
      [REQUEST_PRIORITY.NORMAL]: [],
      [REQUEST_PRIORITY.LOW]: []
    }
    
    this.activeRequests = new Map()
    this.status = QUEUE_STATUS.IDLE
    this.isPaused = false
    
    // Statistics
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      overflowCount: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0
    }
    
    // Event listeners
    this.listeners = {
      statusChange: [],
      overflow: [],
      empty: [],
      requestComplete: []
    }
    
    // Batch processing
    this.batchTimer = null
    this.pendingBatch = []
  }

  /**
   * Add request to queue
   * @param {Function} requestFn - Function that returns a promise
   * @param {Object} options - Request options
   * @returns {Promise} Promise that resolves when request completes
   */
  enqueue(requestFn, options = {}) {
    const priority = options.priority || REQUEST_PRIORITY.NORMAL
    const batchable = options.batchable || false
    const timeout = options.timeout || 45000  // Increased for MCP operations
    
    // Check queue size limits
    const totalQueueSize = this._getTotalQueueSize()
    if (totalQueueSize >= this.maxQueueSize) {
      this.stats.overflowCount++
      this._setStatus(QUEUE_STATUS.OVERFLOW)
      this._emit('overflow', { queueSize: totalQueueSize, maxSize: this.maxQueueSize })
      
      return Promise.reject(new QueueError('Queue overflow - too many pending requests', 'QUEUE_OVERFLOW'))
    }

    return new Promise((resolve, reject) => {
      const queueItem = {
        id: this._generateId(),
        requestFn,
        priority,
        batchable,
        timeout,
        resolve,
        reject,
        queuedAt: Date.now(),
        startedAt: null,
        completedAt: null,
        retryCount: options.retryCount || 0,
        maxRetries: options.maxRetries || 2
      }

      // Add to appropriate queue
      this.queues[priority].push(queueItem)
      this.stats.totalQueued++
      
      // Process queue
      this._processQueue()
    })
  }

  /**
   * Process the queue based on priority and concurrency limits
   * @private
   */
  _processQueue() {
    if (this.isPaused || this.activeRequests.size >= this.maxConcurrentRequests) {
      return
    }

    // Get next request based on priority
    const nextRequest = this._getNextRequest()
    if (!nextRequest) {
      if (this.activeRequests.size === 0) {
        this._setStatus(QUEUE_STATUS.IDLE)
        this._emit('empty')
      }
      return
    }

    // Handle batchable requests
    if (nextRequest.batchable) {
      this._handleBatchableRequest(nextRequest)
      return
    }

    // Process single request
    this._executeRequest(nextRequest)
  }

  /**
   * Get next request from queues based on priority
   * @private
   */
  _getNextRequest() {
    // Check high priority first
    if (this.queues[REQUEST_PRIORITY.HIGH].length > 0) {
      return this.queues[REQUEST_PRIORITY.HIGH].shift()
    }
    
    // Then normal priority
    if (this.queues[REQUEST_PRIORITY.NORMAL].length > 0) {
      return this.queues[REQUEST_PRIORITY.NORMAL].shift()
    }
    
    // Finally low priority
    if (this.queues[REQUEST_PRIORITY.LOW].length > 0) {
      return this.queues[REQUEST_PRIORITY.LOW].shift()
    }
    
    return null
  }

  /**
   * Handle batchable requests
   * @private
   */
  _handleBatchableRequest(request) {
    this.pendingBatch.push(request)
    
    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
    }
    
    // Process batch if it's full or after delay
    if (this.pendingBatch.length >= this.batchSize) {
      this._processBatch()
    } else {
      this.batchTimer = setTimeout(() => {
        this._processBatch()
      }, this.batchDelay)
    }
  }

  /**
   * Process batch of requests
   * @private
   */
  _processBatch() {
    if (this.pendingBatch.length === 0) return
    
    const batch = [...this.pendingBatch]
    this.pendingBatch = []
    this.batchTimer = null
    
    // Execute batch as a single request slot
    this._executeBatch(batch)
  }

  /**
   * Execute a batch of requests
   * @private
   */
  async _executeBatch(batch) {
    const batchId = this._generateId()
    this.activeRequests.set(batchId, { type: 'batch', requests: batch, startedAt: Date.now() })
    this._setStatus(QUEUE_STATUS.PROCESSING)
    
    try {
      // Execute all requests in parallel
      const promises = batch.map(request => {
        request.startedAt = Date.now()
        return this._executeRequestFunction(request)
      })
      
      const results = await Promise.allSettled(promises)
      
      // Handle results
      results.forEach((result, index) => {
        const request = batch[index]
        request.completedAt = Date.now()
        
        if (result.status === 'fulfilled') {
          request.resolve(result.value)
          this._updateStats(request, true)
        } else {
          this._handleRequestError(request, result.reason)
        }
      })
      
    } catch (error) {
      // Handle batch error
      batch.forEach(request => {
        this._handleRequestError(request, error)
      })
    } finally {
      this.activeRequests.delete(batchId)
      this._processQueue()
    }
  }

  /**
   * Execute a single request
   * @private
   */
  async _executeRequest(request) {
    const requestId = request.id
    request.startedAt = Date.now()
    
    this.activeRequests.set(requestId, request)
    this._setStatus(QUEUE_STATUS.PROCESSING)
    
    try {
      const result = await this._executeRequestFunction(request)
      request.completedAt = Date.now()
      request.resolve(result)
      this._updateStats(request, true)
      
    } catch (error) {
      this._handleRequestError(request, error)
      
    } finally {
      this.activeRequests.delete(requestId)
      this._processQueue()
    }
  }

  /**
   * Execute the actual request function with timeout
   * @private
   */
  async _executeRequestFunction(request) {
    return new Promise(async (resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        reject(new QueueError('Request timeout', 'TIMEOUT'))
      }, request.timeout)
      
      try {
        const result = await request.requestFn()
        clearTimeout(timeoutId)
        resolve(result)
      } catch (error) {
        clearTimeout(timeoutId)
        reject(error)
      }
    })
  }

  /**
   * Handle request error with retry logic
   * @private
   */
  _handleRequestError(request, error) {
    request.completedAt = Date.now()
    
    // Check if we should retry
    if (request.retryCount < request.maxRetries && this._shouldRetry(error)) {
      request.retryCount++
      
      // Re-queue with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, request.retryCount), 10000)
      setTimeout(() => {
        this.queues[request.priority].unshift(request)
        this._processQueue()
      }, delay)
      
      return
    }
    
    // Final failure
    request.reject(error)
    this._updateStats(request, false)
    
    logError(error, {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      context: 'request_queue',
      additionalData: {
        requestId: request.id,
        priority: request.priority,
        retryCount: request.retryCount,
        queuedAt: request.queuedAt,
        startedAt: request.startedAt
      }
    })
  }

  /**
   * Check if error is retryable
   * @private
   */
  _shouldRetry(error) {
    if (error.code === 'TIMEOUT') return true
    if (error.code === 'NETWORK_ERROR') return true
    if (error.response?.status >= 500) return true
    return false
  }

  /**
   * Update statistics
   * @private
   */
  _updateStats(request, success) {
    this.stats.totalProcessed++
    
    if (!success) {
      this.stats.totalFailed++
    }
    
    // Calculate wait time
    const waitTime = request.startedAt - request.queuedAt
    this.stats.averageWaitTime = (this.stats.averageWaitTime + waitTime) / 2
    
    // Calculate processing time
    if (request.completedAt) {
      const processingTime = request.completedAt - request.startedAt
      this.stats.averageProcessingTime = (this.stats.averageProcessingTime + processingTime) / 2
    }
    
    this._emit('requestComplete', { request, success })
  }

  /**
   * Pause queue processing
   */
  pause() {
    this.isPaused = true
    this._setStatus(QUEUE_STATUS.PAUSED)
  }

  /**
   * Resume queue processing
   */
  resume() {
    this.isPaused = false
    this._processQueue()
  }

  /**
   * Clear all queues
   */
  clear() {
    Object.values(this.queues).forEach(queue => {
      queue.forEach(request => {
        request.reject(new QueueError('Queue cleared', 'QUEUE_CLEARED'))
      })
      queue.length = 0
    })
    
    this.pendingBatch.forEach(request => {
      request.reject(new QueueError('Queue cleared', 'QUEUE_CLEARED'))
    })
    this.pendingBatch = []
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
  }

  /**
   * Get queue status information
   */
  getStatus() {
    return {
      status: this.status,
      isPaused: this.isPaused,
      activeRequests: this.activeRequests.size,
      queueSizes: {
        high: this.queues[REQUEST_PRIORITY.HIGH].length,
        normal: this.queues[REQUEST_PRIORITY.NORMAL].length,
        low: this.queues[REQUEST_PRIORITY.LOW].length,
        total: this._getTotalQueueSize()
      },
      pendingBatch: this.pendingBatch.length,
      stats: { ...this.stats }
    }
  }

  /**
   * Get active requests information
   */
  getActiveRequests() {
    return Array.from(this.activeRequests.entries()).map(([id, request]) => ({
      id,
      type: request.type || 'single',
      priority: request.priority,
      startedAt: request.startedAt,
      duration: Date.now() - request.startedAt
    }))
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback)
    }
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback)
      if (index > -1) {
        this.listeners[event].splice(index, 1)
      }
    }
  }

  /**
   * Emit event to listeners
   * @private
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error('Error in queue event listener:', error)
        }
      })
    }
  }

  /**
   * Set queue status
   * @private
   */
  _setStatus(status) {
    if (this.status !== status) {
      const oldStatus = this.status
      this.status = status
      this._emit('statusChange', { oldStatus, newStatus: status })
    }
  }

  /**
   * Get total queue size across all priorities
   * @private
   */
  _getTotalQueueSize() {
    return Object.values(this.queues).reduce((total, queue) => total + queue.length, 0)
  }

  /**
   * Generate unique ID
   * @private
   */
  _generateId() {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * Custom error class for queue errors
 */
export class QueueError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'QueueError'
    this.code = code
  }
}

// Create default instance
export const requestQueue = new RequestQueue()

export default requestQueue