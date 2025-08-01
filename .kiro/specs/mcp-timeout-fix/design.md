# MCP Timeout Fix Design

## Overview

This design addresses the timeout mismatch issue between frontend and backend services when processing MCP tool calls. The solution involves adjusting timeout configurations across all layers and implementing progressive timeout handling with user feedback.

## Architecture

The timeout fix involves three main layers:

1. **Frontend Layer**: Vite proxy configuration and request handling
2. **Backend Layer**: AI service and MCP client timeout management
3. **User Experience Layer**: Progressive loading and timeout feedback

## Components and Interfaces

### Frontend Timeout Configuration

**File**: `frontend/vite.config.js`
- Increase proxy timeout from 10 seconds to 50 seconds
- Add timeout configuration for different request types

**File**: `frontend/src/services/requestManager.js`
- Implement progressive timeout handling
- Add request cancellation capability
- Show loading states for long-running requests

### Backend Timeout Alignment

**File**: `backend/services/ai_service.py`
- Increase AI service timeout from 30 to 45 seconds
- Add timeout context to error messages

**File**: `backend/services/simple_mcp_client.py`
- Increase MCP client timeout from 10 to 40 seconds
- Add retry logic for timeout scenarios
- Improve error reporting

### Progressive User Feedback

**File**: `frontend/src/components/ChatInterface.jsx`
- Add loading states for MCP operations
- Show which tools are being executed
- Provide cancellation option for long requests

## Data Models

### Timeout Configuration
```javascript
const TIMEOUT_CONFIG = {
  PROXY_TIMEOUT: 50000,        // 50 seconds
  AI_SERVICE_TIMEOUT: 45000,   // 45 seconds  
  MCP_CLIENT_TIMEOUT: 40000,   // 40 seconds
  PROGRESS_WARNING: 15000,     // 15 seconds
  CANCEL_OPTION: 30000         // 30 seconds
}
```

### Request State Management
```javascript
const REQUEST_STATES = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  MCP_TOOLS: 'mcp_tools',
  AI_GENERATING: 'ai_generating',
  COMPLETED: 'completed',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled'
}
```

## Error Handling

### Timeout Error Types
1. **Frontend Proxy Timeout**: Request cancelled by Vite proxy
2. **Backend AI Timeout**: AI service processing timeout
3. **MCP Tool Timeout**: Individual MCP tool call timeout
4. **User Cancellation**: User manually cancels long request

### Error Recovery Strategy
1. **Graceful Degradation**: If MCP tools timeout, AI still responds with available context
2. **Retry Logic**: Automatic retry for transient MCP failures
3. **User Feedback**: Clear messaging about what went wrong and suggested actions

## Testing Strategy

### Unit Tests
- Test timeout configurations in isolation
- Verify error handling for each timeout scenario
- Test request cancellation functionality

### Integration Tests
- End-to-end timeout behavior testing
- MCP tool timeout simulation
- Frontend-backend timeout coordination

### Performance Tests
- Measure actual MCP tool execution times
- Verify timeout thresholds are appropriate
- Test under various network conditions

## Implementation Phases

### Phase 1: Backend Timeout Fixes
1. Update MCP client timeout configuration
2. Adjust AI service timeout settings
3. Improve timeout error logging

### Phase 2: Frontend Timeout Configuration
1. Update Vite proxy timeout
2. Implement progressive loading states
3. Add request cancellation capability

### Phase 3: User Experience Enhancements
1. Add MCP tool execution indicators
2. Implement timeout warning messages
3. Provide retry and cancellation options

## Configuration Management

### Environment Variables
```bash
# Backend timeouts
AI_SERVICE_TIMEOUT=45
MCP_CLIENT_TIMEOUT=40

# Frontend timeouts (in vite.config.js)
VITE_PROXY_TIMEOUT=50000
VITE_REQUEST_TIMEOUT=45000
```

### Runtime Configuration
- Timeouts should be configurable without code changes
- Different timeout values for development vs production
- Ability to adjust timeouts based on MCP server performance