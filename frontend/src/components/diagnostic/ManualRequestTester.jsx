/**
 * ManualRequestTester - Tool for manually testing API requests
 */

import React, { useState } from 'react'
import { requestManager } from '../../services/requestManager'

const ManualRequestTester = () => {
  const [request, setRequest] = useState({
    method: 'GET',
    url: '/api/health',
    headers: '{}',
    body: '',
    timeout: 15000
  })
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])

  const handleInputChange = (field, value) => {
    setRequest(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const validateRequest = () => {
    const errors = []

    if (!request.url.trim()) {
      errors.push('URL is required')
    }

    if (request.headers) {
      try {
        JSON.parse(request.headers)
      } catch (e) {
        errors.push('Headers must be valid JSON')
      }
    }

    if (request.body && ['GET', 'HEAD'].includes(request.method)) {
      errors.push('GET and HEAD requests cannot have a body')
    }

    if (request.body && !['GET', 'HEAD'].includes(request.method)) {
      try {
        JSON.parse(request.body)
      } catch (e) {
        errors.push('Body must be valid JSON')
      }
    }

    return errors
  }

  const executeRequest = async () => {
    const errors = validateRequest()
    if (errors.length > 0) {
      setResult({
        success: false,
        error: errors.join(', '),
        timestamp: new Date().toISOString()
      })
      return
    }

    setIsLoading(true)
    setResult(null)

    const startTime = Date.now()

    try {
      // Prepare request config
      const config = {
        method: request.method,
        url: request.url
      }

      // Add headers
      if (request.headers.trim()) {
        config.headers = JSON.parse(request.headers)
      }

      // Add body for non-GET requests
      if (request.body.trim() && !['GET', 'HEAD'].includes(request.method)) {
        config.data = JSON.parse(request.body)
      }

      // Execute request
      const response = await requestManager.makeRequest(config, {
        timeout: request.timeout
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      const resultData = {
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        duration,
        timestamp: new Date().toISOString(),
        request: { ...request }
      }

      setResult(resultData)
      
      // Add to history
      setHistory(prev => [resultData, ...prev.slice(0, 9)]) // Keep last 10

    } catch (error) {
      const endTime = Date.now()
      const duration = endTime - startTime

      const resultData = {
        success: false,
        error: error.message,
        code: error.code,
        status: error.originalError?.response?.status,
        statusText: error.originalError?.response?.statusText,
        duration,
        timestamp: new Date().toISOString(),
        request: { ...request }
      }

      setResult(resultData)
      
      // Add to history
      setHistory(prev => [resultData, ...prev.slice(0, 9)])
    } finally {
      setIsLoading(false)
    }
  }

  const loadFromHistory = (historyItem) => {
    setRequest(historyItem.request)
    setResult(historyItem)
  }

  const clearHistory = () => {
    setHistory([])
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const formatDuration = (duration) => {
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(2)}s`
  }

  const presetRequests = [
    {
      name: 'Health Check',
      method: 'GET',
      url: '/api/health',
      headers: '{}',
      body: '',
      timeout: 5000
    },
    {
      name: 'Chat Message',
      method: 'POST',
      url: '/api/chat',
      headers: '{"Content-Type": "application/json"}',
      body: '{"message": "Hello, world!"}',
      timeout: 30000
    },
    {
      name: 'Get Conversations',
      method: 'GET',
      url: '/api/conversations',
      headers: '{}',
      body: '',
      timeout: 15000
    }
  ]

  return (
    <div className="scrollable-content" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', gap: '20px', height: '100%' }}>
        {/* Request Form */}
        <div style={{ flex: 1, minWidth: '400px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Manual Request Tester</h3>
          
          {/* Presets */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
              Quick Presets:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {presetRequests.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => setRequest(preset)}
                  className="btn"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Method and URL */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <select
              value={request.method}
              onChange={(e) => handleInputChange('method', e.target.value)}
              style={{ 
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '13px',
                minWidth: '80px'
              }}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
              <option value="HEAD">HEAD</option>
            </select>
            
            <input
              type="text"
              placeholder="Enter URL (e.g., /api/health)"
              value={request.url}
              onChange={(e) => handleInputChange('url', e.target.value)}
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '13px'
              }}
            />
          </div>

          {/* Headers */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
              Headers (JSON):
            </label>
            <textarea
              value={request.headers}
              onChange={(e) => handleInputChange('headers', e.target.value)}
              placeholder='{"Content-Type": "application/json"}'
              style={{
                width: '100%',
                height: '80px',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Body */}
          {!['GET', 'HEAD'].includes(request.method) && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                Request Body (JSON):
              </label>
              <textarea
                value={request.body}
                onChange={(e) => handleInputChange('body', e.target.value)}
                placeholder='{"key": "value"}'
                style={{
                  width: '100%',
                  height: '100px',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  resize: 'vertical'
                }}
              />
            </div>
          )}

          {/* Timeout */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
              Timeout (ms):
            </label>
            <input
              type="number"
              value={request.timeout}
              onChange={(e) => handleInputChange('timeout', parseInt(e.target.value) || 15000)}
              min="1000"
              max="60000"
              step="1000"
              style={{
                width: '120px',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '13px'
              }}
            />
          </div>

          {/* Execute Button */}
          <button
            onClick={executeRequest}
            disabled={isLoading}
            className="btn btn--secondary"
            style={{ 
              width: '100%',
              padding: '10px',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            {isLoading ? 'Executing...' : 'Execute Request'}
          </button>

          {/* Result */}
          {result && (
            <div style={{ 
              marginTop: '16px',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: result.success ? '#f8f9fa' : '#fff5f5'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <span style={{ 
                  fontSize: '13px', 
                  fontWeight: '600',
                  color: result.success ? '#28a745' : '#dc3545'
                }}>
                  {result.success ? '✅ Success' : '❌ Error'}
                </span>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {formatDuration(result.duration)} • {formatTime(result.timestamp)}
                </span>
              </div>

              {result.status && (
                <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                  <strong>Status:</strong> {result.status} {result.statusText}
                </div>
              )}

              {result.error && (
                <div style={{ fontSize: '12px', marginBottom: '8px', color: '#dc3545' }}>
                  <strong>Error:</strong> {result.error}
                </div>
              )}

              {result.data && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
                    Response:
                  </div>
                  <pre style={{
                    fontSize: '11px',
                    backgroundColor: '#fff',
                    padding: '8px',
                    borderRadius: '4px',
                    overflow: 'auto',
                    maxHeight: '200px',
                    margin: 0,
                    border: '1px solid #ddd'
                  }}>
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* History */}
        <div style={{ width: '300px', borderLeft: '1px solid #e0e0e0', paddingLeft: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>History</h3>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="btn"
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >
                Clear
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              color: '#666', 
              fontSize: '13px',
              padding: '20px 0'
            }}>
              No requests executed yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {history.map((item, index) => (
                <div
                  key={index}
                  onClick={() => loadFromHistory(item)}
                  style={{
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: item.success ? '#f8f9fa' : '#fff5f5',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '600' }}>
                      {item.request.method} {item.request.url}
                    </span>
                    <span style={{ color: item.success ? '#28a745' : '#dc3545' }}>
                      {item.success ? '✅' : '❌'}
                    </span>
                  </div>
                  <div style={{ color: '#666' }}>
                    {formatDuration(item.duration)} • {formatTime(item.timestamp)}
                  </div>
                  {item.status && (
                    <div style={{ color: '#666' }}>
                      Status: {item.status}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ManualRequestTester