import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Message from './Message'

describe('Message Component', () => {
  const mockUserMessage = {
    id: '1',
    content: 'Hello, how are you?',
    timestamp: '2024-01-01T12:00:00Z',
    sender: 'user',
    mcp_tools_used: []
  }

  const mockAssistantMessage = {
    id: '2',
    content: 'I am doing well, thank you for asking!',
    timestamp: '2024-01-01T12:01:00Z',
    sender: 'assistant',
    mcp_tools_used: ['weather-tool', 'search-tool']
  }

  it('renders user message correctly', () => {
    render(<Message message={mockUserMessage} isUser={true} />)
    
    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument()
    
    // Check for timestamp presence (format may vary by timezone)
    const timestampElement = document.querySelector('.message__timestamp')
    expect(timestampElement).toBeInTheDocument()
    expect(timestampElement.textContent).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i)
    
    const messageElement = screen.getByText('Hello, how are you?').closest('.message')
    expect(messageElement).toHaveClass('message--user')
  })

  it('renders assistant message correctly', () => {
    render(<Message message={mockAssistantMessage} isUser={false} />)
    
    expect(screen.getByText('I am doing well, thank you for asking!')).toBeInTheDocument()
    
    // Check for timestamp presence (format may vary by timezone)
    const timestampElement = document.querySelector('.message__timestamp')
    expect(timestampElement).toBeInTheDocument()
    expect(timestampElement.textContent).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i)
    
    const messageElement = screen.getByText('I am doing well, thank you for asking!').closest('.message')
    expect(messageElement).toHaveClass('message--assistant')
  })

  it('displays MCP tools when present', () => {
    render(<Message message={mockAssistantMessage} isUser={false} />)
    
    expect(screen.getByText('🔧 Tools used:')).toBeInTheDocument()
    expect(screen.getByText('weather-tool')).toBeInTheDocument()
    expect(screen.getByText('search-tool')).toBeInTheDocument()
  })

  it('does not display MCP tools section when no tools used', () => {
    render(<Message message={mockUserMessage} isUser={true} />)
    
    expect(screen.queryByText('🔧 Tools used:')).not.toBeInTheDocument()
  })

  it('formats timestamp correctly for same day', () => {
    const now = new Date()
    const messageWithTime = {
      ...mockUserMessage,
      timestamp: now.toISOString()
    }
    
    render(<Message message={messageWithTime} isUser={true} />)
    
    // Should display time in 12-hour format for same day
    const timestampElement = document.querySelector('.message__timestamp')
    expect(timestampElement).toBeInTheDocument()
    expect(timestampElement.textContent).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i)
  })

  it('formats timestamp correctly for older messages', () => {
    const oldDate = new Date('2024-01-01T15:30:00Z')
    const messageWithTime = {
      ...mockUserMessage,
      timestamp: oldDate.toISOString()
    }
    
    render(<Message message={messageWithTime} isUser={true} />)
    
    // Should display date and time for older messages
    const timestampElement = document.querySelector('.message__timestamp')
    expect(timestampElement).toBeInTheDocument()
    // Should contain month abbreviation for older messages
    expect(timestampElement.textContent).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/)
  })

  it('handles multiline content correctly', () => {
    const multilineMessage = {
      ...mockUserMessage,
      content: 'Line 1\nLine 2\nLine 3'
    }
    
    render(<Message message={multilineMessage} isUser={true} />)
    
    const contentElement = document.querySelector('.message__content')
    expect(contentElement).toBeInTheDocument()
    // Line breaks should be converted to <br> tags
    expect(contentElement.innerHTML).toContain('<br>')
  })

  it('applies correct CSS classes based on sender', () => {
    const { rerender } = render(<Message message={mockUserMessage} isUser={true} />)
    
    let messageElement = screen.getByText('Hello, how are you?').closest('.message')
    expect(messageElement).toHaveClass('message--user')
    
    rerender(<Message message={mockAssistantMessage} isUser={false} />)
    
    messageElement = screen.getByText('I am doing well, thank you for asking!').closest('.message')
    expect(messageElement).toHaveClass('message--assistant')
  })

  it('handles empty MCP tools array', () => {
    const messageWithEmptyTools = {
      ...mockAssistantMessage,
      mcp_tools_used: []
    }
    
    render(<Message message={messageWithEmptyTools} isUser={false} />)
    
    expect(screen.queryByText('🔧 Tools used:')).not.toBeInTheDocument()
  })

  describe('Message Formatting', () => {
    it('formats bold text correctly', () => {
      const messageWithBold = {
        ...mockUserMessage,
        content: 'This is **bold** text'
      }
      
      const { container } = render(<Message message={messageWithBold} isUser={false} />)
      
      expect(container.querySelector('strong')).toBeInTheDocument()
      expect(container.querySelector('strong')).toHaveTextContent('bold')
    })

    it('formats italic text correctly', () => {
      const messageWithItalic = {
        ...mockUserMessage,
        content: 'This is *italic* text'
      }
      
      const { container } = render(<Message message={messageWithItalic} isUser={false} />)
      
      expect(container.querySelector('em')).toBeInTheDocument()
      expect(container.querySelector('em')).toHaveTextContent('italic')
    })

    it('formats code text correctly', () => {
      const messageWithCode = {
        ...mockUserMessage,
        content: 'This is `code` text'
      }
      
      const { container } = render(<Message message={messageWithCode} isUser={false} />)
      
      expect(container.querySelector('code')).toBeInTheDocument()
      expect(container.querySelector('code')).toHaveTextContent('code')
    })

    it('formats URLs correctly', () => {
      const messageWithUrl = {
        ...mockUserMessage,
        content: 'Visit https://example.com for more info'
      }
      
      const { container } = render(<Message message={messageWithUrl} isUser={false} />)
      
      const link = container.querySelector('a')
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', 'https://example.com')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('formats line breaks correctly', () => {
      const messageWithLineBreaks = {
        ...mockUserMessage,
        content: 'Line 1\nLine 2\nLine 3'
      }
      
      const { container } = render(<Message message={messageWithLineBreaks} isUser={false} />)
      
      const content = container.querySelector('.message__content')
      expect(content.innerHTML).toContain('<br>')
    })
  })

  describe('Message Status', () => {
    it('displays sending status for user messages', () => {
      const { container } = render(<Message message={mockUserMessage} isUser={true} status="sending" />)
      
      expect(container.querySelector('.message__status--sending')).toBeInTheDocument()
      expect(screen.getByText('⏳')).toBeInTheDocument()
    })

    it('displays sent status for user messages', () => {
      const { container } = render(<Message message={mockUserMessage} isUser={true} status="sent" />)
      
      expect(container.querySelector('.message__status--sent')).toBeInTheDocument()
      expect(screen.getByText('✓')).toBeInTheDocument()
    })

    it('displays delivered status for user messages', () => {
      const { container } = render(<Message message={mockUserMessage} isUser={true} status="delivered" />)
      
      expect(container.querySelector('.message__status--delivered')).toBeInTheDocument()
      expect(screen.getByText('✓✓')).toBeInTheDocument()
    })

    it('displays error status for user messages', () => {
      const { container } = render(<Message message={mockUserMessage} isUser={true} status="error" />)
      
      expect(container.querySelector('.message__status--error')).toBeInTheDocument()
      expect(screen.getByText('❌')).toBeInTheDocument()
    })

    it('does not display status for assistant messages', () => {
      const { container } = render(<Message message={mockAssistantMessage} isUser={false} status="sent" />)
      
      expect(container.querySelector('.message__status')).not.toBeInTheDocument()
    })
  })

  describe('MCP Tool Results', () => {
    it('displays MCP tool results when provided', () => {
      const messageWithResults = {
        ...mockAssistantMessage,
        mcp_tool_results: [
          {
            tool_name: 'weather_api',
            result: 'Temperature: 72°F',
            execution_time: 150
          }
        ]
      }
      
      render(<Message message={messageWithResults} isUser={false} />)
      
      expect(screen.getByText('📊 Tool Results:')).toBeInTheDocument()
      expect(screen.getByText('weather_api')).toBeInTheDocument()
      expect(screen.getByText('Temperature: 72°F')).toBeInTheDocument()
      expect(screen.getByText('150ms')).toBeInTheDocument()
    })

    it('handles JSON tool results', () => {
      const messageWithJsonResults = {
        ...mockAssistantMessage,
        mcp_tool_results: [
          {
            tool_name: 'api_call',
            result: { status: 'success', data: { count: 5 } },
            execution_time: 200
          }
        ]
      }
      
      render(<Message message={messageWithJsonResults} isUser={false} />)
      
      expect(screen.getByText('api_call')).toBeInTheDocument()
      expect(screen.getByText('200ms')).toBeInTheDocument()
      // JSON should be stringified
      expect(screen.getByText(/"status": "success"/)).toBeInTheDocument()
    })

    it('does not display tool results section when no results', () => {
      render(<Message message={mockUserMessage} isUser={false} />)
      
      expect(screen.queryByText('📊 Tool Results:')).not.toBeInTheDocument()
    })

    it('handles multiple tool results', () => {
      const messageWithMultipleResults = {
        ...mockAssistantMessage,
        mcp_tool_results: [
          {
            tool_name: 'tool1',
            result: 'Result 1',
            execution_time: 100
          },
          {
            tool_name: 'tool2',
            result: 'Result 2',
            execution_time: 200
          }
        ]
      }
      
      render(<Message message={messageWithMultipleResults} isUser={false} />)
      
      expect(screen.getByText('tool1')).toBeInTheDocument()
      expect(screen.getByText('tool2')).toBeInTheDocument()
      expect(screen.getByText('Result 1')).toBeInTheDocument()
      expect(screen.getByText('Result 2')).toBeInTheDocument()
    })
  })
})