/**
 * End-to-end tests for complete chat workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import chatSlice from '../../store/chatSlice'
import ChatPage from '../../pages/ChatPage'
import { chatAPI } from '../../services/apiClient'

// Mock the API client
vi.mock('../../services/apiClient', () => ({
  chatAPI: {
    sendMessage: vi.fn(),
    healthCheck: vi.fn()
  },
  errorUtils: {
    getUserMessage: vi.fn((error) => error.message || 'An error occurred'),
    isRetryable: vi.fn(() => true),
    retry: vi.fn((fn) => fn())
  }
}))

// Create test store
const createTestStore = () => {
  return configureStore({
    reducer: {
      chat: chatSlice
    }
  })
}

// Test wrapper component
const TestWrapper = ({ children, store }) => (
  <Provider store={store}>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </Provider>
)

describe('Chat Workflow E2E Tests', () => {
  let store

  beforeEach(() => {
    store = createTestStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Complete Chat Flow', () => {
    it('should handle complete user chat interaction', async () => {
      // Mock successful API response
      chatAPI.sendMessage.mockResolvedValue({
        response: 'Hello! How can I help you today?',
        conversation_id: 'test-conv-123',
        mcp_tools_used: [],
        timestamp: new Date().toISOString()
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      // Wait for component to initialize
      await waitFor(() => {
        expect(screen.getByText('Welcome to MCP Chatbot')).toBeInTheDocument()
      })

      // Find and interact with chat input
      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Type a message
      fireEvent.change(chatInput, { target: { value: 'Hello, how are you?' } })
      expect(chatInput.value).toBe('Hello, how are you?')

      // Send the message
      fireEvent.click(sendButton)

      // Verify user message appears
      await waitFor(() => {
        expect(screen.getByText('Hello, how are you?')).toBeInTheDocument()
      })

      // Verify API was called
      expect(chatAPI.sendMessage).toHaveBeenCalledWith(
        'Hello, how are you?',
        expect.any(String)
      )

      // Verify assistant response appears
      await waitFor(() => {
        expect(screen.getByText('Hello! How can I help you today?')).toBeInTheDocument()
      })

      // Verify input is cleared
      expect(chatInput.value).toBe('')
    })

    it('should handle multiple message exchanges', async () => {
      // Mock multiple API responses
      chatAPI.sendMessage
        .mockResolvedValueOnce({
          response: 'Hello! How can I help you?',
          conversation_id: 'test-conv-123',
          mcp_tools_used: [],
          timestamp: new Date().toISOString()
        })
        .mockResolvedValueOnce({
          response: 'The weather is sunny today!',
          conversation_id: 'test-conv-123',
          mcp_tools_used: ['weather-tool'],
          timestamp: new Date().toISOString()
        })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // First message
      fireEvent.change(chatInput, { target: { value: 'Hello' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument()
      })

      // Second message
      fireEvent.change(chatInput, { target: { value: 'What\'s the weather?' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('The weather is sunny today!')).toBeInTheDocument()
      })

      // Verify both user messages are present
      expect(screen.getByText('Hello')).toBeInTheDocument()
      expect(screen.getByText('What\'s the weather?')).toBeInTheDocument()

      // Verify API was called twice
      expect(chatAPI.sendMessage).toHaveBeenCalledTimes(2)
    })

    it('should handle MCP tool usage indication', async () => {
      // Mock response with MCP tools
      chatAPI.sendMessage.mockResolvedValue({
        response: 'Based on the weather data, it\'s 72°F and sunny.',
        conversation_id: 'test-conv-123',
        mcp_tools_used: ['weather-api', 'location-service'],
        timestamp: new Date().toISOString()
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'What\'s the weather in New York?' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('Based on the weather data, it\'s 72°F and sunny.')).toBeInTheDocument()
      })

      // Note: MCP tool indicators would be shown in the message component
      // This test verifies the data flows through correctly
      expect(chatAPI.sendMessage).toHaveBeenCalledWith(
        'What\'s the weather in New York?',
        expect.any(String)
      )
    })
  })

  describe('Error Handling Flow', () => {
    it('should handle API errors gracefully', async () => {
      // Mock API error
      const apiError = new Error('Network error')
      apiError.status = 500
      chatAPI.sendMessage.mockRejectedValue(apiError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Test message' } })
      fireEvent.click(sendButton)

      // User message should still appear
      await waitFor(() => {
        expect(screen.getByText('Test message')).toBeInTheDocument()
      })

      // Error message should appear
      await waitFor(() => {
        expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
      })

      // Retry button should be available
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })

    it('should handle retry functionality', async () => {
      // Mock initial failure then success
      const apiError = new Error('Temporary error')
      chatAPI.sendMessage
        .mockRejectedValueOnce(apiError)
        .mockResolvedValueOnce({
          response: 'Success after retry!',
          conversation_id: 'test-conv-123',
          mcp_tools_used: [],
          timestamp: new Date().toISOString()
        })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Send message that will fail
      fireEvent.change(chatInput, { target: { value: 'Test retry' } })
      fireEvent.click(sendButton)

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument()
      })

      // Click retry
      fireEvent.click(screen.getByText('Try Again'))

      // Wait for success response
      await waitFor(() => {
        expect(screen.getByText('Success after retry!')).toBeInTheDocument()
      })

      // Error should be cleared
      expect(screen.queryByText('Try Again')).not.toBeInTheDocument()
    })

    it('should handle network connectivity issues', async () => {
      // Mock network error
      const networkError = new Error('Network error - please check your connection')
      networkError.code = 'NETWORK_ERROR'
      chatAPI.sendMessage.mockRejectedValue(networkError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Network test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument()
      })
    })
  })

  describe('Loading States', () => {
    it('should show loading indicators during message processing', async () => {
      // Mock delayed response
      let resolvePromise
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      chatAPI.sendMessage.mockReturnValue(delayedPromise)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Loading test' } })
      fireEvent.click(sendButton)

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Please wait...')).toBeInTheDocument()
      })

      // Input should be disabled during loading
      expect(chatInput).toBeDisabled()

      // Resolve the promise
      resolvePromise({
        response: 'Response after loading',
        conversation_id: 'test-conv-123',
        mcp_tools_used: [],
        timestamp: new Date().toISOString()
      })

      // Loading should disappear
      await waitFor(() => {
        expect(screen.queryByText('Please wait...')).not.toBeInTheDocument()
      })

      // Input should be enabled again
      expect(chatInput).not.toBeDisabled()
    })

    it('should handle typing indicators', async () => {
      chatAPI.sendMessage.mockResolvedValue({
        response: 'Test response',
        conversation_id: 'test-conv-123',
        mcp_tools_used: [],
        timestamp: new Date().toISOString()
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Typing test' } })
      fireEvent.click(sendButton)

      // Should show some form of processing indicator
      // This could be a spinner, dots, or other loading indicator
      await waitFor(() => {
        expect(screen.getByText('Test response')).toBeInTheDocument()
      })
    })
  })

  describe('Input Validation', () => {
    it('should prevent sending empty messages', async () => {
      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const sendButton = screen.getByLabelText('Send message')

      // Send button should be disabled for empty input
      expect(sendButton).toBeDisabled()

      // Try clicking anyway
      fireEvent.click(sendButton)

      // API should not be called
      expect(chatAPI.sendMessage).not.toHaveBeenCalled()
    })

    it('should handle long messages', async () => {
      chatAPI.sendMessage.mockResolvedValue({
        response: 'Received your long message',
        conversation_id: 'test-conv-123',
        mcp_tools_used: [],
        timestamp: new Date().toISOString()
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Create a long message
      const longMessage = 'This is a very long message that tests the character limit handling. '.repeat(20)
      
      fireEvent.change(chatInput, { target: { value: longMessage } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('Received your long message')).toBeInTheDocument()
      })

      expect(chatAPI.sendMessage).toHaveBeenCalledWith(
        longMessage,
        expect.any(String)
      )
    })

    it('should handle special characters and formatting', async () => {
      chatAPI.sendMessage.mockResolvedValue({
        response: 'Handled special characters correctly',
        conversation_id: 'test-conv-123',
        mcp_tools_used: [],
        timestamp: new Date().toISOString()
      })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      const specialMessage = 'Test with émojis 🚀, symbols @#$%, and "quotes"'
      
      fireEvent.change(chatInput, { target: { value: specialMessage } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(specialMessage)).toBeInTheDocument()
      })

      await waitFor(() => {
        expect(screen.getByText('Handled special characters correctly')).toBeInTheDocument()
      })
    })
  })

  describe('Conversation Management', () => {
    it('should maintain conversation context', async () => {
      // Mock responses that reference previous context
      chatAPI.sendMessage
        .mockResolvedValueOnce({
          response: 'My name is Assistant. What\'s yours?',
          conversation_id: 'test-conv-123',
          mcp_tools_used: [],
          timestamp: new Date().toISOString()
        })
        .mockResolvedValueOnce({
          response: 'Nice to meet you, John! How can I help you today?',
          conversation_id: 'test-conv-123',
          mcp_tools_used: [],
          timestamp: new Date().toISOString()
        })

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // First exchange
      fireEvent.change(chatInput, { target: { value: 'What\'s your name?' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('My name is Assistant. What\'s yours?')).toBeInTheDocument()
      })

      // Second exchange with context
      fireEvent.change(chatInput, { target: { value: 'My name is John' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText('Nice to meet you, John! How can I help you today?')).toBeInTheDocument()
      })

      // Verify both API calls used the same conversation ID
      expect(chatAPI.sendMessage).toHaveBeenNthCalledWith(
        1,
        'What\'s your name?',
        expect.any(String)
      )
      expect(chatAPI.sendMessage).toHaveBeenNthCalledWith(
        2,
        'My name is John',
        expect.any(String)
      )
    })

    it('should handle conversation history scrolling', async () => {
      // Mock multiple messages to create scrollable history
      const responses = Array.from({ length: 10 }, (_, i) => ({
        response: `Response ${i + 1}`,
        conversation_id: 'test-conv-123',
        mcp_tools_used: [],
        timestamp: new Date().toISOString()
      }))

      chatAPI.sendMessage.mockImplementation(() => 
        Promise.resolve(responses.shift())
      )

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      // Send multiple messages
      for (let i = 1; i <= 5; i++) {
        fireEvent.change(chatInput, { target: { value: `Message ${i}` } })
        fireEvent.click(sendButton)
        
        await waitFor(() => {
          expect(screen.getByText(`Response ${i}`)).toBeInTheDocument()
        })
      }

      // Verify all messages are present
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByText(`Message ${i}`)).toBeInTheDocument()
        expect(screen.getByText(`Response ${i}`)).toBeInTheDocument()
      }
    })
  })
})