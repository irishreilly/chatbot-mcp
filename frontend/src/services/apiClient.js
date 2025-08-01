import { requestManager, RequestError, TIMEOUT_CONFIG } from './requestManager'
import { logError, ErrorCategory, ErrorSeverity, getUserFriendlyMessage } from './errorService'
import proxyMonitor from './proxyMonitor'

// API configuration
const API_BASE_URL = '/api'
const DIRECT_API_BASE_URL = 'http://localhost:8000/api' // Fallback direct connection

/**
 * Enhanced API client using the new request manager with proxy fallback support
 */
class EnhancedAPIClient {
  constructor() {
    this.baseURL = API_BASE_URL
    this.fallbackURL = DIRECT_API_BASE_URL
    this.useDirectConnection = false
    this.proxyFailureCount = 0
    this.maxProxyFailures = 3
    
    // Start proxy monitoring
    proxyMonitor.startMonitoring()
    
    // Listen for proxy status changes
    proxyMonitor.addListener((status) => {
      if (!status.isHealthy && status.consecutiveFailures >= this.maxProxyFailures) {
        console.warn('[APIClient] Proxy unhealthy, considering direct connection fallback')
        this.considerDirectConnection()
      } else if (status.isHealthy && this.useDirectConnection) {
        console.info('[APIClient] Proxy healthy again, switching back from direct connection')
        this.useDirectConnection = false
        this.proxyFailureCount = 0
      }
    })
  }

  /**
   * Consider switching to direct connection if proxy is failing
   * @private
   */
  considerDirectConnection() {
    // Only enable direct connection in development
    if (import.meta.env.DEV && !this.useDirectConnection) {
      console.warn('[APIClient] Switching to direct connection due to proxy failures')
      this.useDirectConnection = true
    }
  }

  /**
   * Get the appropriate base URL based on current connection mode
   * @private
   */
  _getBaseURL() {
    return this.useDirectConnection ? this.fallbackURL : this.baseURL
  }

  /**
   * Make an API request using the request manager with proxy fallback
   * @private
   */
  async _makeRequest(config, options = {}) {
    const baseURL = this._getBaseURL()
    
    // Prepare full URL
    const fullConfig = {
      ...config,
      url: config.url.startsWith('http') ? config.url : `${baseURL}${config.url}`,
      headers: {
        'Content-Type': 'application/json',
        'X-Connection-Mode': this.useDirectConnection ? 'direct' : 'proxy',
        ...config.headers
      }
    }

    try {
      console.log(`API Request: ${fullConfig.method?.toUpperCase()} ${fullConfig.url} (${this.useDirectConnection ? 'direct' : 'proxy'})`)
      
      const response = await requestManager.makeRequest(fullConfig, options)
      
      console.log(`API Response: ${response.status} ${fullConfig.url}`)
      
      // Reset proxy failure count on successful request
      if (!this.useDirectConnection) {
        this.proxyFailureCount = 0
      }
      
      return response
      
    } catch (error) {
      console.error('API Response Error:', error)
      
      // Handle proxy-specific errors and attempt fallback
      if (!this.useDirectConnection && this._isProxyError(error)) {
        this.proxyFailureCount++
        console.warn(`[APIClient] Proxy error detected (${this.proxyFailureCount}/${this.maxProxyFailures})`)
        
        if (this.proxyFailureCount >= this.maxProxyFailures && import.meta.env.DEV) {
          console.warn('[APIClient] Max proxy failures reached, attempting direct connection')
          this.useDirectConnection = true
          
          // Retry the request with direct connection
          try {
            const directConfig = {
              ...fullConfig,
              url: config.url.startsWith('http') ? config.url : `${this.fallbackURL}${config.url}`,
              headers: {
                ...fullConfig.headers,
                'X-Connection-Mode': 'direct-fallback'
              }
            }
            
            console.log(`API Retry (direct): ${directConfig.method?.toUpperCase()} ${directConfig.url}`)
            const response = await requestManager.makeRequest(directConfig, options)
            console.log(`API Response (direct): ${response.status} ${directConfig.url}`)
            return response
          } catch (directError) {
            console.error('Direct connection also failed:', directError)
            // Fall through to normal error handling
          }
        }
      }
      
      // Convert RequestError to APIError for backward compatibility
      if (error instanceof RequestError) {
        throw this._convertRequestError(error)
      }
      
      // Handle other errors
      throw this._handleGenericError(error, fullConfig)
    }
  }

  /**
   * Check if an error is likely a proxy-related error
   * @private
   */
  _isProxyError(error) {
    if (error instanceof RequestError) {
      const originalError = error.originalError
      
      // Network errors that might be proxy-related
      if (originalError?.code === 'ECONNREFUSED' || 
          originalError?.code === 'ECONNRESET' ||
          originalError?.code === 'ENOTFOUND' ||
          originalError?.message?.includes('502') ||
          originalError?.message?.includes('Bad Gateway') ||
          originalError?.message?.includes('proxy')) {
        return true
      }
      
      // Timeout errors might be proxy-related
      if (error.isTimeout()) {
        return true
      }
    }
    
    return false
  }

