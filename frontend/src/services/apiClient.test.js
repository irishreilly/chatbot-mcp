import { describe, it, expect, vi } from 'vitest'
import { APIError, errorUtils } from './apiClient'

// Note: We're focusing on testing the error handling and utility functions
// rather than the axios integration, which would require complex mocking

describe('APIError', () => {
  it('should create an APIError with all properties', () => {
    const error = new APIError('Test error', 400, 'TEST_ERROR', { field: 'value' })

    expect(error.message).toBe('Test error')
    expect(error.status).toBe(400)
    expect(error.code).toBe('TEST_ERROR')
    expect(error.details).toEqual({ field: 'value' })
    expect(error.name).toBe('APIError')
  })

  it('should identify network errors', () => {
    const error = new APIError('Network error', 0, 'NETWORK_ERROR')
    expect(error.isNetworkError()).toBe(true)
  })

  it('should identify server errors', () => {
    const error = new APIError('Server error', 500)
    expect(error.isServerError()).toBe(true)
  })

  it('should identify client errors', () => {
    const error = new APIError('Client error', 400)
    expect(error.isClientError()).toBe(true)
  })

  it('should identify timeout errors', () => {
    const error = new APIError('Timeout', 0, 'ECONNABORTED')
    expect(error.isTimeout()).toBe(true)
  })
})

describe('errorUtils', () => {
  describe('isRetryable', () => {
    it('should identify retryable errors', () => {
      const networkError = new APIError('Network error', 0, 'NETWORK_ERROR')
      const serverError = new APIError('Server error', 500)
      const timeoutError = new APIError('Timeout', 0, 'ECONNABORTED')

      expect(errorUtils.isRetryable(networkError)).toBe(true)
      expect(errorUtils.isRetryable(serverError)).toBe(true)
      expect(errorUtils.isRetryable(timeoutError)).toBe(true)
    })

    it('should identify non-retryable errors', () => {
      const clientError = new APIError('Client error', 400)
      const regularError = new Error('Regular error')

      expect(errorUtils.isRetryable(clientError)).toBe(false)
      expect(errorUtils.isRetryable(regularError)).toBe(false)
    })
  })

  describe('getUserMessage', () => {
    it('should return user-friendly messages for different error types', () => {
      const networkError = new APIError('Network error', 0, 'NETWORK_ERROR')
      const timeoutError = new APIError('Timeout', 0, 'ECONNABORTED')
      const rateLimitError = new APIError('Rate limit', 429)
      const serverError = new APIError('Server error', 500)
      const regularError = new Error('Regular error')

      expect(errorUtils.getUserMessage(networkError)).toContain('Unable to connect')
      expect(errorUtils.getUserMessage(timeoutError)).toContain('timed out')
      expect(errorUtils.getUserMessage(rateLimitError)).toContain('Too many requests')
      expect(errorUtils.getUserMessage(serverError)).toContain('Server error')
      expect(errorUtils.getUserMessage(regularError)).toContain('unexpected error')
    })
  })

  describe('retry', () => {
    it('should retry retryable errors', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new APIError('Network error', 0, 'NETWORK_ERROR'))
        .mockResolvedValueOnce('success')

      const result = await errorUtils.retry(mockFn, 2, 10)

      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(result).toBe('success')
    })

    it('should not retry non-retryable errors', async () => {
      const mockFn = vi.fn()
        .mockRejectedValue(new APIError('Client error', 400))

      await expect(errorUtils.retry(mockFn, 2, 10)).rejects.toThrow('Client error')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should throw last error after max retries', async () => {
      const mockFn = vi.fn()
        .mockRejectedValue(new APIError('Network error', 0, 'NETWORK_ERROR'))

      await expect(errorUtils.retry(mockFn, 2, 10)).rejects.toThrow('Network error')
      expect(mockFn).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })
  })
})