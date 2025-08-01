import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import './ChatInterface.css'

const ChatInterface = ({ 
  messages = [], 
  onSendMessage, 
  isLoading = false,
  error = null,
  onRetry = null,
  onCancel = null,
  disabled = false,
  messageStatus = null,
  retryCount = 0,
  connectionStatus = 'unknown',
  progressMessage = ''
}) => {
  const [inputDisabled, setInputDisabled] = useState(false)

  const handleSendMessage = useCallback(async (message) => {
    if (!onSendMessage || disabled) {
      return
    }

    setInputDisabled(true)
    
    try {
      await onSendMessage(message)
    } catch (error) {
      console.error('Failed to send message:', error)
      throw error // Re-throw to let ChatInput handle the error
    } finally {
      setInputDisabled(false)
    }
  }, [onSendMessage, disabled])

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry()
    }
  }, [onRetry])

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel()
    }
  }, [onCancel])

  const getErrorSeverity = () => {
    if (messageStatus === 'timeout') return 'warning'
    if (messageStatus === 'failed') return 'error'
    if (connectionStatus === 'disconnected') return 'error'
    if (connectionStatus === 'slow') return 'warning'
    return 'error'
  }

  const getRetryButtonText = () => {
    if (retryCount > 0) {
      return `Try Again (${retryCount + 1})`
    }
    return 'Try Again'
  }

  return (
    <div className="chat-interface">
      <div className="chat-interface__container">
        {/* Enhanced Error Banner */}
        {error && (
          <div className={`chat-interface__error chat-interface__error--${getErrorSeverity()}`}>
            <div className="chat-interface__error-content">
              <div className="chat-interface__error-icon">
                {messageStatus === 'timeout' ? '⏰' : 
                 messageStatus === 'cancelled' ? '🚫' :
                 connectionStatus === 'disconnected' ? '📡' : '⚠️'}
              </div>
              <div className="chat-interface__error-message">
                <strong>
                  {messageStatus === 'timeout' ? 'Request Timed Out' :
                   messageStatus === 'cancelled' ? 'Request Cancelled' :
                   connectionStatus === 'disconnected' ? 'Connection Lost' :
                   'Something went wrong'}
                </strong>
                <p>{error}</p>
                {retryCount > 0 && (
                  <p className="chat-interface__error-retry-count">
                    Retry attempt: {retryCount}
                  </p>
                )}
              </div>
              <div className="chat-interface__error-actions">
                {onRetry && (
                  <button 
                    onClick={handleRetry}
                    className="chat-interface__error-retry"
                    aria-label="Retry last action"
                    disabled={isLoading}
                  >
                    {getRetryButtonText()}
                  </button>
                )}
                {onCancel && isLoading && (
                  <button 
                    onClick={handleCancel}
                    className="chat-interface__error-cancel"
                    aria-label="Cancel current request"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Progress Message */}
        {progressMessage && isLoading && (
          <div className="chat-interface__progress">
            <div className="chat-interface__progress-content">
              <div className="chat-interface__progress-icon">⏳</div>
              <div className="chat-interface__progress-message">
                {progressMessage}
              </div>
              {onCancel && (
                <button 
                  onClick={handleCancel}
                  className="chat-interface__progress-cancel"
                  aria-label="Cancel current request"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="chat-interface__messages">
          <MessageList 
            messages={messages} 
            isLoading={isLoading}
            messageStatus={messageStatus}
            onRetryMessage={onRetry}
          />
        </div>

        {/* Input Area */}
        <div className="chat-interface__input">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={disabled || inputDisabled || isLoading}
            placeholder={
              disabled 
                ? connectionStatus === 'disconnected' 
                  ? "Offline - check your connection" 
                  : "Chat is disabled"
                : isLoading 
                  ? messageStatus === 'sending' 
                    ? "Sending message..." 
                    : "AI is responding..."
                  : "Type your message..."
            }
            messageStatus={messageStatus}
            connectionStatus={connectionStatus}
          />
        </div>
      </div>
    </div>
  )
}

ChatInterface.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      content: PropTypes.string.isRequired,
      timestamp: PropTypes.string.isRequired,
      sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
      mcp_tools_used: PropTypes.arrayOf(PropTypes.string),
      status: PropTypes.oneOf(['sending', 'sent', 'delivered', 'failed', 'timeout', 'cancelled'])
    })
  ),
  onSendMessage: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
  error: PropTypes.string,
  onRetry: PropTypes.func,
  onCancel: PropTypes.func,
  disabled: PropTypes.bool,
  messageStatus: PropTypes.oneOf(['sending', 'sent', 'failed', 'timeout', 'cancelled']),
  retryCount: PropTypes.number,
  connectionStatus: PropTypes.string,
  progressMessage: PropTypes.string
}

export default ChatInterface