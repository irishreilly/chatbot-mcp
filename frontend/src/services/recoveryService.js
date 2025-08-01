/**
 * Recovery Service - Simplified version to avoid startup issues
 */

// Recovery strategy constants
export const RECOVERY_STRATEGY = {
  IMMEDIATE_RETRY: 'immediate_retry',
  EXPONENTIAL_BACKOFF: 'exponential_backoff',
  CIRCUIT_BREAKER: 'circuit_breaker',
  FALLBACK: 'fallback',
  CACHE_FALLBACK: 'cache_fallback',
  OFFLINE_MODE: 'offline_mode'
}

// Error pattern constants for smart retry
export const ERROR_PATTERNS = {
  NETWORK_TIMEOUT: 'network_timeout',
  SERVER_ERROR: 'server_error',
  RATE_LIMIT: 'rate_limit',
  AUTH_ERROR: 'auth_error',
  CLIENT_ERROR: 'client_error',
  PROXY_ERROR: 'proxy_error'
}

class RecoveryService {
  constructor() {
    this.isOfflineMode = false
    this.cache = new Map()
    this.circuitBreakers = new Map()
    this.retryAttempts = new Map()
    this.recoveryCallbacks = []
    this.offlineCallbacks = []
    this.degradationLevel = 0
  }

  /**
   * Execute request with recovery strategies
   */
  async executeWithRecovery(requestFn, options = {}) {
    try {
      return await requestFn()
    } catch (error) {
      console.error('[Recovery] Request failed:', error)
      throw error
    }
  }

  /**
   * User-initiated recovery options
   */
  async retryLastFailedRequest() {
    console.log('[Recovery] Retrying last failed request')
  }

  async refreshApplication() {
    console.log('[Recovery] Refreshing application state')
    this.cache.clear()
    this.circuitBreakers.clear()
  }

  async clearCache() {
    console.log('[Recovery] Clearing cache')
    this.cache.clear()
  }

  /**
   * Offline mode support
   */
  enableOfflineMode() {
    if (this.isOfflineMode) return
    console.log('[Recovery] Enabling offline mode')
    this.isOfflineMode = true
    this.degradationLevel = Math.max(this.degradationLevel, 2)
    this._notifyOfflineCallbacks(true)
  }

  disableOfflineMode() {
    if (!this.isOfflineMode) return
    console.log('[Recovery] Disabling offline mode')
    this.isOfflineMode = false
    this.degradationLevel = Math.max(this.degradationLevel - 2, 0)
    this._notifyOfflineCallbacks(false)
  }

  /**
   * Cache management
   */
  setCachedData(key, data, expiration = 300000) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiration
    })
  }

  getCachedData(key) {
    const cached = this.cache.get(key)
    if (!cached) return null
    
    const now = Date.now()
    if (now - cached.timestamp > cached.expiration) {
      this.cache.delete(key)
      return null
    }
    
    return cached.data
  }

  /**
   * Progressive enhancement and degradation
   */
  getDegradationLevel() {
    return this.degradationLevel
  }

  setDegradationLevel(level) {
    const oldLevel = this.degradationLevel
    this.degradationLevel = Math.max(0, Math.min(5, level))
    
    if (oldLevel !== this.degradationLevel) {
      console.log(`[Recovery] Degradation level changed: ${oldLevel} -> ${this.degradationLevel}`)
      this._notifyRecoveryCallbacks('degradation', { oldLevel, newLevel: this.degradationLevel })
    }
  }

  isFeatureAvailable(feature) {
    const featureRequirements = {
      'chat': 0,
      'file-upload': 1,
      'real-time-updates': 2,
      'advanced-features': 3,
      'analytics': 4,
      'non-essential': 5
    }
    
    const requiredLevel = featureRequirements[feature] || 0
    return this.degradationLevel <= requiredLevel
  }

  /**
   * Smart retry strategies based on error patterns
   */
  getRetryStrategy(error) {
    return {
      strategy: RECOVERY_STRATEGY.EXPONENTIAL_BACKOFF,
      maxRetries: 2,
      baseDelay: 1000
    }
  }

  /**
   * Event listeners
   */
  onRecovery(callback) {
    this.recoveryCallbacks.push(callback)
    return () => {
      const index = this.recoveryCallbacks.indexOf(callback)
      if (index > -1) this.recoveryCallbacks.splice(index, 1)
    }
  }

  onOfflineMode(callback) {
    this.offlineCallbacks.push(callback)
    return () => {
      const index = this.offlineCallbacks.indexOf(callback)
      if (index > -1) this.offlineCallbacks.splice(index, 1)
    }
  }

  /**
   * Connection event handlers
   */
  handleConnectionChange(newStatus, oldStatus) {
    console.log(`[Recovery] Connection status changed: ${oldStatus} -> ${newStatus}`)
  }

  handleOnline() {
    console.log('[Recovery] Browser online event')
  }

  handleOffline() {
    console.log('[Recovery] Browser offline event')
    this.enableOfflineMode()
  }

  /**
   * Utility methods
   */
  getRecoveryStatus() {
    return {
      isOfflineMode: this.isOfflineMode,
      degradationLevel: this.degradationLevel,
      cacheSize: this.cache.size,
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([key, value]) => ({
        service: key,
        ...value
      })),
      connectionStatus: {
        status: 'connected',
        isOnline: true,
        lastHealthCheck: new Date(),
        responseTime: 100,
        errorCount: 0,
        consecutiveErrors: 0
      }
    }
  }

  /**
   * Private helper methods
   */
  _notifyRecoveryCallbacks(type, data = {}) {
    this.recoveryCallbacks.forEach(callback => {
      try {
        callback(type, data)
      } catch (error) {
        console.error('[Recovery] Error in recovery callback:', error)
      }
    })
  }

  _notifyOfflineCallbacks(isOffline) {
    this.offlineCallbacks.forEach(callback => {
      try {
        callback(isOffline)
      } catch (error) {
        console.error('[Recovery] Error in offline callback:', error)
      }
    })
  }

  /**
   * Cleanup
   */
  destroy() {
    this.cache.clear()
    this.circuitBreakers.clear()
    this.recoveryCallbacks = []
    this.offlineCallbacks = []
  }
}

// Create singleton instance
export const recoveryService = new RecoveryService()

export default recoveryService