# MCP Timeout Fix Requirements

## Introduction

The MCP integration is working correctly on the backend, but the frontend is timing out after a few seconds when making requests that involve MCP tool calls. This is due to mismatched timeout configurations between the frontend proxy, backend services, and MCP client operations.

## Requirements

### Requirement 1: Frontend Timeout Configuration

**User Story:** As a user, I want my Grafana queries to complete successfully without timing out, so that I can get the information I need.

#### Acceptance Criteria

1. WHEN a user makes a Grafana-related query THEN the frontend SHALL wait at least 45 seconds before timing out
2. WHEN the frontend proxy is configured THEN it SHALL have a timeout of at least 45 seconds
3. WHEN a request is taking longer than 30 seconds THEN the frontend SHALL show a loading indicator with progress information

### Requirement 2: Backend Timeout Alignment

**User Story:** As a developer, I want consistent timeout configurations across all services, so that requests don't fail due to timeout mismatches.

#### Acceptance Criteria

1. WHEN the AI service processes MCP requests THEN it SHALL have a timeout of at least 40 seconds
2. WHEN the MCP client makes tool calls THEN it SHALL have a timeout of at least 35 seconds
3. WHEN timeout errors occur THEN they SHALL be properly logged with context information

### Requirement 3: Progressive Timeout Handling

**User Story:** As a user, I want to see progress updates for long-running requests, so that I know the system is working.

#### Acceptance Criteria

1. WHEN a request takes longer than 15 seconds THEN the frontend SHALL show a "still processing" message
2. WHEN a request takes longer than 30 seconds THEN the frontend SHALL show an option to cancel the request
3. WHEN MCP tools are being executed THEN the user SHALL see which tools are being called

### Requirement 4: Error Recovery

**User Story:** As a user, I want clear error messages when timeouts occur, so that I understand what happened.

#### Acceptance Criteria

1. WHEN a timeout occurs THEN the user SHALL see a clear error message explaining the timeout
2. WHEN a timeout occurs THEN the user SHALL be given options to retry or modify their request
3. WHEN MCP services are unavailable THEN the AI SHALL still respond with available information