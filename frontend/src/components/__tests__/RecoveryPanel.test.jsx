/**
 * Tests for RecoveryPanel component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RecoveryPanel from '../RecoveryPanel'
import { useRecovery } from '../../hooks/useRecovery'

// Mock the useRecovery hook
vi.mock('../../hooks/useRecovery')

describe('RecoveryPanel', () => {
  const mockUseRecovery = {
    recoveryStatus: {
      isOfflineMode: false,
      degradationLevel: 0,
      cacheSize: 5,
      circuitBreakers: [],
      connectionStatus: {
        status: 'connected',
        isOnline: true,
        lastHealthCheck: new Date(),
        responseTime: 150,
        errorCount: 0,
        consecutiveErrors: 0
      }
    },
    isRecovering: false,
    lastRecoveryAction: null,
    retryLastRequest: vi.fn(),
    refreshApplication: vi.fn(),
    clearCache: vi.fn(),
    forceHealthCheck: vi.fn(),
    isFeatureAvailable: vi.fn()
  }

  beforeEach(() => {
    useRecovery.mockReturnValue(mockUseRecovery)
    mockUseRecovery.isFeatureAvailable.mockImplementation((feature) => {
      const availableFeatures = ['chat', 'file-upload', 'real-time-updates']
      return availableFeatures.includes(feature)
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Visibility', () => {
    it('should not render when not visible', () => {
      render(<RecoveryPanel isVisible={false} onClose={vi.fn()} />)
      
      expect(screen.queryByText('Recovery & Diagnostics')).not.toBeInTheDocument()
    })

    it('should render when visible', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      expect(screen.getByText('Recovery & Diagnostics')).toBeInTheDocument()
    })
  })

  describe('Header', () => {
    it('should render header with title and close button', () => {
      const onClose = vi.fn()
      render(<RecoveryPanel isVisible={true} onClose={onClose} />)
      
      expect(screen.getByText('Recovery & Diagnostics')).toBeInTheDocument()
      
      const closeButton = screen.getByLabelText('Close recovery panel')
      expect(closeButton).toBeInTheDocument()
      
      fireEvent.click(closeButton)
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('System Status Section', () => {
    it('should display system status information', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      // Click to expand status section
      fireEvent.click(screen.getByText('System Status'))
      
      expect(screen.getByText('Connection:')).toBeInTheDocument()
      expect(screen.getByText('connected')).toBeInTheDocument()
      expect(screen.getByText('Mode:')).toBeInTheDocument()
      expect(screen.getByText('Online')).toBeInTheDocument()
      expect(screen.getByText('Cache Size:')).toBeInTheDocument()
      expect(screen.getByText('5 items')).toBeInTheDocument()
      expect(screen.getByText('Response Time:')).toBeInTheDocument()
      expect(screen.getByText('150ms')).toBeInTheDocument()
    })

    it('should show offline mode status', () => {
      useRecovery.mockReturnValue({
        ...mockUseRecovery,
        recoveryStatus: {
          ...mockUseRecovery.recoveryStatus,
          isOfflineMode: true
        }
      })

      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      fireEvent.click(screen.getByText('System Status'))
      
      expect(screen.getByText('Offline')).toBeInTheDocument()
    })

    it('should show degradation level description', () => {
      useRecovery.mockReturnValue({
        ...mockUseRecovery,
        recoveryStatus: {
          ...mockUseRecovery.recoveryStatus,
          degradationLevel: 2
        }
      })

      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      fireEvent.click(screen.getByText('System Status'))
      
      expect(screen.getByText('Offline mode - cached data only')).toBeInTheDocument()
    })
  })

  describe('Recovery Actions Section', () => {
    it('should display recovery action buttons', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      fireEvent.click(screen.getByText('Recovery Actions'))
      
      expect(screen.getByText('Retry Last Request')).toBeInTheDocument()
      expect(screen.getByText('Check Connection')).toBeInTheDocument()
      expect(screen.getByText('Clear Cache')).toBeInTheDocument()
      expect(screen.getByText('Refresh Application')).toBeInTheDocument()
    })

    it('should call recovery functions when buttons are clicked', async () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      fireEvent.click(screen.getByText('Recovery Actions'))
      
      fireEvent.click(screen.getByText('Retry Last Request'))
      expect(mockUseRecovery.retryLastRequest).toHaveBeenCalled()
      
      fireEvent.click(screen.getByText('Check Connection'))
      expect(mockUseRecovery.forceHealthCheck).toHaveBeenCalled()
      
      fireEvent.click(screen.getByText('Clear Cache'))
      expect(mockUseRecovery.clearCache).toHaveBeenCalled()
      
      fireEvent.click(screen.getByText('Refresh Application'))
      expect(mockUseRecovery.refreshApplication).toHaveBeenCalled()
    })

    it('should disable buttons when recovering', () => {
      useRecovery.mockReturnValue({
        ...mockUseRecovery,
        isRecovering: true
      })

      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      fireEvent.click(screen.getByText('Recovery Actions'))
      
      expect(screen.getByText('Retrying...')).toBeInTheDocument()
      expect(screen.getByText('Checking...')).toBeInTheDocument()
      expect(screen.getByText('Clearing...')).toBeInTheDocument()
      expect(screen.getByText('Refreshing...')).toBeInTheDocument()
      
      const buttons = screen.getAllByRole('button')
      const actionButtons = buttons.filter(btn => 
        btn.textContent.includes('...') && btn !== screen.getByLabelText('Close recovery panel')
      )
      
      actionButtons.forEach(button => {
        expect(button).toBeDisabled()
      })
    })

    it('should display last recovery action', () => {
      useRecovery.mockReturnValue({
        ...mockUseRecovery,
        lastRecoveryAction: {
          type: 'refresh',
          timestamp: Date.now()
        }
      })

      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      fireEvent.click(screen.getByText('Recovery Actions'))
      
      expect(screen.getByText(/Last action: refresh at/)).toBeInTheDocument()
    })
  })

  describe('Feature Availability Section', () => {
    it('should display feature availability status', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      fireEvent.click(screen.getByText('Feature Availability'))
      
      expect(screen.getByText('Chat Messages:')).toBeInTheDocument()
      expect(screen.getByText('File Upload:')).toBeInTheDocument()
      expect(screen.getByText('Real-time Updates:')).toBeInTheDocument()
      expect(screen.getByText('Advanced Features:')).toBeInTheDocument()
      expect(screen.getByText('Analytics:')).toBeInTheDocument()
      expect(screen.getByText('Non-essential Features:')).toBeInTheDocument()
    })

    it('should show correct availability status for features', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      fireEvent.click(screen.getByText('Feature Availability'))
      
      // Available features
      expect(screen.getAllByText('✓ Available')).toHaveLength(3)
      
      // Unavailable features
      expect(screen.getAllByText('✗ Unavailable')).toHaveLength(3)
    })
  })

  describe('Circuit Breakers Section', () => {
    it('should not show circuit breakers section when empty', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      expect(screen.queryByText('Circuit Breakers')).not.toBeInTheDocument()
    })

    it('should show circuit breakers when present', () => {
      useRecovery.mockReturnValue({
        ...mockUseRecovery,
        recoveryStatus: {
          ...mockUseRecovery.recoveryStatus,
          circuitBreakers: [
            { service: 'chatService', state: 'open', failures: 5 },
            { service: 'uploadService', state: 'closed', failures: 0 }
          ]
        }
      })

      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      fireEvent.click(screen.getByText('Circuit Breakers'))
      
      expect(screen.getByText('chatService:')).toBeInTheDocument()
      expect(screen.getByText('open')).toBeInTheDocument()
      expect(screen.getByText('(5 failures)')).toBeInTheDocument()
      
      expect(screen.getByText('uploadService:')).toBeInTheDocument()
      expect(screen.getByText('closed')).toBeInTheDocument()
      expect(screen.getByText('(0 failures)')).toBeInTheDocument()
    })
  })

  describe('Help Section', () => {
    it('should display help information', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      expect(screen.getByText('Recovery Tips:')).toBeInTheDocument()
      expect(screen.getByText(/Retry Last Request:/)).toBeInTheDocument()
      expect(screen.getByText(/Check Connection:/)).toBeInTheDocument()
      expect(screen.getByText(/Clear Cache:/)).toBeInTheDocument()
      expect(screen.getByText(/Refresh Application:/)).toBeInTheDocument()
    })
  })

  describe('Section Expansion', () => {
    it('should expand and collapse sections', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      // Initially collapsed
      expect(screen.queryByText('Connection:')).not.toBeInTheDocument()
      
      // Click to expand
      fireEvent.click(screen.getByText('System Status'))
      expect(screen.getByText('Connection:')).toBeInTheDocument()
      
      // Click to collapse
      fireEvent.click(screen.getByText('System Status'))
      expect(screen.queryByText('Connection:')).not.toBeInTheDocument()
    })

    it('should show expand icon rotation', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      const statusHeader = screen.getByText('System Status').parentElement
      const expandIcon = statusHeader.querySelector('.expand-icon')
      
      expect(expandIcon).not.toHaveClass('expanded')
      
      fireEvent.click(screen.getByText('System Status'))
      expect(expandIcon).toHaveClass('expanded')
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      expect(screen.getByLabelText('Close recovery panel')).toBeInTheDocument()
    })

    it('should be keyboard navigable', () => {
      render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
      
      const closeButton = screen.getByLabelText('Close recovery panel')
      closeButton.focus()
      expect(document.activeElement).toBe(closeButton)
    })
  })

  describe('Responsive Behavior', () => {
    it('should handle different connection statuses with appropriate colors', () => {
      const statuses = [
        { status: 'connected', expectedColor: '#4CAF50' },
        { status: 'slow', expectedColor: '#FF9800' },
        { status: 'disconnected', expectedColor: '#F44336' },
        { status: 'unknown', expectedColor: '#9E9E9E' }
      ]

      statuses.forEach(({ status, expectedColor }) => {
        useRecovery.mockReturnValue({
          ...mockUseRecovery,
          recoveryStatus: {
            ...mockUseRecovery.recoveryStatus,
            connectionStatus: {
              ...mockUseRecovery.recoveryStatus.connectionStatus,
              status
            }
          }
        })

        const { unmount } = render(<RecoveryPanel isVisible={true} onClose={vi.fn()} />)
        
        fireEvent.click(screen.getByText('System Status'))
        
        const statusElement = screen.getByText(status)
        expect(statusElement).toHaveStyle(`color: ${expectedColor}`)
        
        unmount()
      })
    })
  })
})