# Vite Proxy Configuration

This document describes the enhanced proxy configuration implemented for the frontend application to handle backend communication with improved error handling, retry logic, circuit breaker pattern, fallback mechanisms, and comprehensive monitoring.

## Features

### 1. Enhanced Error Handling
- **Comprehensive Error Logging**: All proxy errors are logged with detailed information including error codes, request details, and timing
- **Structured Error Responses**: Consistent JSON error responses with appropriate HTTP status codes
- **CORS Headers**: Proper CORS headers are set on error responses to prevent frontend CORS issues
- **Error Suggestions**: Context-aware suggestions for common error types to help with troubleshooting

### 2. Retry Logic with Exponential Backoff
- **Automatic Retries**: Failed requests are automatically retried for retryable errors
- **Exponential Backoff**: Retry delays increase exponentially (1s, 2s, 4s)
- **Configurable Limits**: Maximum of 3 retry attempts per request
- **Per-Request Tracking**: Retry attempts are tracked individually per request to prevent interference
- **Retryable Error Types**: 
  - `ECONNREFUSED` - Connection refused
  - `ENOTFOUND` - DNS resolution failed
  - `ETIMEDOUT` - Request timeout
  - `ECONNRESET` - Connection reset by peer

### 3. Circuit Breaker Pattern
- **Automatic Circuit Breaking**: Opens circuit after 5 consecutive failures to prevent cascading failures
- **Half-Open State**: Automatically tests connection recovery after timeout period
- **Configurable Thresholds**: Circuit breaker threshold and timeout can be configured via environment variables
- **Request Rejection**: Immediately rejects requests when circuit is open with appropriate error messages
- **Status Reporting**: Circuit breaker state is included in all error responses and monitoring data

### 4. Fallback Backend Support
- **Secondary Backend**: Automatically attempts fallback to secondary backend after consecutive failures
- **Configurable Thresholds**: Fallback is triggered after configurable number of consecutive failures
- **Circuit Breaker Integration**: Fallback respects circuit breaker state to prevent unnecessary attempts
- **Environment Configuration**: Fallback target and thresholds configurable via environment variables

### 5. Request Monitoring and Statistics
- **Real-time Statistics**: Tracks requests, errors, timeouts, retries, and response times
- **Response Time Analysis**: Maintains history of response times for performance monitoring
- **Health Status Tracking**: Monitors proxy health based on consecutive failures and error rates
- **Detailed Request Logging**: Comprehensive logging of all proxy requests and responses with context

### 6. Advanced Error Response Features
- **Status Code Mapping**: Different HTTP status codes for different error types:
  - `503` - Backend service not running (ECONNREFUSED) or Circuit breaker open
  - `504` - Backend service timeout (ETIMEDOUT)
  - `502` - Backend service not found (ENOTFOUND) or Connection reset (ECONNRESET)
- **Detailed Error Context**: Error responses include retry attempts, circuit breaker state, and timing information
- **Troubleshooting Suggestions**: Context-aware suggestions based on error type to help with debugging

## Configuration

### Environment Variables
The proxy configuration supports the following environment variables with automatic validation:

```bash
# Basic proxy settings
VITE_BACKEND_URL=http://localhost:8000          # Primary backend URL
VITE_PROXY_TIMEOUT=30000                        # Request timeout in milliseconds

# Circuit breaker settings
VITE_CIRCUIT_BREAKER_THRESHOLD=5                # Failures before opening circuit
VITE_CIRCUIT_BREAKER_TIMEOUT=60000              # Circuit open duration in milliseconds

# Fallback backend settings
VITE_PROXY_FALLBACK_ENABLED=true                # Enable fallback backend
VITE_PROXY_FALLBACK_TARGET=http://localhost:8001 # Fallback backend URL
VITE_PROXY_FALLBACK_THRESHOLD=5                 # Failures before attempting fallback
VITE_PROXY_FALLBACK_TIMEOUT=10000               # Fallback request timeout
```

### Configuration Validation
All environment variables are automatically validated with appropriate defaults:

- **URL Validation**: Backend and fallback URLs are validated using the URL constructor
- **Positive Integer Validation**: Timeout and threshold values must be positive integers
- **Boolean Validation**: Boolean flags must be exactly 'true' or 'false'
- **Automatic Fallback**: Invalid values trigger console warnings and use safe defaults
- **Runtime Safety**: Invalid configurations don't crash the application

Example validation behavior:
```bash
# Invalid URL - uses default with warning
VITE_BACKEND_URL=invalid-url
# Console: [PROXY CONFIG] Invalid value for VITE_BACKEND_URL: invalid-url, using default: http://localhost:8000

# Invalid timeout - uses default with warning  
VITE_PROXY_TIMEOUT=-1000
# Console: [PROXY CONFIG] Invalid value for VITE_PROXY_TIMEOUT: -1000, using default: 30000

# Invalid boolean - uses default with warning
VITE_PROXY_FALLBACK_ENABLED=yes
# Console: [PROXY CONFIG] Invalid value for VITE_PROXY_FALLBACK_ENABLED: yes, using default: false
```

