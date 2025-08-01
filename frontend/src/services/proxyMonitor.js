/**
 * Proxy Health Monitor Service
 * Monitors proxy status and provides diagnostic information
 */

class ProxyMonitor {
  constructor() {
    this.isMonitoring = false;
    this.healthCheckInterval = null;
    this.listeners = new Set();
    this.startTime = null;
    this.status = {
      isHealthy: true,
      lastCheck: null,
      consecutiveFailures: 0,
      responseTime: null,
      error: null
    };
    this.config = {
      healthCheckInterval: 30000, // 30 seconds
      maxConsecutiveFailures: 3,
      healthCheckTimeout: 5000 // 5 seconds
    };
  }

  /**
   * Start monitoring proxy health
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.startTime = Date.now();
    this.performHealthCheck();
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    console.log('[ProxyMonitor] Started monitoring proxy health');
  }

  /**
   * Stop monitoring proxy health
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    console.log('[ProxyMonitor] Stopped monitoring proxy health');
  }

  /**
   * Perform a health check against the backend through the proxy
   */
  async performHealthCheck() {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.healthCheckTimeout);

      const response = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'X-Health-Check': 'true'
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        this.updateStatus({
          isHealthy: true,
          lastCheck: new Date().toISOString(),
          consecutiveFailures: 0,
          responseTime,
          error: null
        });
      } else {
        throw new Error(`Health check failed with status: ${response.status}`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const consecutiveFailures = this.status.consecutiveFailures + 1;
      
      this.updateStatus({
        isHealthy: consecutiveFailures < this.config.maxConsecutiveFailures,
        lastCheck: new Date().toISOString(),
        consecutiveFailures,
        responseTime,
        error: {
          message: error.message,
          name: error.name,
          timestamp: new Date().toISOString()
        }
      });

      console.warn('[ProxyMonitor] Health check failed:', error.message);
    }
  }

  /**
   * Update proxy status and notify listeners
   */
  updateStatus(newStatus) {
    const previousStatus = { ...this.status };
    this.status = { ...this.status, ...newStatus };

    // Notify listeners if health status changed
    if (previousStatus.isHealthy !== this.status.isHealthy) {
      this.notifyListeners(this.status);
    }
  }

  /**
   * Get current proxy status
   */
  getStatus() {
    return { ...this.status };
  }

  /**
   * Get proxy statistics from Vite dev server
   */
  getProxyStats() {
    return globalThis.proxyStats || {
      requests: 0,
      errors: 0,
      timeouts: 0,
      retries: 0,
      lastError: null,
      lastSuccess: null,
      responseTimeHistory: [],
      consecutiveFailures: 0,
      isHealthy: true
    };
  }

  /**
   * Get circuit breaker status from Vite dev server
   */
  getCircuitBreakerStatus() {
    return globalThis.circuitBreakerStatus || {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: null,
      timeout: 60000,
      threshold: 5
    };
  }

  /**
   * Get proxy logs from Vite dev server
   */
  getProxyLogs(limit = 50) {
    const logs = globalThis.proxyLogs || [];
    return logs.slice(-limit);
  }

  /**
   * Get comprehensive proxy diagnostic information
   */
  getDiagnostics() {
    const stats = this.getProxyStats();
    const logs = this.getProxyLogs(20);
    const circuitBreaker = this.getCircuitBreakerStatus();
    
    return {
      status: this.getStatus(),
      statistics: {
        ...stats,
        averageResponseTime: stats.responseTimeHistory.length > 0
          ? stats.responseTimeHistory.reduce((a, b) => a + b, 0) / stats.responseTimeHistory.length
          : null,
        errorRate: stats.requests > 0 ? (stats.errors / stats.requests) * 100 : 0,
        retryRate: stats.requests > 0 ? (stats.retries / stats.requests) * 100 : 0,
        successRate: stats.requests > 0 ? ((stats.requests - stats.errors) / stats.requests) * 100 : 0
      },
      circuitBreaker: {
        ...circuitBreaker,
        isOpen: circuitBreaker.state === 'OPEN',
        isHalfOpen: circuitBreaker.state === 'HALF_OPEN',
        timeUntilRetry: circuitBreaker.state === 'OPEN' && circuitBreaker.lastFailureTime
          ? Math.max(0, circuitBreaker.timeout - (Date.now() - circuitBreaker.lastFailureTime))
          : 0
      },
      recentLogs: logs,
      configuration: {
        healthCheckInterval: this.config.healthCheckInterval,
        maxConsecutiveFailures: this.config.maxConsecutiveFailures,
        healthCheckTimeout: this.config.healthCheckTimeout
      }
    };
  }

  /**
   * Add a status change listener
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of status changes
   */
  notifyListeners(status) {
    this.listeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('[ProxyMonitor] Error in status listener:', error);
      }
    });
  }

  /**
   * Test proxy connectivity with a specific endpoint
   */
  async testEndpoint(endpoint = '/api/health', options = {}) {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeout = options.timeout || 45000;  // Increased for MCP operations
      
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      const response = await fetch(endpoint, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Proxy-Test': 'true',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      const result = {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        responseTime,
        headers: Object.fromEntries(response.headers.entries()),
        timestamp: new Date().toISOString()
      };

      if (response.ok) {
        try {
          result.data = await response.json();
        } catch (e) {
          result.data = await response.text();
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          message: error.message,
          name: error.name,
          code: error.code
        },
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Force an immediate health check
   */
  async forceHealthCheck() {
    return await this.performHealthCheck();
  }

  /**
   * Reset proxy statistics
   */
  resetStats() {
    if (globalThis.proxyStats) {
      globalThis.proxyStats = {
        requests: 0,
        errors: 0,
        timeouts: 0,
        retries: 0,
        lastError: null,
        lastSuccess: null,
        responseTimeHistory: [],
        consecutiveFailures: 0,
        isHealthy: true
      };
    }
    
    if (globalThis.proxyLogs) {
      globalThis.proxyLogs = [];
    }

    if (globalThis.circuitBreakerStatus) {
      globalThis.circuitBreakerStatus = {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: null,
        timeout: 60000,
        threshold: 5
      };
    }

    console.log('[ProxyMonitor] Proxy statistics and circuit breaker reset');
  }

  /**
   * Manually reset circuit breaker
   */
  resetCircuitBreaker() {
    if (globalThis.circuitBreakerStatus) {
      globalThis.circuitBreakerStatus = {
        ...globalThis.circuitBreakerStatus,
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: null
      };
    }

    console.log('[ProxyMonitor] Circuit breaker manually reset');
  }

  /**
   * Get proxy performance metrics
   */
  getPerformanceMetrics() {
    const stats = this.getProxyStats();
    const now = Date.now();
    
    return {
      uptime: this.isMonitoring ? now - (this.startTime || now) : 0,
      totalRequests: stats.requests,
      totalErrors: stats.errors,
      totalTimeouts: stats.timeouts,
      totalRetries: stats.retries,
      errorRate: stats.requests > 0 ? (stats.errors / stats.requests) * 100 : 0,
      successRate: stats.requests > 0 ? ((stats.requests - stats.errors) / stats.requests) * 100 : 0,
      retryRate: stats.requests > 0 ? (stats.retries / stats.requests) * 100 : 0,
      averageResponseTime: stats.responseTimeHistory.length > 0
        ? stats.responseTimeHistory.reduce((a, b) => a + b, 0) / stats.responseTimeHistory.length
        : null,
      medianResponseTime: this.calculateMedian(stats.responseTimeHistory),
      p95ResponseTime: this.calculatePercentile(stats.responseTimeHistory, 95),
      healthScore: this.calculateHealthScore(stats)
    };
  }

  /**
   * Calculate median response time
   */
  calculateMedian(values) {
    if (values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Calculate percentile response time
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate overall health score (0-100)
   */
  calculateHealthScore(stats) {
    if (stats.requests === 0) return 100;
    
    const errorRate = (stats.errors / stats.requests) * 100;
    const timeoutRate = (stats.timeouts / stats.requests) * 100;
    const consecutiveFailurePenalty = Math.min(stats.consecutiveFailures * 10, 50);
    
    let score = 100 - errorRate - (timeoutRate * 2) - consecutiveFailurePenalty;
    
    // Bonus for recent successful requests
    if (stats.lastSuccess && stats.lastError) {
      const lastSuccessTime = new Date(stats.lastSuccess).getTime();
      const lastErrorTime = new Date(stats.lastError).getTime();
      
      if (lastSuccessTime > lastErrorTime) {
        score += 10; // Bonus for recent success
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get proxy connection quality assessment
   */
  getConnectionQuality() {
    const metrics = this.getPerformanceMetrics();
    const circuitBreaker = this.getCircuitBreakerStatus();
    
    let quality = 'excellent';
    let issues = [];
    
    if (circuitBreaker.state === 'OPEN') {
      quality = 'poor';
      issues.push('Circuit breaker is open');
    } else if (circuitBreaker.state === 'HALF_OPEN') {
      quality = 'fair';
      issues.push('Circuit breaker is testing connection');
    }
    
    if (metrics.errorRate > 20) {
      quality = 'poor';
      issues.push(`High error rate: ${metrics.errorRate.toFixed(1)}%`);
    } else if (metrics.errorRate > 10) {
      quality = quality === 'excellent' ? 'good' : quality;
      issues.push(`Elevated error rate: ${metrics.errorRate.toFixed(1)}%`);
    }
    
    if (metrics.averageResponseTime > 5000) {
      quality = 'poor';
      issues.push(`Slow response times: ${metrics.averageResponseTime.toFixed(0)}ms avg`);
    } else if (metrics.averageResponseTime > 2000) {
      quality = quality === 'excellent' ? 'good' : quality;
      issues.push(`Elevated response times: ${metrics.averageResponseTime.toFixed(0)}ms avg`);
    }
    
    if (this.status.consecutiveFailures >= 2) {
      quality = quality === 'excellent' ? 'fair' : quality;
      issues.push(`${this.status.consecutiveFailures} consecutive failures`);
    }
    
    return {
      quality,
      score: metrics.healthScore,
      issues,
      recommendations: this.getRecommendations(quality, issues)
    };
  }

  /**
   * Get recommendations based on connection quality
   */
  getRecommendations(quality, issues) {
    const recommendations = [];
    
    if (quality === 'poor') {
      recommendations.push('Check backend server status');
      recommendations.push('Verify network connectivity');
      recommendations.push('Consider restarting the backend service');
    }
    
    if (issues.some(issue => issue.includes('error rate'))) {
      recommendations.push('Review backend logs for errors');
      recommendations.push('Check server resource usage');
    }
    
    if (issues.some(issue => issue.includes('response times'))) {
      recommendations.push('Check backend performance');
      recommendations.push('Consider increasing timeout values');
      recommendations.push('Monitor server resource usage');
    }
    
    if (issues.some(issue => issue.includes('consecutive failures'))) {
      recommendations.push('Check network stability');
      recommendations.push('Verify backend service health');
    }
    
    if (issues.some(issue => issue.includes('Circuit breaker'))) {
      recommendations.push('Wait for automatic recovery');
      recommendations.push('Check backend service status');
      recommendations.push('Consider manual circuit breaker reset if backend is healthy');
    }
    
    return recommendations;
  }
}

// Create singleton instance
const proxyMonitor = new ProxyMonitor();

export default proxyMonitor;