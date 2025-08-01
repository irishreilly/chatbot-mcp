import React from 'react'
import PropTypes from 'prop-types'
import './Message.css'

const Message = ({ message, isUser = false, status = 'sent', onRetry = null }) => {
  const { content, timestamp, mcp_tools_used = [], mcp_tool_results = [] } = message
  
  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now - date) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })
    } else {
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    }
  }

  // Format message content with basic markdown-like formatting
  const formatContent = (content) => {
    if (!content) return ''
    
    // Convert **bold** to <strong>
    let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    
    // Convert *italic* to <em>
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>')
    
    // Convert `code` to <code>
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>')
    
    // Convert URLs to links
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g, 
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    
    // Convert line breaks to <br>
    formatted = formatted.replace(/\n/g, '<br>')
    
    return formatted
  }

  // Get status icon and text
  const getStatusInfo = () => {
    switch (status) {
      case 'sending':
        return { icon: '⏳', text: 'Sending...', className: 'sending' }
      case 'sent':
        return { icon: '✓', text: 'Sent', className: 'sent' }
      case 'delivered':
        return { icon: '✓✓', text: 'Delivered', className: 'delivered' }
      case 'failed':
        return { icon: '❌', text: 'Failed to send', className: 'failed' }
      case 'timeout':
        return { icon: '⏰', text: 'Timed out', className: 'timeout' }
      case 'cancelled':
        return { icon: '🚫', text: 'Cancelled', className: 'cancelled' }
      default:
        return { icon: '', text: '', className: '' }
    }
  }

  const statusInfo = getStatusInfo()
  const showRetry = (status === 'failed' || status === 'timeout') && onRetry

  // Format MCP tool results for display
  const formatToolResults = (results) => {
    if (!results || results.length === 0) return null
    
    return results.map((result, index) => (
      <div key={index} className="message__tool-result">
        <div className="message__tool-result-header">
          <span className="message__tool-result-name">{result.tool_name}</span>
          {result.execution_time && (
            <span className="message__tool-result-time">
              {Math.round(result.execution_time)}ms
            </span>
          )}
        </div>
        {result.result && (
          <div className="message__tool-result-content">
            {typeof result.result === 'string' 
              ? result.result 
              : JSON.stringify(result.result, null, 2)
            }
          </div>
        )}
      </div>
    ))
  }

  return (
    <div className={`message ${isUser ? 'message--user' : 'message--assistant'}`}>
      <div className="message__bubble">
        <div 
          className="message__content"
          dangerouslySetInnerHTML={{ __html: formatContent(content) }}
        />
        
        {/* MCP Tools Used */}
        {mcp_tools_used.length > 0 && (
          <div className="message__tools">
            <span className="message__tools-label">🔧 Tools used:</span>
            <div className="message__tools-list">
              {mcp_tools_used.map((tool, index) => (
                <span key={index} className="message__tool-tag">
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* MCP Tool Results */}
        {mcp_tool_results && mcp_tool_results.length > 0 && (
          <div className="message__tool-results">
            <span className="message__tool-results-label">📊 Tool Results:</span>
            {formatToolResults(mcp_tool_results)}
          </div>
        )}
        
        {/* Timestamp and Status */}
        <div className="message__footer">
          <div className="message__timestamp">
            {formatTimestamp(timestamp)}
          </div>
          {isUser && (
            <div className={`message__status message__status--${statusInfo.className}`}>
              <span className="message__status-icon">{statusInfo.icon}</span>
              <span className="message__status-text">{statusInfo.text}</span>
              {showRetry && (
                <button 
                  className="message__retry-button"
                  onClick={onRetry}
                  aria-label="Retry sending message"
                  title="Click to retry sending this message"
                >
                  🔄 Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

Message.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    timestamp: PropTypes.string.isRequired,
    sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
    mcp_tools_used: PropTypes.arrayOf(PropTypes.string),
    mcp_tool_results: PropTypes.arrayOf(PropTypes.shape({
      tool_name: PropTypes.string,
      result: PropTypes.any,
      execution_time: PropTypes.number
    }))
  }).isRequired,
  isUser: PropTypes.bool,
  status: PropTypes.oneOf(['sending', 'sent', 'delivered', 'failed', 'timeout', 'cancelled']),
  onRetry: PropTypes.func
}

export default Message