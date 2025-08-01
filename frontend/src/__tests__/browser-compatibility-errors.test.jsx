/**
 * Browser compatibility tests for error handling
 * Tests error handling across different browser environments and features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import chatSlice from '../store/chatSlice'
import ChatPage from '../pages/ChatPage'
import { requestManager } from '../services/requestManager'
import { healthMonitor } from '../services/healthMonitor'

// Mock services
vi.mock('../services/requestManager', () => ({
  requestManager: {
    makeRequest: vi.fn(),
    cancelAllRequests: vi.fn(),
    getActiveRequests: vi.fn(() => []),
    getStats: vi.fn(() => ({ total: 0, successful: 0, failed: 0 }))
  }
}))

vi.mock('../services/healthMonitor', () => ({
  healthMonitor: {
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    getConnectionStatus: vi.fn(() => ({ isOnline: true, backendStatus: 'connected' })),
    onStatusChange: vi.fn(),
    forceHealthCheck: vi.fn()
  },
  CONNECTION_STATUS: {
    UNKNOWN: 'unknown',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    SLOW: 'slow'
  }
}))

const createTestStore = () => {
  return configureStore({
    reducer: {
      chat: chatSlice
    }
  })
}

const TestWrapper = ({ children, store }) => (
  <Provider store={store}>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </Provider>
)

// Browser environment simulation utilities
const simulateBrowserEnvironment = (browserType) => {
  const originalUserAgent = navigator.userAgent
  const originalFetch = global.fetch
  const originalAbortController = global.AbortController
  const originalPromise = global.Promise

  switch (browserType) {
    case 'chrome':
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        configurable: true
      })
      break
    case 'firefox':
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        configurable: true
      })
      break
    case 'safari':
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
        configurable: true
      })
      break
    case 'edge':
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
        configurable: true
      })
      break
    case 'ie11':
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko',
        configurable: true
      })
      // Simulate IE11 limitations
      delete global.fetch
      delete global.AbortController
      global.Promise = function(executor) {
        // Simplified Promise polyfill simulation
        const promise = new originalPromise(executor)
        delete promise.finally // IE11 doesn't have finally
        return promise
      }
      break
  }

  return () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true
    })
    global.fetch = originalFetch
    global.AbortController = originalAbortController
    global.Promise = originalPromise
  }
}

describe('Browser Compatibility Error Handling Tests', () => {
  let store
  let restoreBrowser

  beforeEach(() => {
    store = createTestStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (restoreBrowser) {
      restoreBrowser()
      restoreBrowser = null
    }
    vi.restoreAllMocks()
  })

  describe('Chrome Browser Tests', () => {
    beforeEach(() => {
      restoreBrowser = simulateBrowserEnvironment('chrome')
    })

    it('should handle Chrome-specific network errors', async () => {
      const chromeNetworkError = new Error('net::ERR_NETWORK_CHANGED')
      chromeNetworkError.code = 'ERR_NETWORK_CHANGED'
      requestManager.makeRequest.mockRejectedValue(chromeNetworkError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Chrome network test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/network changed/i)).toBeInTheDocument()
      })
    })

    it('should handle Chrome CORS errors', async () => {
      const corsError = new Error('Access to fetch blocked by CORS policy')
      corsError.name = 'TypeError'
      requestManager.makeRequest.mockRejectedValue(corsError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'CORS test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/cors.*blocked/i)).toBeInTheDocument()
      })
    })
  })

  describe('Firefox Browser Tests', () => {
    beforeEach(() => {
      restoreBrowser = simulateBrowserEnvironment('firefox')
    })

    it('should handle Firefox-specific network errors', async () => {
      const firefoxError = new Error('NetworkError when attempting to fetch resource')
      firefoxError.name = 'NetworkError'
      requestManager.makeRequest.mockRejectedValue(firefoxError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Firefox network test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
    })

    it('should handle Firefox security errors', async () => {
      const securityError = new Error('The operation is insecure')
      securityError.name = 'SecurityError'
      requestManager.makeRequest.mockRejectedValue(securityError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Security test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/security error/i)).toBeInTheDocument()
      })
    })
  })

  describe('Safari Browser Tests', () => {
    beforeEach(() => {
      restoreBrowser = simulateBrowserEnvironment('safari')
    })

    it('should handle Safari-specific fetch errors', async () => {
      const safariError = new Error('The network connection was lost')
      safariError.name = 'TypeError'
      requestManager.makeRequest.mockRejectedValue(safariError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Safari network test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/network connection.*lost/i)).toBeInTheDocument()
      })
    })

    it('should handle Safari WebKit errors', async () => {
      const webkitError = new Error('WebKit encountered an error')
      webkitError.name = 'WebKitError'
      requestManager.makeRequest.mockRejectedValue(webkitError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'WebKit test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/webkit.*error/i)).toBeInTheDocument()
      })
    })
  })

  describe('Edge Browser Tests', () => {
    beforeEach(() => {
      restoreBrowser = simulateBrowserEnvironment('edge')
    })

    it('should handle Edge-specific network errors', async () => {
      const edgeError = new Error('INET_E_RESOURCE_NOT_FOUND')
      edgeError.code = 'INET_E_RESOURCE_NOT_FOUND'
      requestManager.makeRequest.mockRejectedValue(edgeError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Edge network test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/resource not found/i)).toBeInTheDocument()
      })
    })
  })

  describe('Internet Explorer 11 Tests', () => {
    beforeEach(() => {
      restoreBrowser = simulateBrowserEnvironment('ie11')
    })

    it('should handle IE11 XMLHttpRequest errors', async () => {
      const ie11Error = new Error('Access is denied')
      ie11Error.name = 'Error'
      ie11Error.number = -2147024891 // IE11 error number
      requestManager.makeRequest.mockRejectedValue(ie11Error)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'IE11 test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/access.*denied/i)).toBeInTheDocument()
      })
    })

    it('should handle IE11 lack of fetch API gracefully', async () => {
      // Simulate fetch not being available
      const fetchError = new Error('fetch is not defined')
      fetchError.name = 'ReferenceError'
      requestManager.makeRequest.mockRejectedValue(fetchError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Fetch API test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/browser.*not.*supported/i)).toBeInTheDocument()
      })
    })

    it('should handle IE11 Promise limitations', async () => {
      const promiseError = new Error('Promise.prototype.finally is not a function')
      promiseError.name = 'TypeError'
      requestManager.makeRequest.mockRejectedValue(promiseError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Promise test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/browser.*compatibility/i)).toBeInTheDocument()
      })
    })
  })

  describe('Mobile Browser Tests', () => {
    it('should handle mobile Chrome network errors', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        configurable: true
      })

      const mobileError = new Error('net::ERR_INTERNET_DISCONNECTED')
      mobileError.code = 'ERR_INTERNET_DISCONNECTED'
      requestManager.makeRequest.mockRejectedValue(mobileError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Mobile network test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/internet.*disconnected/i)).toBeInTheDocument()
      })
    })

    it('should handle mobile Safari network errors', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        configurable: true
      })

      const mobileError = new Error('A server with the specified hostname could not be found')
      mobileError.name = 'TypeError'
      requestManager.makeRequest.mockRejectedValue(mobileError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Mobile Safari test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/hostname.*not.*found/i)).toBeInTheDocument()
      })
    })
  })

  describe('Feature Detection Tests', () => {
    it('should handle missing AbortController gracefully', async () => {
      // Simulate missing AbortController
      const originalAbortController = global.AbortController
      delete global.AbortController

      const abortError = new Error('AbortController is not defined')
      abortError.name = 'ReferenceError'
      requestManager.makeRequest.mockRejectedValue(abortError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'AbortController test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/browser.*feature.*not.*supported/i)).toBeInTheDocument()
      })

      // Restore AbortController
      global.AbortController = originalAbortController
    })

    it('should handle missing localStorage gracefully', async () => {
      // Simulate missing localStorage
      const originalLocalStorage = global.localStorage
      delete global.localStorage

      const storageError = new Error('localStorage is not defined')
      storageError.name = 'ReferenceError'
      requestManager.makeRequest.mockRejectedValue(storageError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'localStorage test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/storage.*not.*available/i)).toBeInTheDocument()
      })

      // Restore localStorage
      global.localStorage = originalLocalStorage
    })

    it('should handle missing WebSocket gracefully', async () => {
      // Simulate missing WebSocket
      const originalWebSocket = global.WebSocket
      delete global.WebSocket

      const wsError = new Error('WebSocket is not defined')
      wsError.name = 'ReferenceError'
      requestManager.makeRequest.mockRejectedValue(wsError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'WebSocket test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/websocket.*not.*supported/i)).toBeInTheDocument()
      })

      // Restore WebSocket
      global.WebSocket = originalWebSocket
    })
  })

  describe('Cross-Browser Error Formatting', () => {
    it('should format errors consistently across browsers', async () => {
      const testCases = [
        {
          browser: 'chrome',
          error: new Error('net::ERR_CONNECTION_REFUSED'),
          expectedMessage: /connection refused/i
        },
        {
          browser: 'firefox',
          error: new Error('NetworkError when attempting to fetch resource'),
          expectedMessage: /network error/i
        },
        {
          browser: 'safari',
          error: new Error('The network connection was lost'),
          expectedMessage: /connection.*lost/i
        },
        {
          browser: 'edge',
          error: new Error('INET_E_DOWNLOAD_FAILURE'),
          expectedMessage: /download failure/i
        }
      ]

      for (const testCase of testCases) {
        const restore = simulateBrowserEnvironment(testCase.browser)
        
        requestManager.makeRequest.mockRejectedValue(testCase.error)

        render(
          <TestWrapper store={store}>
            <ChatPage />
          </TestWrapper>
        )

        const chatInput = screen.getByPlaceholderText('Type your message...')
        const sendButton = screen.getByLabelText('Send message')

        fireEvent.change(chatInput, { target: { value: `${testCase.browser} test` } })
        fireEvent.click(sendButton)

        await waitFor(() => {
          expect(screen.getByText(testCase.expectedMessage)).toBeInTheDocument()
        })

        restore()
        vi.clearAllMocks()
      }
    })

    it('should provide browser-specific error suggestions', async () => {
      const chromeRestore = simulateBrowserEnvironment('chrome')
      
      const chromeError = new Error('net::ERR_CERT_AUTHORITY_INVALID')
      chromeError.code = 'ERR_CERT_AUTHORITY_INVALID'
      requestManager.makeRequest.mockRejectedValue(chromeError)

      render(
        <TestWrapper store={store}>
          <ChatPage />
        </TestWrapper>
      )

      const chatInput = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByLabelText('Send message')

      fireEvent.change(chatInput, { target: { value: 'Certificate test' } })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/certificate.*invalid/i)).toBeInTheDocument()
        expect(screen.getByText(/check.*certificate/i)).toBeInTheDocument()
      })

      chromeRestore()
    })
  })

  describe('Error Recovery Across Browsers', () => {
    it('should provide consistent retry mechanisms across browsers', async () => {
      const browsers = ['chrome', 'firefox', 'safari', 'edge']
      
      for (const browser of browsers) {
        const restore = simulateBrowserEnvironment(browser)
        
        // Mock initial failure then success
        requestManager.makeRequest
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            response: `Success on ${browser}`,
            conversation_id: 'test-conv',
            timestamp: new Date().toISOString()
          })

        render(
          <TestWrapper store={store}>
            <ChatPage />
          </TestWrapper>
        )

        const chatInput = screen.getByPlaceholderText('Type your message...')
        const sendButton = screen.getByLabelText('Send message')

        fireEvent.change(chatInput, { target: { value: `${browser} retry test` } })
        fireEvent.click(sendButton)

        await waitFor(() => {
          expect(screen.getByText(/try again/i)).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText(/try again/i))

        await waitFor(() => {
          expect(screen.getByText(`Success on ${browser}`)).toBeInTheDocument()
        })

        restore()
        vi.clearAllMocks()
      }
    })
  })
})