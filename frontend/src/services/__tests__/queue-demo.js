/**
 * Demonstration of RequestQueue features
 * Run with: node frontend/src/services/__tests__/queue-demo.js
 */

import { RequestQueue, REQUEST_PRIORITY, QUEUE_STATUS } from '../requestQueue.js'

// Create a queue with small limits for demonstration
const queue = new RequestQueue({
  maxConcurrentRequests: 2,
  maxQueueSize: 10,
  batchSize: 3,
  batchDelay: 200
})

// Mock request functions
const createMockRequest = (name, delay = 100) => {
  return () => new Promise(resolve => {
    console.log(`🚀 Starting request: ${name}`)
    setTimeout(() => {
      console.log(`✅ Completed request: ${name}`)
      resolve(`Result: ${name}`)
    }, delay)
  })
}

// Add event listeners
queue.on('statusChange', (data) => {
  console.log(`📊 Queue status changed: ${data.oldStatus} → ${data.newStatus}`)
})

queue.on('overflow', (data) => {
  console.log(`⚠️  Queue overflow! Size: ${data.queueSize}/${data.maxSize}`)
})

queue.on('requestComplete', (data) => {
  console.log(`🎯 Request completed: ${data.request.id} (${data.success ? 'success' : 'failed'})`)
})

async function demonstrateFeatures() {
  console.log('🎬 Starting RequestQueue demonstration...\n')

  // 1. Demonstrate priority-based processing
  console.log('1️⃣ Testing priority-based processing:')
  
  const lowPriorityPromise = queue.enqueue(createMockRequest('Low Priority', 50), {
    priority: REQUEST_PRIORITY.LOW
  })
  
  const normalPriorityPromise = queue.enqueue(createMockRequest('Normal Priority', 50), {
    priority: REQUEST_PRIORITY.NORMAL
  })
  
  const highPriorityPromise = queue.enqueue(createMockRequest('High Priority', 50), {
    priority: REQUEST_PRIORITY.HIGH
  })

  await Promise.all([highPriorityPromise, normalPriorityPromise, lowPriorityPromise])
  console.log('✨ Priority test completed\n')

  // 2. Demonstrate concurrency control
  console.log('2️⃣ Testing concurrency control (max 2 concurrent):')
  
  const concurrentPromises = []
  for (let i = 1; i <= 5; i++) {
    concurrentPromises.push(
      queue.enqueue(createMockRequest(`Concurrent-${i}`, 300))
    )
  }

  await Promise.all(concurrentPromises)
  console.log('✨ Concurrency test completed\n')

  // 3. Demonstrate batching
  console.log('3️⃣ Testing request batching:')
  
  const batchPromises = []
  for (let i = 1; i <= 4; i++) {
    batchPromises.push(
      queue.enqueue(createMockRequest(`Batch-${i}`, 100), {
        batchable: true
      })
    )
  }

  await Promise.all(batchPromises)
  console.log('✨ Batching test completed\n')

  // 4. Demonstrate queue status monitoring
  console.log('4️⃣ Queue status information:')
  const status = queue.getStatus()
  console.log('📈 Final statistics:', {
    totalQueued: status.stats.totalQueued,
    totalProcessed: status.stats.totalProcessed,
    totalFailed: status.stats.totalFailed,
    averageWaitTime: Math.round(status.stats.averageWaitTime),
    averageProcessingTime: Math.round(status.stats.averageProcessingTime)
  })

  console.log('\n🎉 Demonstration completed!')
}

// Run the demonstration
demonstrateFeatures().catch(console.error)