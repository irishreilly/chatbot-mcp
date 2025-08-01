import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Proxy Configuration Validation', () => {
  let originalEnv
  let mockConsole

  beforeEach(() => {
    originalEnv = process.env
    mockConsole = {
      warn: vi.fn(),
      log: vi.fn()
    }
    vi.stubGlobal('console', mockConsole)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  // Helper function to simulate the validation logic from vite.config.js
  const validateEnvVar = (name, defaultValue, validator = null) => {
    const value = process.env[name] || defaultValue
    if (validator && !validator(value)) {
      console.warn(`[PROXY CONFIG] Invalid value for ${name}: ${value}, using default: ${defaultValue}`)
      return defaultValue
    }
    return value
  }

  const isPositiveInteger = (value) => {
    const num = parseInt(value)
    return !isNaN(num) && num > 0
  }

  const isValidUrl = (value) => {
    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  }

  const isBoolean = (value) => {
    return value === 'true' || value === 'false'
  }

  describe('Environment Variable Validation', () => {
    it('should use default values when environment variables are not set', () => {
      process.env = {}

      const config = {
        backendUrl: validateEnvVar('VITE_BACKEND_URL', 'http://localhost:8000', isValidUrl),
        proxyTimeout: parseInt(validateEnvVar('VITE_PROXY_TIMEOUT', '30000', isPositiveInteger)),
        circuitBreakerThreshold: parseInt(validateEnvVar('VITE_CIRCUIT_BREAKER_THRESHOLD', '5', isPositiveInteger)),
        circuitBreakerTimeout: parseInt(validateEnvVar('VITE_CIRCUIT_BREAKER_TIMEOUT', '60000', isPositiveInteger)),
        fallbackEnabled: validateEnvVar('VITE_PROXY_FALLBACK_ENABLED', 'false', isBoolean) === 'true',
        fallbackTarget: validateEnvVar('VITE_PROXY_FALLBACK_TARGET', 'http://localhost:8001', isValidUrl),
        fallbackThreshold: parseInt(validateEnvVar('VITE_PROXY_FALLBACK_THRESHOLD', '5', isPositiveInteger)),
        fallbackTimeout: parseInt(validateEnvVar('VITE_PROXY_FALLBACK_TIMEOUT', '10000', isPositiveInteger))
      }

      expect(config.backendUrl).toBe('http://localhost:8000')
      expect(config.proxyTimeout).toBe(30000)
      expect(config.circuitBreakerThreshold).toBe(5)
      expect(config.circuitBreakerTimeout).toBe(60000)
      expect(config.fallbackEnabled).toBe(false)
      expect(config.fallbackTarget).toBe('http://localhost:8001')
      expect(config.fallbackThreshold).toBe(5)
      expect(config.fallbackTimeout).toBe(10000)
    })

    it('should use valid environment variables when provided', () => {
      process.env = {
        VITE_BACKEND_URL: 'http://api.example.com:9000',
        VITE_PROXY_TIMEOUT: '45000',
        VITE_CIRCUIT_BREAKER_THRESHOLD: '10',
        VITE_CIRCUIT_BREAKER_TIMEOUT: '120000',
        VITE_PROXY_FALLBACK_ENABLED: 'true',
        VITE_PROXY_FALLBACK_TARGET: 'http://fallback.example.com:8001',
        VITE_PROXY_FALLBACK_THRESHOLD: '3',
        VITE_PROXY_FALLBACK_TIMEOUT: '15000'
      }

      const config = {
        backendUrl: validateEnvVar('VITE_BACKEND_URL', 'http://localhost:8000', isValidUrl),
        proxyTimeout: parseInt(validateEnvVar('VITE_PROXY_TIMEOUT', '30000', isPositiveInteger)),
        circuitBreakerThreshold: parseInt(validateEnvVar('VITE_CIRCUIT_BREAKER_THRESHOLD', '5', isPositiveInteger)),
        circuitBreakerTimeout: parseInt(validateEnvVar('VITE_CIRCUIT_BREAKER_TIMEOUT', '60000', isPositiveInteger)),
        fallbackEnabled: validateEnvVar('VITE_PROXY_FALLBACK_ENABLED', 'false', isBoolean) === 'true',
        fallbackTarget: validateEnvVar('VITE_PROXY_FALLBACK_TARGET', 'http://localhost:8001', isValidUrl),
        fallbackThreshold: parseInt(validateEnvVar('VITE_PROXY_FALLBACK_THRESHOLD', '5', isPositiveInteger)),
        fallbackTimeout: parseInt(validateEnvVar('VITE_PROXY_FALLBACK_TIMEOUT', '10000', isPositiveInteger))
      }

      expect(config.backendUrl).toBe('http://api.example.com:9000')
      expect(config.proxyTimeout).toBe(45000)
      expect(config.circuitBreakerThreshold).toBe(10)
      expect(config.circuitBreakerTimeout).toBe(120000)
      expect(config.fallbackEnabled).toBe(true)
      expect(config.fallbackTarget).toBe('http://fallback.example.com:8001')
      expect(config.fallbackThreshold).toBe(3)
      expect(config.fallbackTimeout).toBe(15000)
    })

    it('should warn and use defaults for invalid URLs', () => {
      process.env = {
        VITE_BACKEND_URL: 'invalid-url',
        VITE_PROXY_FALLBACK_TARGET: 'not-a-url'
      }

      const backendUrl = validateEnvVar('VITE_BACKEND_URL', 'http://localhost:8000', isValidUrl)
      const fallbackTarget = validateEnvVar('VITE_PROXY_FALLBACK_TARGET', 'http://localhost:8001', isValidUrl)

      expect(backendUrl).toBe('http://localhost:8000')
      expect(fallbackTarget).toBe('http://localhost:8001')
      expect(mockConsole.warn).toHaveBeenCalledWith('[PROXY CONFIG] Invalid value for VITE_BACKEND_URL: invalid-url, using default: http://localhost:8000')
      expect(mockConsole.warn).toHaveBeenCalledWith('[PROXY CONFIG] Invalid value for VITE_PROXY_FALLBACK_TARGET: not-a-url, using default: http://localhost:8001')
    })

    it('should warn and use defaults for invalid positive integers', () => {
      process.env = {
        VITE_PROXY_TIMEOUT: '-1000',
        VITE_CIRCUIT_BREAKER_THRESHOLD: 'not-a-number',
        VITE_CIRCUIT_BREAKER_TIMEOUT: '0',
        VITE_PROXY_FALLBACK_THRESHOLD: '-5',
        VITE_PROXY_FALLBACK_TIMEOUT: 'invalid'
      }

      const proxyTimeout = parseInt(validateEnvVar('VITE_PROXY_TIMEOUT', '30000', isPositiveInteger))
      const circuitBreakerThreshold = parseInt(validateEnvVar('VITE_CIRCUIT_BREAKER_THRESHOLD', '5', isPositiveInteger))
      const circuitBreakerTimeout = parseInt(validateEnvVar('VITE_CIRCUIT_BREAKER_TIMEOUT', '60000', isPositiveInteger))
      const fallbackThreshold = parseInt(validateEnvVar('VITE_PROXY_FALLBACK_THRESHOLD', '5', isPositiveInteger))
      const fallbackTimeout = parseInt(validateEnvVar('VITE_PROXY_FALLBACK_TIMEOUT', '10000', isPositiveInteger))

      expect(proxyTimeout).toBe(30000)
      expect(circuitBreakerThreshold).toBe(5)
      expect(circuitBreakerTimeout).toBe(60000)
      expect(fallbackThreshold).toBe(5)
      expect(fallbackTimeout).toBe(10000)

      expect(mockConsole.warn).toHaveBeenCalledWith('[PROXY CONFIG] Invalid value for VITE_PROXY_TIMEOUT: -1000, using default: 30000')
      expect(mockConsole.warn).toHaveBeenCalledWith('[PROXY CONFIG] Invalid value for VITE_CIRCUIT_BREAKER_THRESHOLD: not-a-number, using default: 5')
      expect(mockConsole.warn).toHaveBeenCalledWith('[PROXY CONFIG] Invalid value for VITE_CIRCUIT_BREAKER_TIMEOUT: 0, using default: 60000')
      expect(mockConsole.warn).toHaveBeenCalledWith('[PROXY CONFIG] Invalid value for VITE_PROXY_FALLBACK_THRESHOLD: -5, using default: 5')
      expect(mockConsole.warn).toHaveBeenCalledWith('[PROXY CONFIG] Invalid value for VITE_PROXY_FALLBACK_TIMEOUT: invalid, using default: 10000')
    })

    it('should warn and use defaults for invalid boolean values', () => {
      process.env = {
        VITE_PROXY_FALLBACK_ENABLED: 'yes'
      }

      const fallbackEnabled = validateEnvVar('VITE_PROXY_FALLBACK_ENABLED', 'false', isBoolean) === 'true'

      expect(fallbackEnabled).toBe(false)
      expect(mockConsole.warn).toHaveBeenCalledWith('[PROXY CONFIG] Invalid value for VITE_PROXY_FALLBACK_ENABLED: yes, using default: false')
    })
  })

  describe('Validator Functions', () => {
    it('should validate positive integers correctly', () => {
      expect(isPositiveInteger('1')).toBe(true)
      expect(isPositiveInteger('100')).toBe(true)
      expect(isPositiveInteger('30000')).toBe(true)
      
      expect(isPositiveInteger('0')).toBe(false)
      expect(isPositiveInteger('-1')).toBe(false)
      expect(isPositiveInteger('not-a-number')).toBe(false)
      expect(isPositiveInteger('')).toBe(false)
      expect(isPositiveInteger('1.5')).toBe(true) // parseInt truncates to 1, which is positive
    })

    it('should validate URLs correctly', () => {
      expect(isValidUrl('http://localhost:8000')).toBe(true)
      expect(isValidUrl('https://api.example.com')).toBe(true)
      expect(isValidUrl('http://192.168.1.100:3000')).toBe(true)
      
      expect(isValidUrl('invalid-url')).toBe(false)
      expect(isValidUrl('not-a-url')).toBe(false)
      expect(isValidUrl('')).toBe(false)
      expect(isValidUrl('localhost:8000')).toBe(true) // URL constructor accepts this format
    })

    it('should validate boolean strings correctly', () => {
      expect(isBoolean('true')).toBe(true)
      expect(isBoolean('false')).toBe(true)
      
      expect(isBoolean('yes')).toBe(false)
      expect(isBoolean('no')).toBe(false)
      expect(isBoolean('1')).toBe(false)
      expect(isBoolean('0')).toBe(false)
      expect(isBoolean('')).toBe(false)
      expect(isBoolean('TRUE')).toBe(false) // Case sensitive
    })
  })

  describe('Configuration Integration', () => {
    it('should create a complete configuration object with all required fields', () => {
      process.env = {
        VITE_BACKEND_URL: 'http://test-backend:8000',
        VITE_PROXY_TIMEOUT: '25000',
        VITE_CIRCUIT_BREAKER_THRESHOLD: '7',
        VITE_CIRCUIT_BREAKER_TIMEOUT: '90000',
        VITE_PROXY_FALLBACK_ENABLED: 'true',
        VITE_PROXY_FALLBACK_TARGET: 'http://test-fallback:8001',
        VITE_PROXY_FALLBACK_THRESHOLD: '4',
        VITE_PROXY_FALLBACK_TIMEOUT: '12000'
      }

      const config = {
        backendUrl: validateEnvVar('VITE_BACKEND_URL', 'http://localhost:8000', isValidUrl),
        proxyTimeout: parseInt(validateEnvVar('VITE_PROXY_TIMEOUT', '30000', isPositiveInteger)),
        circuitBreakerThreshold: parseInt(validateEnvVar('VITE_CIRCUIT_BREAKER_THRESHOLD', '5', isPositiveInteger)),
        circuitBreakerTimeout: parseInt(validateEnvVar('VITE_CIRCUIT_BREAKER_TIMEOUT', '60000', isPositiveInteger)),
        fallbackEnabled: validateEnvVar('VITE_PROXY_FALLBACK_ENABLED', 'false', isBoolean) === 'true',
        fallbackTarget: validateEnvVar('VITE_PROXY_FALLBACK_TARGET', 'http://localhost:8001', isValidUrl),
        fallbackThreshold: parseInt(validateEnvVar('VITE_PROXY_FALLBACK_THRESHOLD', '5', isPositiveInteger)),
        fallbackTimeout: parseInt(validateEnvVar('VITE_PROXY_FALLBACK_TIMEOUT', '10000', isPositiveInteger))
      }

      // Verify all configuration fields are present and have correct types
      expect(config).toEqual({
        backendUrl: 'http://test-backend:8000',
        proxyTimeout: 25000,
        circuitBreakerThreshold: 7,
        circuitBreakerTimeout: 90000,
        fallbackEnabled: true,
        fallbackTarget: 'http://test-fallback:8001',
        fallbackThreshold: 4,
        fallbackTimeout: 12000
      })

      // Verify types
      expect(typeof config.backendUrl).toBe('string')
      expect(typeof config.proxyTimeout).toBe('number')
      expect(typeof config.circuitBreakerThreshold).toBe('number')
      expect(typeof config.circuitBreakerTimeout).toBe('number')
      expect(typeof config.fallbackEnabled).toBe('boolean')
      expect(typeof config.fallbackTarget).toBe('string')
      expect(typeof config.fallbackThreshold).toBe('number')
      expect(typeof config.fallbackTimeout).toBe('number')
    })
  })
})