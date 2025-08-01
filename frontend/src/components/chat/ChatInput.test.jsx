import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ChatInput from './ChatInput'

describe('ChatInput Component', () => {
  const mockOnSendMessage = vi.fn()

  beforeEach(() => {
    mockOnSendMessage.mockClear()
  })

  it('renders input field and send button', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />)
    
    expect(screen.getByRole('textbox', { name: /chat message input/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
    expect(screen.getByText('Press Enter to send, Shift+Enter for new line')).toBeInTheDocument()
  })

  it('displays custom placeholder', () => {
    const customPlaceholder = 'Ask me anything...'
    render(<ChatInput onSendMessage={mockOnSendMessage} placeholder={customPlaceholder} />)
    
    expect(screen.getByPlaceholderText(customPlaceholder)).toBeInTheDocument()
  })

  it('sends message on form submit', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSendMessage={mockOnSendMessage} />)
    
    const input = screen.getByRole('textbox')
    const sendButton = screen.getByRole('button', { name: /send message/i })
    
    await user.type(input, 'Hello world')
    await user.click(sendButton)
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello world')
    expect(input.value).toBe('')
  })

  it('sends message on Enter key press', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSendMessage={mockOnSendMessage} />)
    
    const input = screen.getByRole('textbox')
    
    await user.type(input, 'Hello world')
    await user.keyboard('{Enter}')
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello world')
    expect(input.value).toBe('')
  })

  it('does not send message on Shift+Enter', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSendMessage={mockOnSendMessage} />)
    
    const input = screen.getByRole('textbox')
    
    await user.type(input, 'Hello world')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    
    expect(mockOnSendMessage).not.toHaveBeenCalled()
    expect(input.value).toBe('Hello world\n')
  })

  it('trims whitespace from messages', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSendMessage={mockOnSendMessage} />)
    
    const input = screen.getByRole('textbox')
    
    await user.type(input, '  Hello world  ')
    await user.keyboard('{Enter}')
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello world')
  })

  it('does not send empty or whitespace-only messages', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSendMessage={mockOnSendMessage} />)
    
    const input = screen.getByRole('textbox')
    const sendButton = screen.getByRole('button', { name: /send message/i })
    
    // Test empty message
    await user.click(sendButton)
    expect(mockOnSendMessage).not.toHaveBeenCalled()
    
    // Test whitespace-only message
    await user.type(input, '   ')
    await user.click(sendButton)
    expect(mockOnSendMessage).not.toHaveBeenCalled()
  })

  it('disables send button when message is empty', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />)
    
    const sendButton = screen.getByRole('button', { name: /send message/i })
    expect(sendButton).toBeDisabled()
  })

  it('enables send button when message has content', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSendMessage={mockOnSendMessage} />)
    
    const input = screen.getByRole('textbox')
    const sendButton = screen.getByRole('button', { name: /send message/i })
    
    await user.type(input, 'Hello')
    expect(sendButton).not.toBeDisabled()
  })

  it('shows loading state while submitting', async () => {
    const slowOnSendMessage = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)))
    const user = userEvent.setup()
    
    render(<ChatInput onSendMessage={slowOnSendMessage} />)
    
    const input = screen.getByRole('textbox')
    
    await user.type(input, 'Hello')
    await user.keyboard('{Enter}')
    
    // Check for loading spinner
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
    expect(document.querySelector('.chat-input__loading-spinner')).toBeInTheDocument()
    
    // Wait for submission to complete
    await waitFor(() => {
      expect(slowOnSendMessage).toHaveBeenCalledWith('Hello')
    })
  })

  it('respects character limit', async () => {
    const user = userEvent.setup()
    const maxLength = 50
    render(<ChatInput onSendMessage={mockOnSendMessage} maxLength={maxLength} />)
    
    const input = screen.getByRole('textbox')
    const longMessage = 'a'.repeat(maxLength + 10)
    
    await user.type(input, longMessage)
    
    expect(input.value).toHaveLength(maxLength)
    expect(screen.getByText('0 characters remaining')).toBeInTheDocument()
  })

  it('shows character counter', async () => {
    const user = userEvent.setup()
    const maxLength = 100
    render(<ChatInput onSendMessage={mockOnSendMessage} maxLength={maxLength} />)
    
    const input = screen.getByRole('textbox')
    
    expect(screen.getByText(`${maxLength} characters remaining`)).toBeInTheDocument()
    
    await user.type(input, 'Hello')
    expect(screen.getByText(`${maxLength - 5} characters remaining`)).toBeInTheDocument()
  })

  it('shows warning when near character limit', async () => {
    const user = userEvent.setup()
    const maxLength = 100
    render(<ChatInput onSendMessage={mockOnSendMessage} maxLength={maxLength} />)
    
    const input = screen.getByRole('textbox')
    const nearLimitMessage = 'a'.repeat(maxLength - 50) // 50 characters remaining
    
    await user.type(input, nearLimitMessage)
    
    const counter = screen.getByText('50 characters remaining')
    expect(counter).toHaveClass('chat-input__counter--warning')
    expect(input).toHaveClass('chat-input__textarea--warning')
  })

  it('handles disabled state', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} disabled={true} />)
    
    const input = screen.getByRole('textbox')
    const sendButton = screen.getByRole('button', { name: /send message/i })
    
    expect(input).toBeDisabled()
    expect(sendButton).toBeDisabled()
  })

  it('handles async onSendMessage errors gracefully', async () => {
    const errorOnSendMessage = vi.fn(() => Promise.reject(new Error('Network error')))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    
    render(<ChatInput onSendMessage={errorOnSendMessage} />)
    
    const input = screen.getByRole('textbox')
    
    await user.type(input, 'Hello')
    await user.keyboard('{Enter}')
    
    await waitFor(() => {
      expect(errorOnSendMessage).toHaveBeenCalledWith('Hello')
      expect(consoleSpy).toHaveBeenCalledWith('Error sending message:', expect.any(Error))
    })
    
    // Input should not be cleared on error
    expect(input.value).toBe('Hello')
    
    consoleSpy.mockRestore()
  })
})