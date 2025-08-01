"""
MCP Protocol Client for communicating with MCP servers using JSON-RPC
"""

import asyncio
import json
import logging
import time
from typing import Dict, List, Any, Optional, Union
from urllib.parse import urlparse
import aiohttp
import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

from models.mcp import MCPServerConfig, MCPToolCall

logger = logging.getLogger(__name__)


class MCPConnectionError(Exception):
    """Raised when MCP server connection fails"""
    pass


class MCPProtocolError(Exception):
    """Raised when MCP protocol communication fails"""
    pass


class MCPTimeoutError(Exception):
    """Raised when MCP server request times out"""
    pass


class MCPProtocolClient:
    """
    MCP Protocol Client for JSON-RPC communication with MCP servers
    Supports both HTTP and WebSocket connections
    """
    
    def __init__(self, config: MCPServerConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.connection_type: Optional[str] = None
        self.is_connected = False
        self.available_tools: List[Dict[str, Any]] = []
        self.server_info: Dict[str, Any] = {}
        self._request_id_counter = 0
        
    async def connect(self) -> bool:
        """
        Establish connection to MCP server
        Returns True if connection successful, False otherwise
        """
        try:
            parsed_url = urlparse(self.config.endpoint)
            
            if parsed_url.scheme in ['ws', 'wss']:
                await self._connect_websocket()
            elif parsed_url.scheme in ['http', 'https']:
                await self._connect_http()
            else:
                raise MCPConnectionError(f"Unsupported protocol: {parsed_url.scheme}")
            
            # Perform handshake and initialize connection
            await self._initialize_connection()
            self.is_connected = True
            logger.info(f"Successfully connected to MCP server: {self.config.name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to MCP server {self.config.name}: {str(e)}")
            self.is_connected = False
            return False
    
    async def _connect_websocket(self) -> None:
        """Establish WebSocket connection"""
        try:
            extra_headers = {}
            if self.config.authentication:
                # Add authentication headers if configured
                if 'api_key' in self.config.authentication:
                    extra_headers['Authorization'] = f"Bearer {self.config.authentication['api_key']}"
            
            self.websocket = await websockets.connect(
                self.config.endpoint,
                extra_headers=extra_headers,
                timeout=self.config.timeout
            )
            self.connection_type = "websocket"
            
        except Exception as e:
            raise MCPConnectionError(f"WebSocket connection failed: {str(e)}")
    
    async def _connect_http(self) -> None:
        """Establish HTTP session"""
        try:
            timeout = aiohttp.ClientTimeout(total=self.config.timeout)
            headers = {}
            
            if self.config.authentication:
                if 'api_key' in self.config.authentication:
                    headers['Authorization'] = f"Bearer {self.config.authentication['api_key']}"
            
            self.session = aiohttp.ClientSession(
                timeout=timeout,
                headers=headers
            )
            self.connection_type = "http"
            
        except Exception as e:
            raise MCPConnectionError(f"HTTP session creation failed: {str(e)}")
    
    async def _initialize_connection(self) -> None:
        """Initialize connection with handshake and capability discovery"""
        try:
            # Send initialize request
            init_response = await self._send_request("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "clientInfo": {
                    "name": "mcp-chatbot-client",
                    "version": "1.0.0"
                }
            })
            
            if init_response.get("error"):
                raise MCPProtocolError(f"Initialize failed: {init_response['error']}")
            
            self.server_info = init_response.get("result", {})
            
            # Send initialized notification
            await self._send_notification("notifications/initialized")
            
            # Discover available tools
            await self._discover_tools()
            
        except Exception as e:
            raise MCPProtocolError(f"Connection initialization failed: {str(e)}")
    
    async def _discover_tools(self) -> None:
        """Discover available tools from the MCP server"""
        try:
            tools_response = await self._send_request("tools/list", {})
            
            if tools_response.get("error"):
                logger.warning(f"Tool discovery failed for {self.config.name}: {tools_response['error']}")
                return
            
            tools_result = tools_response.get("result", {})
            self.available_tools = tools_result.get("tools", [])
            
            # Update config with discovered tools
            tool_names = [tool.get("name") for tool in self.available_tools if tool.get("name")]
            self.config.available_tools = tool_names
            
            logger.info(f"Discovered {len(self.available_tools)} tools for {self.config.name}: {tool_names}")
            
        except Exception as e:
            logger.error(f"Tool discovery failed for {self.config.name}: {str(e)}")
    
    async def disconnect(self) -> None:
        """Close connection to MCP server"""
        try:
            if self.websocket:
                await self.websocket.close()
                self.websocket = None
            
            if self.session:
                await self.session.close()
                self.session = None
            
            self.is_connected = False
            self.connection_type = None
            logger.info(f"Disconnected from MCP server: {self.config.name}")
            
        except Exception as e:
            logger.error(f"Error disconnecting from {self.config.name}: {str(e)}")
    
    async def health_check(self) -> bool:
        """
        Check if the MCP server is healthy and responsive
        Returns True if healthy, False otherwise
        """
        if not self.is_connected:
            return False
        
        try:
            # Send a simple ping request
            response = await self._send_request("ping", {}, timeout=5)
            return not response.get("error")
            
        except Exception as e:
            logger.warning(f"Health check failed for {self.config.name}: {str(e)}")
            return False
    
    async def list_tools(self) -> List[Dict[str, Any]]:
        """
        Get list of available tools from the MCP server
        Returns list of tool definitions
        """
        if not self.is_connected:
            raise MCPConnectionError(f"Not connected to server: {self.config.name}")
        
        try:
            response = await self._send_request("tools/list", {})
            
            if response.get("error"):
                raise MCPProtocolError(f"Failed to list tools: {response['error']}")
            
            result = response.get("result", {})
            return result.get("tools", [])
            
        except Exception as e:
            logger.error(f"Failed to list tools for {self.config.name}: {str(e)}")
            raise
    
    async def call_tool(self, tool_name: str, parameters: Dict[str, Any]) -> MCPToolCall:
        """
        Call a tool on the MCP server
        Returns MCPToolCall with result or error
        """
        tool_call = MCPToolCall(
            server_name=self.config.name,
            tool_name=tool_name,
            parameters=parameters
        )
        
        if not self.is_connected:
            tool_call.mark_error("Not connected to MCP server")
            return tool_call
        
        start_time = time.time()
        
        try:
            response = await self._send_request("tools/call", {
                "name": tool_name,
                "arguments": parameters
            })
            
            execution_time = time.time() - start_time
            
            if response.get("error"):
                tool_call.mark_error(str(response["error"]), execution_time)
            else:
                result = response.get("result", {})
                tool_call.mark_success(result, execution_time)
            
            return tool_call
            
        except MCPTimeoutError:
            execution_time = time.time() - start_time
            tool_call.mark_timeout(execution_time)
            return tool_call
            
        except asyncio.TimeoutError:
            execution_time = time.time() - start_time
            tool_call.mark_timeout(execution_time)
            return tool_call
            
        except Exception as e:
            execution_time = time.time() - start_time
            tool_call.mark_error(str(e), execution_time)
            return tool_call
    
    def _get_next_request_id(self) -> str:
        """Generate next request ID"""
        self._request_id_counter += 1
        return f"{self.config.name}-{self._request_id_counter}"
    
    async def _send_request(self, method: str, params: Dict[str, Any], timeout: Optional[int] = None) -> Dict[str, Any]:
        """
        Send JSON-RPC request to MCP server
        Returns response dictionary
        """
        request_id = self._get_next_request_id()
        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params
        }
        
        timeout = timeout or self.config.timeout
        
        try:
            if self.connection_type == "websocket":
                return await self._send_websocket_request(request, timeout)
            elif self.connection_type == "http":
                return await self._send_http_request(request, timeout)
            else:
                raise MCPProtocolError("No active connection")
                
        except asyncio.TimeoutError:
            raise MCPTimeoutError(f"Request timed out after {timeout} seconds")
    
    async def _send_notification(self, method: str, params: Optional[Dict[str, Any]] = None) -> None:
        """Send JSON-RPC notification (no response expected)"""
        notification = {
            "jsonrpc": "2.0",
            "method": method
        }
        
        if params:
            notification["params"] = params
        
        try:
            if self.connection_type == "websocket" and self.websocket:
                await self.websocket.send(json.dumps(notification))
            elif self.connection_type == "http" and self.session:
                # For HTTP, notifications are typically sent as POST requests
                async with self.session.post(
                    self.config.endpoint,
                    json=notification
                ) as response:
                    # Don't wait for response for notifications
                    pass
                    
        except Exception as e:
            logger.warning(f"Failed to send notification to {self.config.name}: {str(e)}")
    
    async def _send_websocket_request(self, request: Dict[str, Any], timeout: int) -> Dict[str, Any]:
        """Send request via WebSocket"""
        if not self.websocket:
            raise MCPConnectionError("WebSocket not connected")
        
        try:
            await asyncio.wait_for(
                self.websocket.send(json.dumps(request)),
                timeout=timeout
            )
            
            response_str = await asyncio.wait_for(
                self.websocket.recv(),
                timeout=timeout
            )
            
            return json.loads(response_str)
            
        except (ConnectionClosed, WebSocketException) as e:
            self.is_connected = False
            raise MCPConnectionError(f"WebSocket connection lost: {str(e)}")
        except json.JSONDecodeError as e:
            raise MCPProtocolError(f"Invalid JSON response: {str(e)}")
    
    async def _send_http_request(self, request: Dict[str, Any], timeout: int) -> Dict[str, Any]:
        """Send request via HTTP"""
        if not self.session:
            raise MCPConnectionError("HTTP session not available")
        
        try:
            async with self.session.post(
                self.config.endpoint,
                json=request,
                timeout=aiohttp.ClientTimeout(total=timeout)
            ) as response:
                response.raise_for_status()
                return await response.json()
                
        except aiohttp.ClientError as e:
            raise MCPConnectionError(f"HTTP request failed: {str(e)}")
        except json.JSONDecodeError as e:
            raise MCPProtocolError(f"Invalid JSON response: {str(e)}")
    
    def get_server_info(self) -> Dict[str, Any]:
        """Get server information from initialization"""
        return self.server_info.copy()
    
    def get_available_tools(self) -> List[Dict[str, Any]]:
        """Get list of available tools"""
        return self.available_tools.copy()
    
    def __str__(self) -> str:
        return f"MCPProtocolClient({self.config.name}, {self.config.endpoint}, connected={self.is_connected})"