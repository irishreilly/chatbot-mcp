/**
 * Connection Health Monitor for backend connectivity tracking
 */

import { requestManager } from './requestManager'
import { logError, ErrorCategory, ErrorSeverity } from './errorService'

// Connection status constants
export const CONNECTION_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  SLOW: 'slow',
  UNKNOWN: 'unknown'
}

// Health check intervals (in milliseconds)
const HEALTH_CHECK_INTERVALS = {
  NORMAL: 30000,      // 30 seconds when connected
  FAST: 5000,         // 5 seconds when disconnected
  SLOW: 60000         // 1 minute when connection is slow
}

// Response time thresholds
const RESPONSE_TIME_THRESHOLDS = {
  FAST: 1000,         // < 1s is fast
  SLOW: 5000          // > 5s is slow
}

class HealthMonitor {
  constructor() {
    this.status = CONNECTION_STATUS.UNKNOWN
    this.lastHealthCheck = null
    this.responseTime = null
    this.errorCount = 0
    this.consecutiveErrors = 0
    this.isMonitoring = false
    this.healthCheckInterval = null
    this.statusChangeCallbacks = []
    this.healthHistory = []
    this.maxHistorySize = 50
    
    // Bind methods
    this.handleOnline = this.handleOnline.bind(this)
    this.handleOffline = this.handleOffline.bind(this)
    
    // Listen to browser online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
    }
  }

  /**
   * Start health monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return
    }

    this.isMonitoring = true
    console.log('Health monitoring started')
    
    // Perform initial health check
    this.forceHealthCheck()
    
    // Schedule regular health checks
    this._scheduleNextHealthCheck()
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return
    }

    this.isMonitoring = false
    
    if (this.healthCheckInterval) {
      clearTimeout(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
    
    console.log('Health monitoring stopped')
  }

  /**
   * Get current connection status
   */
  getConnectionStatus() {
    return {
      status: this.status,
      isOnline: navigator.onLine,
      lastHealthCheck: this.lastHealthCheck,
      responseTime: this.responseTime,
      errorCount: this.errorCount,
      consecutiveErrors: this.consecutiveErrors
    }
  }

  /**
   * Register callback for status changes
   */
  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this.statusChangeCallbacks.push(callback)
    }
    
    // Return unsubscribe function
    return () => {
      const index = this.statusChangeCallbacks.indexOf(callback)
      if (index > -1) {
        this.statusChangeCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Force a health check
   */
  async forceHealthCheck() {
    if (!navigator.onLine) {
      this._updateStatus(CONNECTION_STATUS.DISCONNECTED)
      return false
    }

    const startTime = Date.now()
    
    try {
      // Use the request manager to make health check request
      const response = await requestManager.makeRequest({
        url: '/api/health',
        method: 'GET'
      }, {
        timeout: 5000,
        deduplicate: false // Don't deduplicate health checks
      })

      const endTime = Date.now()
      const responseTime = endTime - startTime

      // Update metrics
      this.lastHealthCheck = new Date()
      this.responseTime = responseTime
      this.consecutiveErrors = 0

      // Determine status based on response time
      let newStatus = CONNECTION_STATUS.CONNECTED
      if (responseTime > RESPONSE_TIME_THRESHOLDS.SLOW) {
        newStatus = CONNECTION_STATUS.SLOW
      }

      this._updateStatus(newStatus)
      this._addToHistory({
        timestamp: this.lastHealthCheck,
        status: newStatus,
        responseTime,
        success: true
      })

      return true

    } catch (error) {
      const endTime = Date.now()
      const responseTime = endTime - startTime

      this.lastHealthCheck = new Date()
      this.responseTime = responseTime
      this.errorCount++
      this.consecutiveErrors++

      // Log error
      logError(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.LOW,
        context: 'health_monitor',
        additionalData: {
          consecutiveErrors: this.consecutiveErrors,
          responseTime
        }
      })

      this._updateStatus(CONNECTION_STATUS.DISCONNECTED)
      this._addToHistory({
        timestamp: this.lastHealthCheck,
        status: CONNECTION_STATUS.DISCONNECTED,
        responseTime,
        success: false,
        error: error.message
      })

      return false
    }
  }

  /**
   * Get health check history
   */
  getHealthHistory() {
    return [...this.healthHistory]
  }

  /**
   * Get health statistics
   */
  getHealthStats() {
    const history = this.healthHistory
    const total = history.length
    const successful = history.filter(h => h.success).length
    const failed = total - successful
    
    const responseTimes = history
      .filter(h => h.success && h.responseTime)
      .map(h => h.responseTime)
    
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : null

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      averageResponseTime: avgResponseTime,
      currentStatus: this.status,
      consecutiveErrors: this.consecutiveErrors
    }
  }

  /**
   * Handle browser online event
   * @private
   */
  handleOnline() {
    console.log('Browser detected online status')
    if (this.isMonitoring) {
      // Perform immediate health check when coming back online
      setTimeout(() => this.forceHealthCheck(), 100)
    }
  }

  /**
   * Handle browser offline event
   * @private
   */
  handleOffline() {
    console.log('Browser detected offline status')
    this._updateStatus(CONNECTION_STATUS.DISCONNECTED)
  }

  /**
   * Update connection status and notify callbacks
   * @private
   */
  _updateStatus(newStatus) {
    const oldStatus = this.status
    
    if (oldStatus !== newStatus) {
      this.status = newStatus
      console.log(`Connection status changed: ${oldStatus} -> ${newStatus}`)
      
      // Notify all callbacks
      this.statusChangeCallbacks.forEach(callback => {
        try {
          callback(newStatus, oldStatus)
        } catch (error) {
          console.error('Error in status change callback:', error)
        }
      })
    }
  }

  /**
   * Schedule next health check based on current status
   * @private
   */
  _scheduleNextHealthCheck() {
    if (!this.isMonitoring) {
      return
    }

    let interval = HEALTH_CHECK_INTERVALS.NORMAL

    // Adjust interval based on current status
    switch (this.status) {
      case CONNECTION_STATUS.DISCONNECTED:
        interval = HEALTH_CHECK_INTERVALS.FAST
        break
      case CONNECTION_STATUS.SLOW:
        interval = HEALTH_CHECK_INTERVALS.SLOW
        break
      case CONNECTION_STATUS.CONNECTED:
      default:
        interval = HEALTH_CHECK_INTERVALS.NORMAL
        break
    }

    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 1000
    interval += jitter

    this.healthCheckInterval = setTimeout(async () => {
      await this.forceHealthCheck()
      this._scheduleNextHealthCheck()
    }, interval)
  }

  /**
   * Add health check result to history
   * @private
   */
  _addToHistory(entry) {
    this.healthHistory.unshift(entry)
    
    // Limit history size
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory = this.healthHistory.slice(0, this.maxHistorySize)
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopMonitoring()
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
    
    this.statusChangeCallbacks = []
    this.healthHistory = []
  }
}

// Create singleton instance
export const healthMonitor = new HealthMonitor()

export default healthMonitor