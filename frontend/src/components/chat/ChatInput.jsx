import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import './ChatInput.css'

const ChatInput = ({ 
  onSendMessage, 
  disabled = false, 
  placeholder = "Type your message...",
  maxLength = 2000,
  messageStatus = null,
  connectionStatus = 'unknown'
}) => {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const trimmedMessage = message.trim()
    if (!trimmedMessage || isSubmitting || disabled) {
      return
    }

    setIsSubmitting(true)
    
    try {
      await onSendMessage(trimmedMessage)
      setMessage('')
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    
    // Enforce character limit
    if (value.length <= maxLength) {
      setMessage(value)
      
      // Auto-resize textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
    }
  }

  const isMessageValid = message.trim().length > 0
  const charactersRemaining = maxLength - message.length
  const isNearLimit = charactersRemaining < 100

  const getConnectionStatusIndicator = () => {
    switch (connectionStatus) {
      case 'connected':
        return { icon: '🟢', text: 'Connected', className: 'connected' }
      case 'slow':
        return { icon: '🟡', text: 'Slow connection', className: 'slow' }
      case 'disconnected':
        return { icon: '🔴', text: 'Offline', className: 'disconnected' }
      default:
        return { icon: '⚪', text: 'Unknown', className: 'unknown' }
    }
  }

  const connectionInfo = getConnectionStatusIndicator()
  const showConnectionWarning = connectionStatus === 'disconnected' || connectionStatus === 'slow'

  return (
    <div className="chat-input">
      <form onSubmit={handleSubmit} className="chat-input__form">
        <div className="chat-input__container">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isSubmitting}
            className={`chat-input__textarea ${isNearLimit ? 'chat-input__textarea--warning' : ''}`}
            rows={1}
            maxLength={maxLength}
            aria-label="Chat message input"
          />
          
          <button
            type="submit"
            disabled={!isMessageValid || disabled || isSubmitting}
            className="chat-input__send-button"
            aria-label="Send message"
          >
            {isSubmitting ? (
              <div className="chat-input__loading">
                <div className="chat-input__loading-spinner"></div>
              </div>
            ) : (
              <svg 
                className="chat-input__send-icon" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor"
              >
                <path d="m22 2-7 20-4-9-9-4z"/>
                <path d="M22 2 11 13"/>
              </svg>
            )}
          </button>
        </div>
        
        {/* Footer with status and hints */}
        <div className="chat-input__footer">
          <div className="chat-input__footer-left">
            <div className={`chat-input__connection-status chat-input__connection-status--${connectionInfo.className}`}>
              <span className="chat-input__connection-icon">{connectionInfo.icon}</span>
              <span className="chat-input__connection-text">{connectionInfo.text}</span>
            </div>
            {messageStatus && (
              <div className={`chat-input__message-status chat-input__message-status--${messageStatus}`}>
                {messageStatus === 'sending' && '⏳ Sending...'}
                {messageStatus === 'sent' && '✓ Sent'}
                {messageStatus === 'failed' && '❌ Failed'}
                {messageStatus === 'timeout' && '⏰ Timed out'}
                {messageStatus === 'cancelled' && '🚫 Cancelled'}
              </div>
            )}
          </div>
          
          <div className="chat-input__footer-right">
            <div className={`chat-input__counter ${isNearLimit ? 'chat-input__counter--warning' : ''}`}>
              {charactersRemaining} characters remaining
            </div>
            <div className="chat-input__hint">
              {showConnectionWarning 
                ? connectionStatus === 'disconnected' 
                  ? 'Check your connection to send messages'
                  : 'Connection is slow - messages may take longer'
                : 'Press Enter to send, Shift+Enter for new line'
              }
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

ChatInput.propTypes = {
  onSendMessage: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  placeholder: PropTypes.string,
  maxLength: PropTypes.number,
  messageStatus: PropTypes.oneOf(['sending', 'sent', 'failed', 'timeout', 'cancelled']),
  connectionStatus: PropTypes.string
}

export default ChatInput