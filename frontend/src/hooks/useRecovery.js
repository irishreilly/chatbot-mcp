/**
 * React hook for recovery mechanisms - Simplified version
 */

import { useState, useEffect, useCallback } from 'react'
import { recoveryService, RECOVERY_STRATEGY } from '../services/recoveryService'

export function useRecovery() {
  const [recoveryStatus, setRecoveryStatus] = useState(() => recoveryService.getRecoveryStatus())
  const [isRecovering, setIsRecovering] = useState(false)
  const [lastRecoveryAction, setLastRecoveryAction] = useState(null)

  // Update recovery status
  const updateRecoveryStatus = useCallback(() => {
    setRecoveryStatus(recoveryService.getRecoveryStatus())
  }, [])

  useEffect(() => {
    // Subscribe to recovery events
    const unsubscribeRecovery = recoveryService.onRecovery((type, data) => {
      setLastRecoveryAction({ type, data, timestamp: Date.now() })
      updateRecoveryStatus()
    })

    const unsubscribeOffline = recoveryService.onOfflineMode((isOffline) => {
      updateRecoveryStatus()
    })

    // Initial status update
    updateRecoveryStatus()

    return () => {
      unsubscribeRecovery()
      unsubscribeOffline()
    }
  }, [updateRecoveryStatus])

  // Recovery actions
  const retryLastRequest = useCallback(async () => {
    setIsRecovering(true)
    try {
      await recoveryService.retryLastFailedRequest()
    } finally {
      setIsRecovering(false)
    }
  }, [])

  const refreshApplication = useCallback(async () => {
    setIsRecovering(true)
    try {
      await recoveryService.refreshApplication()
    } finally {
      setIsRecovering(false)
    }
  }, [])

  const clearCache = useCallback(async () => {
    setIsRecovering(true)
    try {
      await recoveryService.clearCache()
      updateRecoveryStatus()
    } finally {
      setIsRecovering(false)
    }
  }, [updateRecoveryStatus])

  const forceHealthCheck = useCallback(async () => {
    setIsRecovering(true)
    try {
      // Simplified health check
      await new Promise(resolve => setTimeout(resolve, 1000))
      updateRecoveryStatus()
    } finally {
      setIsRecovering(false)
    }
  }, [updateRecoveryStatus])

  // Execute request with recovery
  const executeWithRecovery = useCallback(async (requestFn, options = {}) => {
    return await recoveryService.executeWithRecovery(requestFn, options)
  }, [])

  // Feature availability check
  const isFeatureAvailable = useCallback((feature) => {
    return recoveryService.isFeatureAvailable(feature)
  }, [])

  // Get retry strategy for error
  const getRetryStrategy = useCallback((error) => {
    return recoveryService.getRetryStrategy(error)
  }, [])

  return {
    // Status
    recoveryStatus,
    isRecovering,
    lastRecoveryAction,
    isOfflineMode: recoveryStatus.isOfflineMode,
    degradationLevel: recoveryStatus.degradationLevel,
    connectionStatus: recoveryStatus.connectionStatus,

    // Actions
    retryLastRequest,
    refreshApplication,
    clearCache,
    forceHealthCheck,
    executeWithRecovery,

    // Utilities
    isFeatureAvailable,
    getRetryStrategy,
    updateRecoveryStatus
  }
}

export function useOfflineMode() {
  const [isOffline, setIsOffline] = useState(recoveryService.getRecoveryStatus().isOfflineMode)

  useEffect(() => {
    const unsubscribe = recoveryService.onOfflineMode(setIsOffline)
    return unsubscribe
  }, [])

  return isOffline
}

export function useDegradation() {
  const [degradationLevel, setDegradationLevel] = useState(
    recoveryService.getRecoveryStatus().degradationLevel
  )

  useEffect(() => {
    const unsubscribe = recoveryService.onRecovery((type, data) => {
      if (type === 'degradation') {
        setDegradationLevel(data.newLevel)
      }
    })
    return unsubscribe
  }, [])

  const isFeatureAvailable = useCallback((feature) => {
    return recoveryService.isFeatureAvailable(feature)
  }, [])

  return {
    degradationLevel,
    isFeatureAvailable
  }
}

export function useSmartRetry() {
  const executeWithSmartRetry = useCallback(async (requestFn, error = null) => {
    let strategy = { strategy: RECOVERY_STRATEGY.EXPONENTIAL_BACKOFF, maxRetries: 2 }
    
    if (error) {
      strategy = recoveryService.getRetryStrategy(error)
    }

    return await recoveryService.executeWithRecovery(requestFn, strategy)
  }, [])

  return { executeWithSmartRetry }
}