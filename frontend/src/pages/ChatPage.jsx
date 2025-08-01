import React, { useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ChatInterface from '../components/chat/ChatInterface'
import { chatAPI, errorUtils } from '../services/simpleApiClient'
import { 
  setCurrentConversation, 
  addMessage, 
  setLoading, 
  setError, 
  clearError 
} from '../store/chatSlice'
import './ChatPage.css'

const ChatPage = () => {
  const dispatch = useDispatch()
  const { currentConversationId, conversations, isLoading, error } = useSelector(state => state.chat)
  const [messageStatus, setMessageStatus] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [requestStartTime, setRequestStartTime] = useState(null)
  const [progressTimer, setProgressTimer] = useState(null)
  const [cancelController, setCancelController] = useState(null)

  const currentConversation = currentConversationId ? conversations[currentConversationId] : null
  const messages = currentConversation?.messages || []

  const startProgressTimer = useCallback(() => {
    const startTime = Date.now()
    setRequestStartTime(startTime)
    
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      
      if (elapsed > 15000 && elapsed < 30000) {
        setProgressMessage('Still processing your request... This may take a moment for complex queries.')
      } else if (elapsed > 30000) {
        setProgressMessage('This is taking longer than usual. You can cancel if needed.')
      }
    }, 1000)
    
    setProgressTimer(timer)
  }, [])

  const clearProgressTimer = useCallback(() => {
    if (progressTimer) {
      clearInterval(progressTimer)
      setProgressTimer(null)
    }
    setProgressMessage('')
    setRequestStartTime(null)
  }, [progressTimer])

  const handleSendMessage = useCallback(async (message) => {
    if (!message.trim()) return

    const conversationId = currentConversationId || `conv_${Date.now()}`
    
    // Add user message
    const userMessage = {
      id: `msg_${Date.now()}`,
      content: message,
      timestamp: new Date().toISOString(),
      sender: 'user'
    }

    dispatch(addMessage({ conversationId, message: userMessage }))
    dispatch(setCurrentConversation(conversationId))
    dispatch(setLoading(true))
    dispatch(clearError())
    setMessageStatus('sending')
    
    // Start progress timer
    startProgressTimer()
    
    // Create abort controller for cancellation
    const controller = new AbortController()
    setCancelController(controller)

    try {
      // Send message to backend with abort signal
      const response = await chatAPI.sendMessage(message, conversationId, {
        signal: controller.signal
      })
      
      // Add assistant response
      const assistantMessage = {
        id: `msg_${Date.now() + 1}`,
        content: response.response || response.message || 'No response received',
        timestamp: new Date().toISOString(),
        sender: 'assistant',
        mcp_tools_used: response.mcp_tools_used || []
      }

      dispatch(addMessage({ conversationId, message: assistantMessage }))
      setMessageStatus('sent')
      setRetryCount(0)
    } catch (error) {
      console.error('Failed to send message:', error)
      
      if (error.name === 'AbortError') {
        setMessageStatus('cancelled')
        dispatch(setError('Request was cancelled'))
      } else {
        const userFriendlyMessage = errorUtils.getUserMessage(error)
        const retrySuggestion = errorUtils.getRetrySuggestion(error)
        dispatch(setError(`${userFriendlyMessage} ${retrySuggestion}`))
        
        if (errorUtils.isMCPError(error)) {
          setMessageStatus('timeout')
        } else {
          setMessageStatus('failed')
        }
      }
    } finally {
      dispatch(setLoading(false))
      clearProgressTimer()
      setCancelController(null)
    }
  }, [dispatch, currentConversationId, startProgressTimer, clearProgressTimer])

  const handleRetry = useCallback(async () => {
    setRetryCount(prev => prev + 1)
    dispatch(clearError())
    
    // Get the last user message to retry
    const lastUserMessage = messages.filter(m => m.sender === 'user').pop()
    if (lastUserMessage) {
      await handleSendMessage(lastUserMessage.content)
    }
  }, [dispatch, messages, handleSendMessage])

  const handleCancel = useCallback(() => {
    if (cancelController) {
      cancelController.abort()
    }
    dispatch(setLoading(false))
    dispatch(clearError())
    setMessageStatus('cancelled')
    clearProgressTimer()
  }, [dispatch, cancelController, clearProgressTimer])

  return (
    <div className="chat-page">
      <div className="chat-page__container">
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          error={error}
          onRetry={handleRetry}
          onCancel={handleCancel}
          messageStatus={messageStatus}
          retryCount={retryCount}
          connectionStatus="connected"
          progressMessage={progressMessage}
        />
      </div>
    </div>
  )
}

export default ChatPage