  /**
   * Convert RequestError to APIError
   * @private
   */
  _convertRequestError(requestError) {
    let apiError
    let errorCategory = ErrorCategory.API
    let errorSeverity = ErrorSeverity.MEDIUM

    if (requestError.isTimeout()) {
      errorCategory = ErrorCategory.NETWORK
      errorSeverity = ErrorSeverity.MEDIUM
      apiError = new APIError(
        'Request timed out - please try again',
        0,
        'TIMEOUT_ERROR'
      )
    } else if (requestError.isCancelled()) {
      errorCategory = ErrorCategory.NETWORK
      errorSeverity = ErrorSeverity.LOW
      apiError = new APIError(
        'Request was cancelled',
        0,
        'CANCELLED_ERROR'
      )
    } else if (requestError.originalError?.response) {
      // Server responded with error status
      const { status, data } = requestError.originalError.response
      
      if (status >= 500) {
        errorCategory = ErrorCategory.API
        errorSeverity = ErrorSeverity.HIGH
      } else if (status === 401) {
        errorCategory = ErrorCategory.AUTH
        errorSeverity = ErrorSeverity.MEDIUM
      } else if (status === 429) {
        errorCategory = ErrorCategory.API
        errorSeverity = ErrorSeverity.LOW
      }
      
      apiError = new APIError(
        data?.error?.message || `HTTP ${status} Error`,
        status,
        data?.error?.code,
        data?.error?.details
      )
    } else {
      // Network or other error
      errorCategory = ErrorCategory.NETWORK
      errorSeverity = ErrorSeverity.MEDIUM
      apiError = new APIError(
        'Network error - please check your connection',
        0,
        'NETWORK_ERROR'
      )
    }

    // Log error
    logError(apiError, {
      category: errorCategory,
      severity: errorSeverity,
      context: 'api_client',
      additionalData: {
        requestId: requestError.requestMeta?.id,
        url: requestError.requestMeta?.url,
        method: requestError.requestMeta?.method,
        timeout: requestError.requestMeta?.timeout,
        originalError: requestError.originalError?.message
      }
    })

    return apiError
  }

  /**
   * Handle generic errors
   * @private
   */
  _handleGenericError(error, config) {
    const apiError = new APIError(
      error.message || 'An unexpected error occurred',
      0,
      'UNKNOWN_ERROR'
    )

    logError(apiError, {
      category: ErrorCategory.RUNTIME,
      severity: ErrorSeverity.HIGH,
      context: 'api_client',
      additionalData: {
        url: config.url,
        method: config.method,
        originalError: error.message
      }
    })

    return apiError
  }

  /**
   * GET request
   */
  async get(url, config = {}) {
    return this._makeRequest({ ...config, method: 'GET', url })
  }

  /**
   * POST request
   */
  async post(url, data, config = {}) {
    return this._makeRequest({ ...config, method: 'POST', url, data })
  }

  /**
   * PUT request
   */
  async put(url, data, config = {}) {
    return this._makeRequest({ ...config, method: 'PUT', url, data })
  }

  /**
   * DELETE request
   */
  async delete(url, config = {}) {
    return this._makeRequest({ ...config, method: 'DELETE', url })
  }

  /**
   * Cancel all active requests
   */
  cancelAllRequests() {
    return requestManager.cancelAllRequests()
  }

  /**
   * Get active requests
   */
  getActiveRequests() {
    return requestManager.getActiveRequests()
  }

  /**
   * Get proxy status and diagnostics
   */
  getProxyDiagnostics() {
    return {
      ...proxyMonitor.getDiagnostics(),
      connectionMode: this.useDirectConnection ? 'direct' : 'proxy',
      proxyFailureCount: this.proxyFailureCount,
      maxProxyFailures: this.maxProxyFailures,
      fallbackAvailable: import.meta.env.DEV
    }
  }

  /**
   * Test proxy connectivity
   */
  async testProxyConnectivity() {
    return await proxyMonitor.testEndpoint('/api/health')
  }

  /**
   * Force proxy health check
   */
  async forceProxyHealthCheck() {
    return await proxyMonitor.forceHealthCheck()
  }

  /**
   * Reset proxy statistics
   */
  resetProxyStats() {
    proxyMonitor.resetStats()
    this.proxyFailureCount = 0
  }

  /**
   * Manually switch connection mode (development only)
   */
  setConnectionMode(mode) {
    if (!import.meta.env.DEV) {
      console.warn('[APIClient] Connection mode switching only available in development')
      return false
    }
    
    if (mode === 'direct') {
      this.useDirectConnection = true
      console.log('[APIClient] Manually switched to direct connection')
    } else if (mode === 'proxy') {
      this.useDirectConnection = false
      this.proxyFailureCount = 0
      console.log('[APIClient] Manually switched to proxy connection')
    } else {
      console.error('[APIClient] Invalid connection mode:', mode)
      return false
    }
    
    return true
  }
}

