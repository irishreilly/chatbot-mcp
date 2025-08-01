/**
 * @fileoverview Type definitions for API requests and responses
 */

/**
 * @typedef {Object} ChatRequest
 * @property {string} message - The user's message
 * @property {string} [conversation_id] - Optional conversation ID
 */

/**
 * @typedef {Object} ChatResponse
 * @property {string} response - The chatbot's response
 * @property {string} conversation_id - The conversation ID
 * @property {string[]} mcp_tools_used - List of MCP tools used
 * @property {string} timestamp - ISO 8601 timestamp
 */

/**
 * @typedef {Object} Message
 * @property {string} id - Message ID
 * @property {string} conversation_id - Conversation ID
 * @property {string} content - Message content
 * @property {string} sender - Message sender ("user" or "assistant")
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string[]} mcp_tools_used - List of MCP tools used
 */

/**
 * @typedef {Object} Conversation
 * @property {string} id - Conversation ID
 * @property {Message[]} messages - Array of messages
 * @property {string} created_at - ISO 8601 timestamp
 * @property {string} updated_at - ISO 8601 timestamp
 */

/**
 * @typedef {Object} HealthResponse
 * @property {string} status - Health status ("ok" or "error")
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {Object} [details] - Additional health details
 */

/**
 * @typedef {Object} APIErrorResponse
 * @property {Object} error - Error details
 * @property {string} error.code - Error code
 * @property {string} error.message - Error message
 * @property {Object} [error.details] - Additional error details
 */

/**
 * @typedef {Object} MCPToolCall
 * @property {string} server_name - MCP server name
 * @property {string} tool_name - Tool name
 * @property {Object} parameters - Tool parameters
 * @property {*} result - Tool result
 * @property {number} execution_time - Execution time in seconds
 */

export {}