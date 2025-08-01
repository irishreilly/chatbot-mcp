/**
 * PerformanceMetrics - Display performance metrics and statistics
 */

import React, { useState, useEffect } from 'react'

const PerformanceMetrics = ({ requestStats, healthStats, connectionStatus }) => {
  const [memoryInfo, setMemoryInfo] = useState(null)
  const [performanceEntries, setPerformanceEntries] = useState([])

  // Get memory information if available
  useEffect(() => {
    if (performance.memory) {
      const updateMemoryInfo = () => {
        setMemoryInfo({
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        })
      }

      updateMemoryInfo()
      const interval = setInterval(updateMemoryInfo, 2000)
      return () => clearInterval(interval)
    }
  }, [])

  // Get performance entries
  useEffect(() => {
    const entries = performance.getEntriesByType('navigation')
    setPerformanceEntries(entries)
  }, [])

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`
  }

  const getStatusColor = (status) => {
    const colors = {
      connected: '#28a745',
      disconnected: '#dc3545',
      slow: '#ffc107',
      unknown: '#6c757d'
    }
    return colors[status] || '#6c757d'
  }

  const MetricCard = ({ title, value, subtitle, color = '#333', icon }) => (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: '6px',
      padding: '16px',
      textAlign: 'center',
      minWidth: '140px'
    }}>
      {icon && (
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: '24px', fontWeight: '600', color, marginBottom: '4px' }}>
        {value}
      </div>
      <div style={{ fontSize: '14px', fontWeight: '500', color: '#333', marginBottom: '2px' }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: '12px', color: '#666' }}>
          {subtitle}
        </div>
      )}
    </div>
  )

  const ProgressBar = ({ value, max, color = '#007bff', label }) => (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '4px',
        fontSize: '13px'
      }}>
        <span>{label}</span>
        <span>{formatPercentage((value / max) * 100)}</span>
      </div>
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: '#e0e0e0',
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${Math.min((value / max) * 100, 100)}%`,
          height: '100%',
          backgroundColor: color,
          transition: 'width 0.3s ease'
        }} />
      </div>
    </div>
  )

  return (
    <div className="scrollable-content" style={{ padding: '20px' }}>
      {/* Request Statistics */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Request Statistics</h3>
        
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <MetricCard
            title="Active Requests"
            value={requestStats.active || 0}
            icon="⚡"
            color={requestStats.active > 0 ? '#ffc107' : '#28a745'}
          />
          
          <MetricCard
            title="Total Requests"
            value={requestStats.total || 0}
            icon="📊"
          />
          
          <MetricCard
            title="Success Rate"
            value={formatPercentage(requestStats.successRate || 0)}
            icon="✅"
            color={requestStats.successRate >= 90 ? '#28a745' : requestStats.successRate >= 70 ? '#ffc107' : '#dc3545'}
          />
          
          <MetricCard
            title="Failed Requests"
            value={requestStats.failed || 0}
            icon="❌"
            color={requestStats.failed > 0 ? '#dc3545' : '#28a745'}
          />
          
          <MetricCard
            title="Timeouts"
            value={requestStats.timedOut || 0}
            icon="⏱️"
            color={requestStats.timedOut > 0 ? '#fd7e14' : '#28a745'}
          />
        </div>

        {/* Request breakdown */}
        {requestStats.total > 0 && (
          <div style={{ 
            background: '#f8f9fa',
            padding: '16px',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>Request Breakdown</h4>
            
            <ProgressBar
              label="Successful"
              value={requestStats.successful || 0}
              max={requestStats.total}
              color="#28a745"
            />
            
            <ProgressBar
              label="Failed"
              value={requestStats.failed || 0}
              max={requestStats.total}
              color="#dc3545"
            />
            
            <ProgressBar
              label="Cancelled"
              value={requestStats.cancelled || 0}
              max={requestStats.total}
              color="#6c757d"
            />
            
            <ProgressBar
              label="Timed Out"
              value={requestStats.timedOut || 0}
              max={requestStats.total}
              color="#fd7e14"
            />
          </div>
        )}
      </div>

      {/* Connection Health */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Connection Health</h3>
        
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <MetricCard
            title="Status"
            value={connectionStatus.status || 'unknown'}
            icon="🌐"
            color={getStatusColor(connectionStatus.status)}
          />
          
          <MetricCard
            title="Response Time"
            value={`${connectionStatus.responseTime || 0}ms`}
            icon="⚡"
            color={connectionStatus.responseTime < 1000 ? '#28a745' : connectionStatus.responseTime < 3000 ? '#ffc107' : '#dc3545'}
          />
          
          <MetricCard
            title="Success Rate"
            value={formatPercentage(healthStats.successRate || 0)}
            icon="📈"
            color={healthStats.successRate >= 90 ? '#28a745' : healthStats.successRate >= 70 ? '#ffc107' : '#dc3545'}
          />
          
          <MetricCard
            title="Consecutive Errors"
            value={connectionStatus.consecutiveErrors || 0}
            icon="⚠️"
            color={connectionStatus.consecutiveErrors === 0 ? '#28a745' : connectionStatus.consecutiveErrors < 3 ? '#ffc107' : '#dc3545'}
          />
        </div>

        <div style={{ 
          background: '#f8f9fa',
          padding: '16px',
          borderRadius: '6px',
          border: '1px solid #e0e0e0'
        }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>Health Check History</h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Total Checks</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>{healthStats.total || 0}</div>
            </div>
            
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Successful</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#28a745' }}>{healthStats.successful || 0}</div>
            </div>
            
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Failed</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#dc3545' }}>{healthStats.failed || 0}</div>
            </div>
            
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Avg Response</div>
              <div style={{ fontSize: '16px', fontWeight: '600' }}>
                {healthStats.averageResponseTime ? `${healthStats.averageResponseTime.toFixed(0)}ms` : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Memory Usage */}
      {memoryInfo && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Memory Usage</h3>
          
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <MetricCard
              title="Used Heap"
              value={formatBytes(memoryInfo.usedJSHeapSize)}
              icon="💾"
              color="#007bff"
            />
            
            <MetricCard
              title="Total Heap"
              value={formatBytes(memoryInfo.totalJSHeapSize)}
              icon="📦"
              color="#6f42c1"
            />
            
            <MetricCard
              title="Heap Limit"
              value={formatBytes(memoryInfo.jsHeapSizeLimit)}
              icon="🔒"
              color="#6c757d"
            />
          </div>

          <div style={{ 
            background: '#f8f9fa',
            padding: '16px',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>Memory Breakdown</h4>
            
            <ProgressBar
              label="Used Memory"
              value={memoryInfo.usedJSHeapSize}
              max={memoryInfo.jsHeapSizeLimit}
              color="#007bff"
            />
            
            <ProgressBar
              label="Total Allocated"
              value={memoryInfo.totalJSHeapSize}
              max={memoryInfo.jsHeapSizeLimit}
              color="#6f42c1"
            />
          </div>
        </div>
      )}

      {/* Performance Timing */}
      {performanceEntries.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Page Performance</h3>
          
          <div style={{ 
            background: '#f8f9fa',
            padding: '16px',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            {performanceEntries.map((entry, index) => (
              <div key={index}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>DNS Lookup</div>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>
                      {(entry.domainLookupEnd - entry.domainLookupStart).toFixed(0)}ms
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Connect Time</div>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>
                      {(entry.connectEnd - entry.connectStart).toFixed(0)}ms
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Response Time</div>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>
                      {(entry.responseEnd - entry.responseStart).toFixed(0)}ms
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>DOM Load</div>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>
                      {(entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart).toFixed(0)}ms
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Page Load</div>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>
                      {(entry.loadEventEnd - entry.loadEventStart).toFixed(0)}ms
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Total Time</div>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>
                      {(entry.loadEventEnd - entry.navigationStart).toFixed(0)}ms
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default PerformanceMetrics