### Default Configuration
```javascript
// Proxy Settings
{
  target: process.env.VITE_BACKEND_URL || 'http://localhost:8000',
  changeOrigin: true,
  timeout: parseInt(process.env.VITE_PROXY_TIMEOUT || '30000'),
  proxyTimeout: parseInt(process.env.VITE_PROXY_TIMEOUT || '30000'),
  secure: false
}

// Retry Configuration
{
  maxRetries: 3,
  retryDelay: 1000,      // Start with 1 second
  retryMultiplier: 2,    // Exponential backoff
  retryableErrors: ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET']
}

// Circuit Breaker Configuration
{
  state: 'CLOSED',       // Initial state
  threshold: parseInt(process.env.VITE_CIRCUIT_BREAKER_THRESHOLD || '5'),
  timeout: parseInt(process.env.VITE_CIRCUIT_BREAKER_TIMEOUT || '60000')
}

// Fallback Configuration
{
  enabled: process.env.VITE_PROXY_FALLBACK_ENABLED === 'true',
  target: process.env.VITE_PROXY_FALLBACK_TARGET || 'http://localhost:8001',
  maxFailuresBeforeFallback: parseInt(process.env.VITE_PROXY_FALLBACK_THRESHOLD || '5'),
  fallbackTimeout: parseInt(process.env.VITE_PROXY_FALLBACK_TIMEOUT || '10000')
}
```

## Monitoring and Diagnostics

### Global Statistics
The proxy configuration exposes comprehensive statistics that can be accessed for monitoring:

```javascript
globalThis.proxyStats = {
  requests: 0,           // Total requests processed
  errors: 0,             // Total errors encountered
  timeouts: 0,           // Total timeout occurrences
  retries: 0,            // Total retry attempts made
  lastError: null,       // Timestamp of last error
  lastSuccess: null,     // Timestamp of last successful request
  responseTimeHistory: [], // Array of recent response times (last 50)
  consecutiveFailures: 0,  // Current consecutive failure count
  isHealthy: true        // Overall proxy health status
}
```

### Circuit Breaker Status
Circuit breaker state is available globally for monitoring:

```javascript
globalThis.circuitBreakerStatus = {
  state: 'CLOSED|OPEN|HALF_OPEN',  // Current circuit breaker state
  failureCount: 0,                 // Current failure count
  lastFailureTime: null,           // Timestamp of last failure
  timeout: 60000,                  // Circuit open duration
  threshold: 5                     // Failure threshold
}
```

### Proxy Logs
Detailed logs are maintained in `globalThis.proxyLogs` with comprehensive context:

```javascript
{
  timestamp: '2023-01-01T00:00:00.000Z',
  level: 'info|warn|error',
  message: 'Descriptive message',
  method: 'GET|POST|PUT|DELETE',
  url: '/api/endpoint',
  error: 'Error details if applicable',
  responseTime: 150,
  circuitBreakerState: 'CLOSED',
  // Additional context data
}
```

## Integration with ProxyMonitor

The enhanced proxy configuration works seamlessly with the `ProxyMonitor` service to provide:

- **Health Checks**: Regular health checks to the backend
- **Status Notifications**: Real-time status updates to the UI
- **Diagnostic Information**: Comprehensive diagnostic data for debugging
- **Manual Testing**: Tools for testing specific endpoints
- **Performance Metrics**: Detailed performance analysis and monitoring
- **Connection Quality Assessment**: Intelligent quality scoring and recommendations

### Enhanced Monitoring Features

#### Performance Metrics
The ProxyMonitor now provides comprehensive performance metrics:

```javascript
const metrics = proxyMonitor.getPerformanceMetrics()
// Returns:
{
  uptime: 300000,              // Monitoring uptime in milliseconds
  totalRequests: 150,          // Total requests processed
  totalErrors: 12,             // Total errors encountered
  totalTimeouts: 3,            // Total timeout occurrences
  totalRetries: 18,            // Total retry attempts
  errorRate: 8.0,              // Error rate percentage
  successRate: 92.0,           // Success rate percentage
  retryRate: 12.0,             // Retry rate percentage
  averageResponseTime: 245,    // Average response time in ms
  medianResponseTime: 220,     // Median response time in ms
  p95ResponseTime: 450,        // 95th percentile response time
  healthScore: 85              // Overall health score (0-100)
}
```

#### Connection Quality Assessment
Intelligent assessment of connection quality with actionable recommendations:

