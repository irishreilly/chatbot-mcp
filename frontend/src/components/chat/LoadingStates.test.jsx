import React from 'react'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import MessageList from './MessageList'
import ChatInterface from './ChatInterface'

describe('Loading States and User Feedback', () => {
  describe('MessageList Loading States', () => {
    it('shows loading indicator when isLoading is true', () => {
      const messages = [
        {
          id: '1',
          content: 'Hello',
          sender: 'user',
          timestamp: '2023-01-01T00:00:00Z',
          mcp_tools_used: []
        }
      ]

      render(<MessageList messages={messages} isLoading={true} />)
      
      expect(screen.getByText('AI is thinking...')).toBeInTheDocument()
      
      // Check for loading dots animation elements
      const loadingDots = document.querySelectorAll('.message__loading-dots span')
      expect(loadingDots).toHaveLength(3)
    })

    it('shows empty state when no messages and not loading', () => {
      render(<MessageList messages={[]} isLoading={false} />)
      
      expect(screen.getByText('Start a conversation')).toBeInTheDocument()
      expect(screen.getByText('Send a message to begin chatting with the AI assistant')).toBeInTheDocument()
    })

    it('does not show loading indicator when isLoading is false', () => {
      const messages = [
        {
          id: '1',
          content: 'Hello',
          sender: 'user',
          timestamp: '2023-01-01T00:00:00Z',
          mcp_tools_used: []
        }
      ]

      render(<MessageList messages={messages} isLoading={false} />)
      
      expect(screen.queryByText('AI is thinking...')).not.toBeInTheDocument()
    })
  })

  describe('ChatInterface Loading States', () => {
    const mockOnSendMessage = vi.fn()

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('shows loading placeholder when isLoading is true', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          isLoading={true}
        />
      )
      
      expect(screen.getByPlaceholderText('Please wait...')).toBeInTheDocument()
    })

    it('disables input when isLoading is true', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          isLoading={true}
        />
      )
      
      const input = screen.getByPlaceholderText('Please wait...')
      expect(input).toBeDisabled()
    })

    it('shows error message and retry button when error is provided', () => {
      const mockOnRetry = vi.fn()
      
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          error="Network connection failed"
          onRetry={mockOnRetry}
        />
      )
      
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Network connection failed')).toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })

    it('shows normal placeholder when not loading and no error', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          isLoading={false}
        />
      )
      
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
    })

    it('shows disabled placeholder when disabled', () => {
      render(
        <ChatInterface
          messages={[]}
          onSendMessage={mockOnSendMessage}
          disabled={true}
        />
      )
      
      expect(screen.getByPlaceholderText('Chat is disabled')).toBeInTheDocument()
    })
  })
})