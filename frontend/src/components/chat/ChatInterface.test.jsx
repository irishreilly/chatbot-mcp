import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ChatInterface from './ChatInterface'

// Mock the child components
vi.mock('./MessageList', () => ({
  default: ({ messages, isLoading, messageStatus, onRetryMessage }) => (
    <div data-testid="message-list">
      <div data-testid="message-count">{messages.length}</div>
      {isLoading && <div data-testid="loading-indicator">Loading...</div>}
      {messageStatus && <div data-testid="message-status">{messageStatus}</div>}
      {onRetryMessage && <button data-testid="retry-message" onClick={onRetryMessage}>Retry Message</button>}
    </div>
  )
}))

vi.mock('./ChatInput', () => ({
  default: ({ onSendMessage, disabled, placeholder, messageStatus, connectionStatus }) => (
    <div data-testid="chat-input">
      <input
        data-testid="input-field"
        disabled={disabled}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.value && !disabled) {
            onSendMessage(e.target.value)
          }
        }}
      />
      {messageStatus && <div data-testid="input-message-status">{messageStatus}</div>}
      {connectionStatus && <div data-testid="input-connection-status">{connectionStatus}</div>}
    </div>
  )
}))

describe('ChatInterface Enhanced Error Handling', () => {
  const mockMessages = [
    {
      id: '1',
      content: 'Hello!',
      timestamp: '2024-01-01T12:00:00Z',
      sender: 'user',
      mcp_tools_used: [],
      status: 'sent'
    },
    {
      id: '2',
      content: 'Hi there!',
      timestamp: '2024-01-01T12:01:00Z',
      sender: 'assistant',
      mcp_tools_used: [],
      status: 'delivered'
    }
  ]

  const mockOnSendMessage = vi.fn()
  const mockOnRetry = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    mockOnSendMessage.mockClear()
    mockOnRetry.mockClear()
    mockOnCancel.mockClear()
  })

  it('renders MessageList and ChatInput components', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage} 
      />
    )
    
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    expect(screen.getByTestId('message-count')).toHaveTextContent('2')
  })

  it('passes messages to MessageList', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage} 
      />
    )
    
    expect(screen.getByTestId('message-count')).toHaveTextContent('2')
  })

  it('passes loading state to MessageList', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        isLoading={true}
      />
    )
    
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
  })

  it('handles message sending', async () => {
    const user = userEvent.setup()
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage} 
      />
    )
    
    const input = screen.getByTestId('input-field')
    await user.type(input, 'Test message')
    await user.keyboard('{Enter}')
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message')
  })

  it('disables input when loading', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        isLoading={true}
      />
    )
    
    const input = screen.getByTestId('input-field')
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('placeholder', 'AI is responding...')
  })

  it('disables input when disabled prop is true', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        disabled={true}
      />
    )
    
    const input = screen.getByTestId('input-field')
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('placeholder', 'Chat is disabled')
  })

  it('shows default placeholder when not disabled or loading', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
      />
    )
    
    const input = screen.getByTestId('input-field')
    expect(input).toHaveAttribute('placeholder', 'Type your message...')
  })

  it('displays error banner when error is provided', () => {
    const errorMessage = 'Network connection failed'
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error={errorMessage}
      />
    )
    
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(errorMessage)).toBeInTheDocument()
  })

  it('shows retry button when error and onRetry are provided', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Network error"
        onRetry={mockOnRetry}
      />
    )
    
    const retryButton = screen.getByLabelText(/retry last action/i)
    expect(retryButton).toBeInTheDocument()
  })

  it('calls onRetry when retry button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Network error"
        onRetry={mockOnRetry}
      />
    )
    
    const retryButton = screen.getByLabelText(/retry last action/i)
    await user.click(retryButton)
    
    expect(mockOnRetry).toHaveBeenCalledTimes(1)
  })

  it('does not show retry button when onRetry is not provided', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Network error"
      />
    )
    
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('does not show error banner when no error', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
      />
    )
    
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('handles async onSendMessage', async () => {
    const asyncOnSendMessage = vi.fn(() => Promise.resolve())
    const user = userEvent.setup()
    
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={asyncOnSendMessage}
      />
    )
    
    const input = screen.getByTestId('input-field')
    await user.type(input, 'Async message')
    await user.keyboard('{Enter}')
    
    await waitFor(() => {
      expect(asyncOnSendMessage).toHaveBeenCalledWith('Async message')
    })
  })

  it('handles onSendMessage errors gracefully', async () => {
    const errorOnSendMessage = vi.fn(() => Promise.reject(new Error('Send failed')))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={errorOnSendMessage}
      />
    )
    
    const input = screen.getByTestId('input-field')
    
    await user.type(input, 'Error message')
    await user.keyboard('{Enter}')
    
    // Wait for the error to be logged
    await waitFor(() => {
      expect(errorOnSendMessage).toHaveBeenCalledWith('Error message')
      expect(consoleSpy).toHaveBeenCalledWith('Failed to send message:', expect.any(Error))
    })
    
    consoleSpy.mockRestore()
  })

  it('renders with empty messages array', () => {
    render(
      <ChatInterface 
        messages={[]} 
        onSendMessage={mockOnSendMessage}
      />
    )
    
    expect(screen.getByTestId('message-count')).toHaveTextContent('0')
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })

  it('has proper CSS classes for styling', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
      />
    )
    
    const chatInterface = screen.getByTestId('message-list').closest('.chat-interface')
    expect(chatInterface).toBeInTheDocument()
    
    const container = chatInterface.querySelector('.chat-interface__container')
    expect(container).toBeInTheDocument()
    
    const messagesArea = container.querySelector('.chat-interface__messages')
    expect(messagesArea).toBeInTheDocument()
    
    const inputArea = container.querySelector('.chat-interface__input')
    expect(inputArea).toBeInTheDocument()
  })

  it('handles missing onSendMessage gracefully', async () => {
    const user = userEvent.setup()
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={undefined}
      />
    )
    
    const input = screen.getByTestId('input-field')
    
    // Should not throw error when onSendMessage is undefined
    await user.type(input, 'Test message')
    
    // No assertions needed - test passes if no error is thrown
  })

  // Enhanced error handling tests
  it('shows enhanced error banner with different severities', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Connection timeout"
        messageStatus="timeout"
        connectionStatus="slow"
      />
    )
    
    expect(screen.getByText('Request Timed Out')).toBeInTheDocument()
    expect(screen.getByText('Connection timeout')).toBeInTheDocument()
  })

  it('shows cancel button when request is active', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Network error"
        onCancel={mockOnCancel}
        isLoading={true}
      />
    )
    
    const cancelButton = screen.getByText('Cancel')
    expect(cancelButton).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Network error"
        onCancel={mockOnCancel}
        isLoading={true}
      />
    )
    
    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)
    
    expect(mockOnCancel).toHaveBeenCalledTimes(1)
  })

  it('shows retry count in error message', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Network error"
        onRetry={mockOnRetry}
        retryCount={2}
      />
    )
    
    expect(screen.getByText('Try Again (3)')).toBeInTheDocument()
    expect(screen.getByText('Retry attempt: 2')).toBeInTheDocument()
  })

  it('shows different error icons based on message status', () => {
    const { rerender } = render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Timeout error"
        messageStatus="timeout"
      />
    )
    
    expect(screen.getByText('Request Timed Out')).toBeInTheDocument()
    
    rerender(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Cancelled"
        messageStatus="cancelled"
      />
    )
    
    expect(screen.getByText('Request Cancelled')).toBeInTheDocument()
  })

  it('shows connection status in error for disconnected state', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Connection lost"
        connectionStatus="disconnected"
      />
    )
    
    expect(screen.getByText('Connection Lost')).toBeInTheDocument()
  })

  it('passes enhanced props to MessageList', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        messageStatus="sending"
        onRetry={mockOnRetry}
      />
    )
    
    expect(screen.getByTestId('message-status')).toHaveTextContent('sending')
    expect(screen.getByTestId('retry-message')).toBeInTheDocument()
  })

  it('passes enhanced props to ChatInput', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        messageStatus="failed"
        connectionStatus="slow"
      />
    )
    
    expect(screen.getByTestId('input-message-status')).toHaveTextContent('failed')
    expect(screen.getByTestId('input-connection-status')).toHaveTextContent('slow')
  })

  it('shows appropriate placeholder for offline mode', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        disabled={true}
        connectionStatus="disconnected"
      />
    )
    
    const input = screen.getByTestId('input-field')
    expect(input).toHaveAttribute('placeholder', 'Offline - check your connection')
  })

  it('shows sending status in placeholder', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        isLoading={true}
        messageStatus="sending"
      />
    )
    
    const input = screen.getByTestId('input-field')
    expect(input).toHaveAttribute('placeholder', 'Sending message...')
  })

  it('disables retry button when loading', () => {
    render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Network error"
        onRetry={mockOnRetry}
        isLoading={true}
      />
    )
    
    const retryButton = screen.getByText('Try Again')
    expect(retryButton).toBeDisabled()
  })

  it('handles error severity styling', () => {
    const { container } = render(
      <ChatInterface 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        error="Warning message"
        messageStatus="timeout"
      />
    )
    
    const errorBanner = container.querySelector('.chat-interface__error--warning')
    expect(errorBanner).toBeInTheDocument()
  })})
