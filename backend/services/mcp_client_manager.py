"""
MCP Client Manager
Coordinates multiple MCP clients and provides tool execution system
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any, Set
from concurrent.futures import ThreadPoolExecutor
import time

from models.mcp import MCPServerConfig, MCPToolCall
from services.mcp_client import MCPProtocolClient, MCPConnectionError, MCPProtocolError
from services.mcp_config_manager import MCPConfigManager, MCPConfigurationError

logger = logging.getLogger(__name__)


class MCPClientManagerError(Exception):
    """Raised when MCP client manager operations fail"""
    pass


class MCPClientManager:
    """
    Manages multiple MCP clients and provides tool execution system
    Handles connection management, tool discovery, and parallel tool execution
    """
    
    def __init__(self, config_manager: Optional[MCPConfigManager] = None):
        self.config_manager = config_manager or MCPConfigManager()
        self.clients: Dict[str, MCPProtocolClient] = {}
        self.connected_servers: Set[str] = set()
        self.available_tools: Dict[str, List[Dict[str, Any]]] = {}
        self._connection_lock = asyncio.Lock()
        self._executor = ThreadPoolExecutor(max_workers=10)
        
    async def initialize(self, config_file_path: Optional[str] = None) -> None:
        """
        Initialize the MCP client manager
        
        Args:
            config_file_path: Optional path to configuration file
            
        Raises:
            MCPClientManagerError: If initialization fails
        """
        try:
            # Load configuration
            self.config_manager.load_configuration(config_file_path)
            
            # Connect to enabled servers
            await self.connect_to_servers()
            
            logger.info(f"MCP Client Manager initialized with {len(self.connected_servers)} connected servers")
            
        except Exception as e:
            raise MCPClientManagerError(f"Failed to initialize MCP client manager: {str(e)}")
    
    async def connect_to_servers(self) -> None:
        """Connect to all enabled MCP servers"""
        enabled_servers = self.config_manager.get_enabled_servers()
        
        if not enabled_servers:
            logger.info("No enabled MCP servers found")
            return
        
        async with self._connection_lock:
            # Create connection tasks for all enabled servers
            connection_tasks = []
            for server_name, server_config in enabled_servers.items():
                if server_name not in self.clients:
                    client = MCPProtocolClient(server_config)
                    self.clients[server_name] = client
                    connection_tasks.append(self._connect_single_server(server_name, client))
            
            # Execute connections in parallel
            if connection_tasks:
                await asyncio.gather(*connection_tasks, return_exceptions=True)
    
    async def _connect_single_server(self, server_name: str, client: MCPProtocolClient) -> None:
        """Connect to a single MCP server"""
        try:
            success = await client.connect()
            if success:
                self.connected_servers.add(server_name)
                # Store available tools for this server
                self.available_tools[server_name] = client.get_available_tools()
                logger.info(f"Connected to MCP server: {server_name}")
            else:
                logger.warning(f"Failed to connect to MCP server: {server_name}")
                
        except Exception as e:
            logger.error(f"Error connecting to MCP server {server_name}: {str(e)}")
    
    async def disconnect_from_servers(self) -> None:
        """Disconnect from all MCP servers"""
        async with self._connection_lock:
            disconnect_tasks = []
            for server_name, client in self.clients.items():
                if server_name in self.connected_servers:
                    disconnect_tasks.append(client.disconnect())
            
            if disconnect_tasks:
                await asyncio.gather(*disconnect_tasks, return_exceptions=True)
            
            self.connected_servers.clear()
            self.available_tools.clear()
            self.clients.clear()
            
            logger.info("Disconnected from all MCP servers")
    
    async def reconnect_server(self, server_name: str) -> bool:
        """
        Reconnect to a specific MCP server
        
        Args:
            server_name: Name of server to reconnect
            
        Returns:
            True if reconnection successful, False otherwise
        """
        if server_name not in self.clients:
            logger.warning(f"Server {server_name} not found in clients")
            return False
        
        try:
            client = self.clients[server_name]
            
            # Disconnect if currently connected
            if server_name in self.connected_servers:
                await client.disconnect()
                self.connected_servers.discard(server_name)
                self.available_tools.pop(server_name, None)
            
            # Attempt reconnection
            success = await client.connect()
            if success:
                self.connected_servers.add(server_name)
                self.available_tools[server_name] = client.get_available_tools()
                logger.info(f"Reconnected to MCP server: {server_name}")
                return True
            else:
                logger.warning(f"Failed to reconnect to MCP server: {server_name}")
                return False
                
        except Exception as e:
            logger.error(f"Error reconnecting to MCP server {server_name}: {str(e)}")
            return False
    
    async def health_check_servers(self) -> Dict[str, bool]:
        """
        Perform health check on all connected servers
        
        Returns:
            Dictionary mapping server names to health status
        """
        health_results = {}
        
        if not self.connected_servers:
            return health_results
        
        # Create health check tasks
        health_tasks = []
        server_names = list(self.connected_servers)
        
        for server_name in server_names:
            client = self.clients.get(server_name)
            if client:
                health_tasks.append(self._health_check_single_server(server_name, client))
        
        # Execute health checks in parallel
        if health_tasks:
            results = await asyncio.gather(*health_tasks, return_exceptions=True)
            
            for i, result in enumerate(results):
                server_name = server_names[i]
                if isinstance(result, Exception):
                    health_results[server_name] = False
                    logger.error(f"Health check failed for {server_name}: {str(result)}")
                else:
                    health_results[server_name] = result
        
        return health_results
    
    async def _health_check_single_server(self, server_name: str, client: MCPProtocolClient) -> bool:
        """Perform health check on a single server"""
        try:
            is_healthy = await client.health_check()
            if not is_healthy:
                # Remove from connected servers if unhealthy
                self.connected_servers.discard(server_name)
                self.available_tools.pop(server_name, None)
                logger.warning(f"Server {server_name} failed health check")
            return is_healthy
        except Exception as e:
            logger.error(f"Health check error for {server_name}: {str(e)}")
            return False
    
    def get_available_tools(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get all available tools from connected servers
        
        Returns:
            Dictionary mapping server names to their available tools
        """
        return self.available_tools.copy()
    
    def get_all_tools_flat(self) -> List[Dict[str, Any]]:
        """
        Get all available tools as a flat list with server information
        
        Returns:
            List of tool definitions with server_name added
        """
        all_tools = []
        for server_name, tools in self.available_tools.items():
            for tool in tools:
                tool_with_server = tool.copy()
                tool_with_server['server_name'] = server_name
                all_tools.append(tool_with_server)
        return all_tools
    
    def find_tools_by_name(self, tool_name: str) -> List[Dict[str, Any]]:
        """
        Find tools by name across all servers
        
        Args:
            tool_name: Name of tool to find
            
        Returns:
            List of matching tools with server information
        """
        matching_tools = []
        for server_name, tools in self.available_tools.items():
            for tool in tools:
                if tool.get('name') == tool_name:
                    tool_with_server = tool.copy()
                    tool_with_server['server_name'] = server_name
                    matching_tools.append(tool_with_server)
        return matching_tools
    
    def find_tools_by_description(self, keywords: List[str]) -> List[Dict[str, Any]]:
        """
        Find tools by keywords in their description
        
        Args:
            keywords: List of keywords to search for
            
        Returns:
            List of matching tools with server information and relevance score
        """
        matching_tools = []
        
        for server_name, tools in self.available_tools.items():
            for tool in tools:
                description = tool.get('description', '').lower()
                tool_name = tool.get('name', '').lower()
                
                # Calculate relevance score
                score = 0
                for keyword in keywords:
                    keyword_lower = keyword.lower()
                    if keyword_lower in tool_name:
                        score += 3  # Higher weight for name matches
                    if keyword_lower in description:
                        score += 1
                
                if score > 0:
                    tool_with_server = tool.copy()
                    tool_with_server['server_name'] = server_name
                    tool_with_server['relevance_score'] = score
                    matching_tools.append(tool_with_server)
        
        # Sort by relevance score (descending)
        matching_tools.sort(key=lambda x: x.get('relevance_score', 0), reverse=True)
        return matching_tools
    
    async def call_tool(self, server_name: str, tool_name: str, parameters: Dict[str, Any]) -> MCPToolCall:
        """
        Call a tool on a specific MCP server
        
        Args:
            server_name: Name of the MCP server
            tool_name: Name of the tool to call
            parameters: Parameters to pass to the tool
            
        Returns:
            MCPToolCall with result or error
        """
        if server_name not in self.connected_servers:
            tool_call = MCPToolCall(
                server_name=server_name,
                tool_name=tool_name,
                parameters=parameters
            )
            tool_call.mark_error(f"Server '{server_name}' is not connected")
            return tool_call
        
        client = self.clients.get(server_name)
        if not client:
            tool_call = MCPToolCall(
                server_name=server_name,
                tool_name=tool_name,
                parameters=parameters
            )
            tool_call.mark_error(f"Client for server '{server_name}' not found")
            return tool_call
        
        # Validate parameters if tool schema is available
        validation_error = self._validate_tool_parameters(server_name, tool_name, parameters)
        if validation_error:
            tool_call = MCPToolCall(
                server_name=server_name,
                tool_name=tool_name,
                parameters=parameters
            )
            tool_call.mark_error(f"Parameter validation failed: {validation_error}")
            return tool_call
        
        return await client.call_tool(tool_name, parameters)
    
    async def call_tools_parallel(self, tool_calls: List[Dict[str, Any]]) -> List[MCPToolCall]:
        """
        Execute multiple tool calls in parallel
        
        Args:
            tool_calls: List of tool call specifications with keys:
                       - server_name: str
                       - tool_name: str  
                       - parameters: Dict[str, Any]
        
        Returns:
            List of MCPToolCall results in the same order as input
        """
        if not tool_calls:
            return []
        
        # Create tasks for parallel execution
        tasks = []
        for call_spec in tool_calls:
            server_name = call_spec.get('server_name')
            tool_name = call_spec.get('tool_name')
            parameters = call_spec.get('parameters', {})
            
            task = self.call_tool(server_name, tool_name, parameters)
            tasks.append(task)
        
        # Execute all tool calls in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Convert exceptions to error tool calls
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                call_spec = tool_calls[i]
                error_call = MCPToolCall(
                    server_name=call_spec.get('server_name', 'unknown'),
                    tool_name=call_spec.get('tool_name', 'unknown'),
                    parameters=call_spec.get('parameters', {})
                )
                error_call.mark_error(f"Tool call failed: {str(result)}")
                final_results.append(error_call)
            else:
                final_results.append(result)
        
        return final_results
    
    def _validate_tool_parameters(self, server_name: str, tool_name: str, parameters: Dict[str, Any]) -> Optional[str]:
        """
        Validate tool parameters against tool schema
        
        Args:
            server_name: Name of the MCP server
            tool_name: Name of the tool
            parameters: Parameters to validate
            
        Returns:
            Error message if validation fails, None if valid
        """
        server_tools = self.available_tools.get(server_name, [])
        
        # Find the tool definition
        tool_def = None
        for tool in server_tools:
            if tool.get('name') == tool_name:
                tool_def = tool
                break
        
        if not tool_def:
            return f"Tool '{tool_name}' not found on server '{server_name}'"
        
        # Get input schema
        input_schema = tool_def.get('inputSchema', {})
        if not input_schema:
            return None  # No schema to validate against
        
        # Basic validation - check required properties
        schema_properties = input_schema.get('properties', {})
        required_props = input_schema.get('required', [])
        
        # Check required parameters
        for required_prop in required_props:
            if required_prop not in parameters:
                return f"Required parameter '{required_prop}' is missing"
        
        # Check parameter types (basic validation)
        for param_name, param_value in parameters.items():
            if param_name in schema_properties:
                expected_type = schema_properties[param_name].get('type')
                if expected_type and not self._validate_parameter_type(param_value, expected_type):
                    return f"Parameter '{param_name}' has invalid type. Expected: {expected_type}"
        
        return None
    
    def _validate_parameter_type(self, value: Any, expected_type: str) -> bool:
        """Validate parameter type against JSON schema type"""
        type_mapping = {
            'string': str,
            'number': (int, float),
            'integer': int,
            'boolean': bool,
            'array': list,
            'object': dict
        }
        
        expected_python_type = type_mapping.get(expected_type)
        if expected_python_type is None:
            return True  # Unknown type, skip validation
        
        return isinstance(value, expected_python_type)
    
    def select_tools_for_query(self, query: str, max_tools: int = 5) -> List[Dict[str, Any]]:
        """
        Select relevant tools for a given query using simple keyword matching
        
        Args:
            query: User query to find tools for
            max_tools: Maximum number of tools to return
            
        Returns:
            List of relevant tools with server information
        """
        # Extract keywords from query (simple approach)
        keywords = [word.lower().strip() for word in query.split() if len(word.strip()) > 2]
        
        if not keywords:
            return []
        
        # Find tools by description keywords
        relevant_tools = self.find_tools_by_description(keywords)
        
        # Return top tools up to max_tools limit
        return relevant_tools[:max_tools]
    
    def get_server_status(self) -> Dict[str, Dict[str, Any]]:
        """
        Get status information for all servers
        
        Returns:
            Dictionary with server status information
        """
        status = {}
        
        for server_name, server_config in self.config_manager.get_all_servers().items():
            is_connected = server_name in self.connected_servers
            tool_count = len(self.available_tools.get(server_name, []))
            
            status[server_name] = {
                'enabled': server_config.enabled,
                'connected': is_connected,
                'endpoint': server_config.endpoint,
                'tool_count': tool_count,
                'tools': [tool.get('name') for tool in self.available_tools.get(server_name, [])]
            }
        
        return status
    
    async def refresh_server_tools(self, server_name: str) -> bool:
        """
        Refresh tool list for a specific server
        
        Args:
            server_name: Name of server to refresh
            
        Returns:
            True if refresh successful, False otherwise
        """
        if server_name not in self.connected_servers:
            return False
        
        client = self.clients.get(server_name)
        if not client:
            return False
        
        try:
            tools = await client.list_tools()
            self.available_tools[server_name] = tools
            logger.info(f"Refreshed tools for server {server_name}: {len(tools)} tools")
            return True
        except Exception as e:
            logger.error(f"Failed to refresh tools for server {server_name}: {str(e)}")
            return False
    
    async def shutdown(self) -> None:
        """Shutdown the MCP client manager"""
        await self.disconnect_from_servers()
        self._executor.shutdown(wait=True)
        logger.info("MCP Client Manager shutdown complete")
    
    def __str__(self) -> str:
        connected_count = len(self.connected_servers)
        total_count = len(self.config_manager.get_all_servers())
        tool_count = sum(len(tools) for tools in self.available_tools.values())
        return f"MCPClientManager({connected_count}/{total_count} servers connected, {tool_count} tools available)"
    
    def __repr__(self) -> str:
        return f"MCPClientManager(servers={len(self.clients)}, connected={len(self.connected_servers)})"