```javascript
const quality = proxyMonitor.getConnectionQuality()
// Returns:
{
  quality: 'good',             // excellent, good, fair, poor
  score: 85,                   // Health score (0-100)
  issues: [                    // Array of identified issues
    'Elevated error rate: 8.0%'
  ],
  recommendations: [           // Actionable recommendations
    'Review backend logs for errors',
    'Check server resource usage'
  ]
}
```

#### Quality Levels
- **Excellent**: < 5% error rate, < 1s avg response time, no consecutive failures
- **Good**: < 10% error rate, < 2s avg response time, minimal issues
- **Fair**: < 20% error rate, < 5s avg response time, some consecutive failures
- **Poor**: > 20% error rate, > 5s avg response time, or circuit breaker open

## Error Response Format

### Standard Proxy Errors
When proxy errors occur after all retries are exhausted, the following error response format is returned:

```javascript
{
  error: {
    code: 'PROXY_ERROR',
    message: 'Human-readable error message',
    details: {
      type: 'ERROR_CODE',
      timestamp: '2023-01-01T00:00:00.000Z',
      retryAttempts: 3,
      maxRetries: 3,
      target: 'http://localhost:8000',
      requestId: 'proxy-123456789',
      userAgent: 'Mozilla/5.0...',
      circuitBreakerState: 'CLOSED'
    }
  },
  suggestions: [
    'Check if the backend server is running',
    'Verify network connectivity',
    'Review server logs for more details'
  ]
}
```

### Circuit Breaker Errors
When the circuit breaker is open, requests are immediately rejected with:

```javascript
{
  error: {
    code: 'CIRCUIT_BREAKER_OPEN',
    message: 'Service temporarily unavailable due to repeated failures',
    details: {
      type: 'CIRCUIT_BREAKER',
      timestamp: '2023-01-01T00:00:00.000Z',
      failureCount: 5,
      retryAfter: 60,
      target: 'http://localhost:8000',
      circuitBreakerState: 'OPEN'
    }
  },
  suggestions: [
    'Wait for the service to recover',
    'Check backend server status',
    'Try again in a few minutes'
  ]
}
```

### Timeout Errors
When requests timeout, a specific timeout error response is returned:

```javascript
{
  error: {
    code: 'PROXY_TIMEOUT',
    message: 'Request timed out',
    details: {
      type: 'TIMEOUT',
      timestamp: '2023-01-01T00:00:00.000Z',
      timeout: 30000,
      method: 'GET',
      url: '/api/endpoint',
      attempt: 1,
      target: 'http://localhost:8000'
    }
  },
  suggestions: [
    'Check network connectivity',
    'Verify backend server is responsive',
    'Consider increasing timeout values',
    'Check for backend performance issues'
  ]
}
```

### Response Headers
All error responses include comprehensive headers for debugging:

```javascript
{
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'X-Proxy-Error': 'true',
  'X-Retry-Attempts': '3',
  'X-Proxy-Target': 'http://localhost:8000',
  'X-Error-Timestamp': '2023-01-01T00:00:00.000Z',
  'X-Circuit-Breaker-State': 'CLOSED',
  'X-Circuit-Breaker': 'open',  // Only when circuit breaker is open
  'X-Proxy-Timeout': 'true',   // Only for timeout errors
  'X-Timeout-Duration': '30000', // Timeout duration for timeout errors
  'Retry-After': '60',          // Only when circuit breaker is open
  'Cache-Control': 'no-cache, no-store, must-revalidate'
}
```

## Testing

The proxy configuration is comprehensively tested with multiple test suites:

### Test Coverage
- **Unit Tests**: Testing individual components like retry logic, circuit breaker, and statistics tracking
- **Integration Tests**: Testing the complete proxy flow with mock backends and error scenarios
- **Error Scenario Tests**: Testing various error conditions, recovery mechanisms, and fallback behavior
- **Circuit Breaker Tests**: Testing circuit breaker state transitions and request rejection
- **Fallback Tests**: Testing fallback backend switching and error handling

### Test Suites
Run the complete proxy test suite with:
```bash
# Run all proxy-related tests
npm test -- --run src/__tests__/vite-proxy-simple.test.js src/__tests__/vite-proxy-enhanced.test.js src/services/__tests__/proxyMonitor.test.js src/__tests__/proxy-integration.test.js src/__tests__/proxy-enhanced-monitoring.test.js src/__tests__/proxy-config-validation.test.js

# Run individual test suites
npm test -- --run src/__tests__/vite-proxy-simple.test.js           # Basic proxy functionality
npm test -- --run src/__tests__/vite-proxy-enhanced.test.js         # Advanced features (circuit breaker, fallback)
npm test -- --run src/services/__tests__/proxyMonitor.test.js       # Proxy monitoring service
npm test -- --run src/__tests__/proxy-integration.test.js           # Integration tests
npm test -- --run src/__tests__/proxy-enhanced-monitoring.test.js   # Enhanced monitoring features
npm test -- --run src/__tests__/proxy-config-validation.test.js     # Configuration validation
```