// Create singleton instance
const apiClient = new EnhancedAPIClient()

// Custom error class for API errors
export class APIError extends Error {
  constructor(message, status = 0, code = null, details = null) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.code = code
    this.details = details
  }

  // Check if error is a specific type
  isNetworkError() {
    return this.code === 'NETWORK_ERROR'
  }

  isServerError() {
    return this.status >= 500
  }

  isClientError() {
    return this.status >= 400 && this.status < 500
  }

  isTimeout() {
    return this.code === 'ECONNABORTED' || this.message.includes('timeout')
  }
}

// API service methods
export const chatAPI = {
  /**
   * Send a chat message to the backend
   * @param {string} message - The user's message
   * @param {string} [conversationId] - Optional conversation ID
   * @returns {Promise<ChatResponse>} The chat response
   */
  async sendMessage(message, conversationId = null) {
    try {
      const response = await apiClient.post('/chat', {
        message,
        conversation_id: conversationId,
      }, {
        priority: 'high', // Chat messages get high priority
        timeout: TIMEOUT_CONFIG.chat
      })
      
      return response.data
    } catch (error) {
      // Re-throw APIError or wrap other errors
      if (error instanceof APIError) {
        throw error
      }
      throw new APIError('Failed to send message', 0, 'SEND_MESSAGE_ERROR')
    }
  },

  /**
   * Get conversation history
   * @param {string} conversationId - The conversation ID
   * @returns {Promise<Conversation>} The conversation data
   */
  async getConversation(conversationId) {
    try {
      const response = await apiClient.get(`/conversations/${conversationId}`)
      return response.data
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }
      throw new APIError('Failed to get conversation', 0, 'GET_CONVERSATION_ERROR')
    }
  },

  /**
   * Health check endpoint
   * @returns {Promise<HealthResponse>} The health status
   */
  async healthCheck() {
    try {
      const response = await apiClient.get('/health', {
        priority: 'low', // Health checks get low priority
        timeout: TIMEOUT_CONFIG.health,
        batchable: true // Health checks can be batched
      })
      return response.data
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }
      throw new APIError('Health check failed', 0, 'HEALTH_CHECK_ERROR')
    }
  },
}

// Utility functions for error handling
export const errorUtils = {
  /**
   * Check if an error is retryable
   * @param {Error} error - The error to check
   * @returns {boolean} Whether the error is retryable
   */
  isRetryable(error) {
    if (!(error instanceof APIError)) return false
    
    return (
      error.isNetworkError() ||
      error.isTimeout() ||
      error.isServerError()
    )
  },

  /**
   * Get user-friendly error message
   * @param {Error} error - The error to format
   * @returns {string} User-friendly error message
   */
  getUserMessage(error) {
    if (!(error instanceof APIError)) {
      return 'An unexpected error occurred. Please try again.'
    }

    if (error.isNetworkError()) {
      return 'Unable to connect to the server. Please check your internet connection and try again.'
    }

    if (error.isTimeout()) {
      return 'The request timed out. Please try again.'
    }

    if (error.status === 429) {
      return 'Too many requests. Please wait a moment and try again.'
    }

    if (error.isServerError()) {
      return 'Server error. Please try again later.'
    }

    // Return the original message for client errors and others
    return error.message
  },

  /**
   * Retry a function with exponential backoff
   * @param {Function} fn - The function to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {Promise} The result of the function
   */
  async retry(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error

        // Don't retry if it's not a retryable error
        if (!this.isRetryable(error)) {
          throw error
        }

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break
        }

        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt)
        console.log(`Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`)
        
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError
  },

  /**
   * Cancel a specific request by ID
   * @param {string} requestId - Request ID to cancel
   */
  cancelRequest(requestId) {
    return requestManager.cancelRequest(requestId)
  },

  /**
   * Cancel all active requests
   */
  cancelAllRequests() {
    return requestManager.cancelAllRequests()
  },

  /**
   * Get active requests
   */
  getActiveRequests() {
    return requestManager.getActiveRequests()
  },

  /**
   * Get request statistics
   */
  getRequestStats() {
    return requestManager.getStats()
  },

  /**
   * Get queue status and statistics
   */
  getQueueStatus() {
    return requestManager.getQueueStatus()
  },

  /**
   * Pause request queue processing
   */
  pauseQueue() {
    return requestManager.pauseQueue()
  },

  /**
   * Resume request queue processing
   */
  resumeQueue() {
    return requestManager.resumeQueue()
  },

  /**
   * Clear request queue
   */
  clearQueue() {
    return requestManager.clearQueue()
  }
}

export default apiClient