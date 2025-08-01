import React, { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import Message from './Message'
import './MessageList.css'

const MessageList = ({ 
  messages = [], 
  isLoading = false, 
  messageStatus = null,
  onRetryMessage = null 
}) => {
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      })
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Handle empty state
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="message-list message-list--empty">
        <div className="message-list__empty-state">
          <div className="message-list__empty-icon">💬</div>
          <h3 className="message-list__empty-title">Start a conversation</h3>
          <p className="message-list__empty-description">
            Send a message to begin chatting with the AI assistant
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="message-list" ref={containerRef}>
      <div className="message-list__container">
        {messages.map((message, index) => (
          <Message
            key={message.id}
            message={message}
            isUser={message.sender === 'user'}
            status={message.status || (message.sender === 'user' ? 'sent' : 'delivered')}
            onRetry={message.status === 'failed' && onRetryMessage ? onRetryMessage : null}
          />
        ))}
        
        {/* Loading indicator with status */}
        {isLoading && (
          <div className="message message--assistant">
            <div className="message__bubble message__bubble--loading">
              <div className="message__loading">
                <div className="message__loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="message__loading-text">
                  {messageStatus === 'sending' ? 'Sending message...' : 'AI is thinking...'}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}

MessageList.propTypes = {
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
  isLoading: PropTypes.bool,
  messageStatus: PropTypes.string,
  onRetryMessage: PropTypes.func
}

export default MessageList