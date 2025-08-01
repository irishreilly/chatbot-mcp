import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MessageList from './MessageList'

// Mock the Message component
vi.mock('./Message', () => ({
  default: ({ message, isUser }) => (
    <div data-testid={`message-${message.id}`} className={isUser ? 'user-message' : 'assistant-message'}>
      {message.content}
    </div>
  )
}))

describe('MessageList Component', () => {
  const mockMessages = [
    {
      id: '1',
      content: 'Hello!',
      timestamp: '2024-01-01T12:00:00Z',
      sender: 'user',
      mcp_tools_used: []
    },
    {
      id: '2',
      content: 'Hi there! How can I help you?',
      timestamp: '2024-01-01T12:01:00Z',
      sender: 'assistant',
      mcp_tools_used: []
    },
    {
      id: '3',
      content: 'What is the weather like?',
      timestamp: '2024-01-01T12:02:00Z',
      sender: 'user',
      mcp_tools_used: []
    }
  ]

  it('renders empty state when no messages', () => {
    render(<MessageList messages={[]} />)
    
    expect(screen.getByText('Start a conversation')).toBeInTheDocument()
    expect(screen.getByText('Send a message to begin chatting with the AI assistant')).toBeInTheDocument()
    expect(screen.getByText('💬')).toBeInTheDocument()
  })

  it('renders messages correctly', () => {
    render(<MessageList messages={mockMessages} />)
    
    expect(screen.getByTestId('message-1')).toBeInTheDocument()
    expect(screen.getByTestId('message-2')).toBeInTheDocument()
    expect(screen.getByTestId('message-3')).toBeInTheDocument()
    
    expect(screen.getByText('Hello!')).toBeInTheDocument()
    expect(screen.getByText('Hi there! How can I help you?')).toBeInTheDocument()
    expect(screen.getByText('What is the weather like?')).toBeInTheDocument()
  })

  it('applies correct user/assistant classes to messages', () => {
    render(<MessageList messages={mockMessages} />)
    
    const userMessage1 = screen.getByTestId('message-1')
    const assistantMessage = screen.getByTestId('message-2')
    const userMessage2 = screen.getByTestId('message-3')
    
    expect(userMessage1).toHaveClass('user-message')
    expect(assistantMessage).toHaveClass('assistant-message')
    expect(userMessage2).toHaveClass('user-message')
  })

  it('shows loading indicator when isLoading is true', () => {
    render(<MessageList messages={mockMessages} isLoading={true} />)
    
    expect(screen.getByText('AI is thinking...')).toBeInTheDocument()
    
    // Check for loading dots
    const loadingElement = screen.getByText('AI is thinking...').closest('.message__loading')
    expect(loadingElement).toBeInTheDocument()
    
    const dotsContainer = loadingElement.querySelector('.message__loading-dots')
    expect(dotsContainer).toBeInTheDocument()
    expect(dotsContainer.children).toHaveLength(3)
  })

  it('does not show loading indicator when isLoading is false', () => {
    render(<MessageList messages={mockMessages} isLoading={false} />)
    
    expect(screen.queryByText('AI is thinking...')).not.toBeInTheDocument()
  })

  it('shows loading indicator even with empty messages', () => {
    render(<MessageList messages={[]} isLoading={true} />)
    
    expect(screen.getByText('AI is thinking...')).toBeInTheDocument()
    expect(screen.queryByText('Start a conversation')).not.toBeInTheDocument()
  })

  it('renders messages in correct order', () => {
    render(<MessageList messages={mockMessages} />)
    
    const messageElements = screen.getAllByTestId(/message-/)
    expect(messageElements).toHaveLength(3)
    
    expect(messageElements[0]).toHaveAttribute('data-testid', 'message-1')
    expect(messageElements[1]).toHaveAttribute('data-testid', 'message-2')
    expect(messageElements[2]).toHaveAttribute('data-testid', 'message-3')
  })

  it('handles single message correctly', () => {
    const singleMessage = [mockMessages[0]]
    render(<MessageList messages={singleMessage} />)
    
    expect(screen.getByTestId('message-1')).toBeInTheDocument()
    expect(screen.getByText('Hello!')).toBeInTheDocument()
    expect(screen.queryByText('Start a conversation')).not.toBeInTheDocument()
  })

  it('has proper CSS classes for styling', () => {
    render(<MessageList messages={mockMessages} />)
    
    const messageList = screen.getByText('Hello!').closest('.message-list')
    expect(messageList).toBeInTheDocument()
    
    const container = messageList.querySelector('.message-list__container')
    expect(container).toBeInTheDocument()
  })

  it('renders empty state with proper CSS classes', () => {
    render(<MessageList messages={[]} />)
    
    const emptyState = screen.getByText('Start a conversation').closest('.message-list__empty-state')
    expect(emptyState).toBeInTheDocument()
    
    const messageList = emptyState.closest('.message-list')
    expect(messageList).toHaveClass('message-list--empty')
  })
})