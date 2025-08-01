/**
 * Simple API Client - Basic HTTP requests without complex dependencies
 */

// API configuration
const API_BASE_URL = '/api'

/**
 * Simple API client for basic HTTP requests
 */
class SimpleAPIClient {
  constructor() {
    this.baseURL = API_BASE_URL
  }

  /**
   * Make a basic HTTP request
   */
  async _makeRequest(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`
    
    const config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    }

    try {
      console.log(`API Request: ${config.method} ${fullUrl}`)
      
      const response = await fetch(fullUrl, config)
      
      if (!response.ok) {
        throw new APIError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          'HTTP_ERROR'
        )
      }

      const data = await response.json()
      console.log(`API Response: ${response.status} ${fullUrl}`)
      
      return { data, status: response.status }
      
    } catch (error) {
      console.error('API Request Error:', error)
      
      if (error instanceof APIError) {
        throw error
      }
      
      // Handle network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new APIError(
          'Network error - please check your connection',
          0,
          'NETWORK_ERROR'
        )
      }
      
      throw new APIError(
        error.message || 'An unexpected error occurred',
        0,
        'UNKNOWN_ERROR'
      )
    }
  }

  /**
   * GET request
   */
  async get(url, config = {}) {
    return this._makeRequest(url, { ...config, method: 'GET' })
  }

  /**
   * POST request
   */
  async post(url, data, config = {}) {
    return this._makeRequest(url, {
      ...config,
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  /**
   * PUT request
   */
  async put(url, data, config = {}) {
    return this._makeRequest(url, {
      ...config,
      method: 'PUT',
      body: JSON.stringify(data)
    })
  }

  /**
   * DELETE request
   */
  async delete(url, config = {}) {
    return this._makeRequest(url, { ...config, method: 'DELETE' })
  }
}

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
    return this.code === 'TIMEOUT_ERROR'
  }
}

// Create singleton instance
const apiClient = new SimpleAPIClient()

// API service methods
export const chatAPI = {
  /**
   * Send a chat message to the backend
   */
  async sendMessage(message, conversationId = null, options = {}) {
    try {
      const response = await apiClient.post('/chat', {
        message,
        conversation_id: conversationId,
      }, {
        signal: options.signal,
        timeout: options.timeout || 45000  // 45 second timeout for MCP operations
      })
      
      return response.data
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }
      throw new APIError('Failed to send message', 0, 'SEND_MESSAGE_ERROR')
    }
  },

  /**
   * Get conversation history
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
   */
  async healthCheck() {
    try {
      const response = await apiClient.get('/health')
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
   */
  getUserMessage(error) {
    if (!(error instanceof APIError)) {
      return 'An unexpected error occurred. Please try again.'
    }

    if (error.isNetworkError()) {
      return 'Unable to connect to the server. Please check your internet connection and try again.'
    }

    if (error.isTimeout()) {
      return 'The request timed out. This may be due to complex operations like querying Grafana data. You can try again with a simpler query or wait a moment.'
    }

    if (error.status === 429) {
      return 'Too many requests. Please wait a moment and try again.'
    }

    if (error.isServerError()) {
      return 'Server error. This might be due to external services being slow. Please try again later.'
    }

    // Check for MCP-related errors in the message
    if (error.message && error.message.includes('MCP')) {
      return 'There was an issue connecting to external services (like Grafana). The AI can still help with general questions, or you can try your Grafana query again.'
    }

    return error.message
  },

  /**
   * Check if error is related to MCP operations
   */
  isMCPError(error) {
    if (!(error instanceof APIError)) return false
    return error.message && (
      error.message.includes('MCP') ||
      error.message.includes('Grafana') ||
      error.message.includes('tool call')
    )
  },

  /**
   * Get retry suggestion based on error type
   */
  getRetrySuggestion(error) {
    if (this.isMCPError(error)) {
      return 'Try asking a simpler question or retry your Grafana query.'
    }
    
    if (error.isTimeout()) {
      return 'The request took too long. Try breaking down complex queries into smaller parts.'
    }
    
    if (error.isNetworkError()) {
      return 'Check your internet connection and try again.'
    }
    
    return 'Please try again in a moment.'
  }
}

export default apiClient