### Test Scenarios Covered
- Network connection failures and recovery
- Backend server unavailability
- Request timeout handling
- Circuit breaker state transitions
- Fallback backend switching
- Retry logic with exponential backoff
- Error response formatting and headers
- Statistics tracking and monitoring
- Proxy health status reporting
- Environment variable validation
- Configuration error handling
- Performance metrics calculation
- Connection quality assessment
- Enhanced monitoring features

## Usage in Development

The enhanced proxy configuration is automatically active during development when running:

```bash
npm run dev
```

### Automatic Features
The proxy will automatically:
1. Forward all `/api/*` requests to the configured backend
2. Retry failed requests with exponential backoff
3. Open circuit breaker after repeated failures
4. Attempt fallback backend when configured
5. Log all proxy activity with detailed context
6. Provide structured error responses with troubleshooting suggestions
7. Track comprehensive statistics for monitoring

### Environment Setup
For optimal development experience, configure environment variables:

```bash
# .env.local
VITE_BACKEND_URL=http://localhost:8000
VITE_PROXY_FALLBACK_ENABLED=true
VITE_PROXY_FALLBACK_TARGET=http://localhost:8001
```

## Troubleshooting

### Common Issues and Solutions

1. **Backend Not Running**
   - **Symptom**: 503 status with "Backend service is not running"
   - **Solution**: Start the backend server or check the configured URL
   - **Headers**: `X-Proxy-Error: true`, `X-Circuit-Breaker-State: CLOSED`

2. **Network Issues**
   - **Symptom**: Automatic retries with exponential backoff delays
   - **Solution**: Check network connectivity and DNS resolution
   - **Monitoring**: Watch `globalThis.proxyStats.retries` for retry attempts

3. **Circuit Breaker Open**
   - **Symptom**: 503 status with "Service temporarily unavailable"
   - **Solution**: Wait for circuit breaker timeout or fix backend issues
   - **Headers**: `X-Circuit-Breaker: open`, `Retry-After: 60`

4. **Timeout Issues**
   - **Symptom**: 504 status with "Request timed out" or "Backend service timeout"
   - **Solution**: Increase timeout values or optimize backend performance
   - **Configuration**: Adjust `VITE_PROXY_TIMEOUT` environment variable
   - **Headers**: `X-Proxy-Timeout: true`, `X-Timeout-Duration: 30000`

5. **Fallback Backend Issues**
   - **Symptom**: Fallback attempts in logs but still failing
   - **Solution**: Verify fallback backend is running and accessible
   - **Headers**: `X-Fallback-Failed: true` when fallback also fails

### Debugging Tools

#### Real-time Monitoring
```javascript
// Check current proxy statistics
console.log(globalThis.proxyStats)

// Check circuit breaker status
console.log(globalThis.circuitBreakerStatus)

// View recent proxy logs
console.log(globalThis.proxyLogs.slice(-10))
```

#### ProxyMonitor Service
```javascript
import proxyMonitor from './src/services/proxyMonitor'

// Get comprehensive diagnostics
const diagnostics = proxyMonitor.getDiagnostics()

// Test specific endpoint
const result = await proxyMonitor.testEndpoint('/api/health')

// Force health check
await proxyMonitor.forceHealthCheck()

// Reset statistics
proxyMonitor.resetStats()

// Get performance metrics
const metrics = proxyMonitor.getPerformanceMetrics()

// Assess connection quality
const quality = proxyMonitor.getConnectionQuality()
```

#### Console Logging
During development, the proxy logs detailed information to the console:
- Request start/completion with timing
- Error details with suggestions
- Circuit breaker state changes
- Fallback attempts and results
- Retry attempts with delays

### Performance Monitoring
Monitor proxy performance using the enhanced monitoring capabilities:

#### Basic Statistics
- **Response Times**: `proxyStats.responseTimeHistory`
- **Error Rate**: `(errors / requests) * 100`
- **Success Rate**: `((requests - errors) / requests) * 100`
- **Retry Rate**: `(retries / requests) * 100`

#### Advanced Metrics
```javascript
const metrics = proxyMonitor.getPerformanceMetrics()
console.log(`Health Score: ${metrics.healthScore}/100`)
console.log(`Average Response Time: ${metrics.averageResponseTime}ms`)
console.log(`95th Percentile: ${metrics.p95ResponseTime}ms`)
console.log(`Error Rate: ${metrics.errorRate}%`)
```

#### Connection Quality Monitoring
```javascript
const quality = proxyMonitor.getConnectionQuality()
console.log(`Connection Quality: ${quality.quality}`)
console.log(`Issues: ${quality.issues.join(', ')}`)
console.log(`Recommendations: ${quality.recommendations.join(', ')}`)
```