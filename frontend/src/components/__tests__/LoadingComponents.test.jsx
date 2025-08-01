import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import LoadingIndicator from '../LoadingIndicator'
import ProgressBar from '../ProgressBar'
import TimeoutCountdown from '../TimeoutCountdown'

// Mock the request manager
vi.mock('../../services/requestManager', () => ({
  requestManager: {
    getActiveRequests: vi.fn(() => []),
    cancelRequest: vi.fn(),
    cancelAllRequests: vi.fn()
  }
}))

describe('Loading Components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('LoadingIndicator', () => {
    it('should render with default props', () => {
      render(<LoadingIndicator />)
      
      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.getByText('0s')).toBeInTheDocument()
    })

    it('should render custom message', () => {
      render(<LoadingIndicator message="Processing your request..." />)
      
      expect(screen.getByText('Processing your request...')).toBeInTheDocument()
    })

    it('should show timeout warning after specified time', async () => {
      render(<LoadingIndicator timeoutWarning={5000} />)
      
      // Fast-forward time to trigger warning
      vi.advanceTimersByTime(6000)
      
      await waitFor(() => {
        expect(screen.getByText('⚠️ This is taking longer than expected')).toBeInTheDocument()
      })
    })

    it('should show cancel button when allowCancel is true', () => {
      render(<LoadingIndicator allowCancel={true} />)
      
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('should call onCancel when cancel button is clicked', () => {
      const onCancel = vi.fn()
      render(<LoadingIndicator allowCancel={true} onCancel={onCancel} />)
      
      fireEvent.click(screen.getByText('Cancel'))
      
      expect(onCancel).toHaveBeenCalled()
    })

    it('should display different spinner variants', () => {
      const { rerender } = render(<LoadingIndicator variant="spinner" />)
      expect(document.querySelector('.loading-spinner')).toBeInTheDocument()
      
      rerender(<LoadingIndicator variant="dots" />)
      expect(document.querySelector('.loading-dots')).toBeInTheDocument()
      
      rerender(<LoadingIndicator variant="pulse" />)
      expect(document.querySelector('.loading-pulse')).toBeInTheDocument()
    })

    it('should apply size classes correctly', () => {
      const { rerender } = render(<LoadingIndicator size="small" />)
      expect(document.querySelector('.loading-indicator--small')).toBeInTheDocument()
      
      rerender(<LoadingIndicator size="large" />)
      expect(document.querySelector('.loading-indicator--large')).toBeInTheDocument()
    })
  })

  describe('ProgressBar', () => {
    it('should render with progress value', () => {
      render(<ProgressBar progress={50} />)
      
      expect(screen.getByText('50%')).toBeInTheDocument()
      
      const progressFill = document.querySelector('.progress-bar__fill')
      expect(progressFill).toHaveStyle({ width: '50%' })
    })

    it('should render indeterminate progress', () => {
      render(<ProgressBar indeterminate={true} />)
      
      expect(document.querySelector('.progress-bar__fill--indeterminate')).toBeInTheDocument()
      expect(screen.queryByText('%')).not.toBeInTheDocument()
    })

    it('should show custom message', () => {
      render(<ProgressBar message="Uploading file..." progress={25} />)
      
      expect(screen.getByText('Uploading file...')).toBeInTheDocument()
    })

    it('should hide percentage when showPercentage is false', () => {
      render(<ProgressBar progress={75} showPercentage={false} />)
      
      expect(screen.queryByText('75%')).not.toBeInTheDocument()
    })

    it('should show time estimate when enabled', () => {
      const startTime = Date.now() - 10000 // 10 seconds ago
      render(
        <ProgressBar 
          progress={50} 
          showTimeEstimate={true} 
          startTime={startTime} 
        />
      )
      
      expect(screen.getByText(/remaining/)).toBeInTheDocument()
    })

    it('should apply color classes correctly', () => {
      const { rerender } = render(<ProgressBar color="green" progress={50} />)
      expect(document.querySelector('.progress-bar--green')).toBeInTheDocument()
      
      rerender(<ProgressBar color="red" progress={50} />)
      expect(document.querySelector('.progress-bar--red')).toBeInTheDocument()
    })

    it('should clamp progress values to 0-100 range', () => {
      const { rerender } = render(<ProgressBar progress={-10} />)
      let progressFill = document.querySelector('.progress-bar__fill')
      expect(progressFill).toHaveStyle({ width: '0%' })
      
      rerender(<ProgressBar progress={150} />)
      progressFill = document.querySelector('.progress-bar__fill')
      expect(progressFill).toHaveStyle({ width: '100%' })
    })
  })

  describe('TimeoutCountdown', () => {
    it('should render countdown timer', () => {
      render(<TimeoutCountdown timeoutMs={30000} />)
      
      expect(screen.getByText('Request will timeout in')).toBeInTheDocument()
      expect(screen.getByText('30s')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('should countdown and update display', async () => {
      render(<TimeoutCountdown timeoutMs={5000} />)
      
      expect(screen.getByText('5s')).toBeInTheDocument()
      
      // Advance time by 1 second
      vi.advanceTimersByTime(1000)
      
      await waitFor(() => {
        expect(screen.getByText('4s')).toBeInTheDocument()
      })
    })

    it('should show warning state when time is low', async () => {
      render(<TimeoutCountdown timeoutMs={15000} warningThreshold={10000} />)
      
      // Advance time to trigger warning
      vi.advanceTimersByTime(6000)
      
      await waitFor(() => {
        expect(document.querySelector('.timeout-countdown--warning')).toBeInTheDocument()
        expect(screen.getByText('⚠️')).toBeInTheDocument()
      })
    })

    it('should call onTimeout when time expires', async () => {
      const onTimeout = vi.fn()
      render(<TimeoutCountdown timeoutMs={2000} onTimeout={onTimeout} />)
      
      // Advance time past timeout
      vi.advanceTimersByTime(3000)
      
      await waitFor(() => {
        expect(onTimeout).toHaveBeenCalled()
        expect(screen.getByText('Request timed out')).toBeInTheDocument()
        expect(screen.getByText('Retry')).toBeInTheDocument()
      })
    })

    it('should call onCancel when cancel button is clicked', () => {
      const onCancel = vi.fn()
      render(<TimeoutCountdown timeoutMs={30000} onCancel={onCancel} />)
      
      fireEvent.click(screen.getByText('Cancel'))
      
      expect(onCancel).toHaveBeenCalled()
    })

    it('should restart countdown when retry is clicked', async () => {
      const onTimeout = vi.fn()
      render(<TimeoutCountdown timeoutMs={2000} onTimeout={onTimeout} />)
      
      // Let it timeout
      vi.advanceTimersByTime(3000)
      
      await waitFor(() => {
        expect(screen.getByText('Request timed out')).toBeInTheDocument()
      })
      
      // Click retry
      fireEvent.click(screen.getByText('Retry'))
      
      expect(screen.getByText('2s')).toBeInTheDocument()
      expect(screen.queryByText('Request timed out')).not.toBeInTheDocument()
    })

    it('should show progress bar when enabled', () => {
      render(<TimeoutCountdown timeoutMs={30000} showProgress={true} />)
      
      expect(document.querySelector('.timeout-countdown__progress')).toBeInTheDocument()
    })

    it('should format time correctly for minutes', () => {
      render(<TimeoutCountdown timeoutMs={90000} />) // 90 seconds = 1:30
      
      expect(screen.getByText('1:30')).toBeInTheDocument()
    })

    it('should not start automatically when autoStart is false', () => {
      render(<TimeoutCountdown timeoutMs={30000} autoStart={false} />)
      
      // Component should not be visible
      expect(screen.queryByText('Request will timeout in')).not.toBeInTheDocument()
    })
  })
})