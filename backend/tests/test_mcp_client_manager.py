"""
Unit tests for MCP Client Manager
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any

from backend.models.mcp import MCPServerConfig, MCPToolCall
from backend.services.mcp_client_manager import MCPClientManager, MCPClientManagerError
from backend.services.mcp_config_manager import MCPConfigManager
from backend.services.mcp_client import MCPProtocolClient


@pytest.fixture
def sample_server_configs():
    """Sample server configurations for testing"""
    return {
        "weather-server": MCPServerConfig(
            name="weather-server",
            endpoint="http://localhost:8001",
            authentication={"api_key": "weather-key"},
            available_tools=["get_weather", "get_forecast"],
            enabled=True,
            timeout=30
        ),
        "calc-server": MCPServerConfig(
            name="calc-server",
            endpoint="ws://localhost:8002",
            authentication={},
            available_tools=["calculate", "convert_units"],
            enabled=True,
            timeout=15
        ),
        "disabled-server": MCPServerConfig(
            name="disabled-server",
            endpoint="http://localhost:8003",
            authentication={},
            available_tools=[],
            enabled=False,
            timeout=30
        )
    }


@pytest.fixture
def mock_config_manager(sample_server_configs):
    """Mock configuration manager"""
    config_manager = MagicMock(spec=MCPConfigManager)
    config_manager.get_enabled_servers.return_value = {
        name: config for name, config in sample_server_configs.items()
        if config.enabled
    }
    config_manager.get_all_servers.return_value = sample_server_configs
    config_manager.load_configuration = MagicMock()
    return config_manager


@pytest.fixture
def sample_tools():
    """Sample tool definitions"""
    return {
        "weather-server": [
            {
                "name": "get_weather",
                "description": "Get current weather for a location",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "units": {"type": "string"}
                    },
                    "required": ["location"]
                }
            },
            {
                "name": "get_forecast",
                "description": "Get weather forecast",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "days": {"type": "integer"}
                    },
                    "required": ["location"]
                }
            }
        ],
        "calc-server": [
            {
                "name": "calculate",
                "description": "Perform mathematical calculations",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "expression": {"type": "string"}
                    },
                    "required": ["expression"]
                }
            },
            {
                "name": "convert_units",
                "description": "Convert between different units",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "value": {"type": "number"},
                        "from_unit": {"type": "string"},
                        "to_unit": {"type": "string"}
                    },
                    "required": ["value", "from_unit", "to_unit"]
                }
            }
        ]
    }


@pytest.fixture
def mock_client_factory(sample_tools):
    """Factory for creating mock MCP clients"""
    def create_mock_client(server_name: str, should_connect: bool = True):
        client = AsyncMock(spec=MCPProtocolClient)
        client.connect.return_value = should_connect
        client.disconnect = AsyncMock()
        client.health_check.return_value = should_connect
        client.get_available_tools.return_value = sample_tools.get(server_name, [])
        client.list_tools = AsyncMock(return_value=sample_tools.get(server_name, []))
        
        # Mock successful tool call
        async def mock_call_tool(tool_name: str, parameters: Dict[str, Any]) -> MCPToolCall:
            tool_call = MCPToolCall(
                server_name=server_name,
                tool_name=tool_name,
                parameters=parameters
            )
            tool_call.mark_success({"result": f"Mock result for {tool_name}"}, 0.5)
            return tool_call
        
        client.call_tool = mock_call_tool
        return client
    
    return create_mock_client


class TestMCPClientManager:
    """Test cases for MCPClientManager"""
    
    def test_init(self):
        """Test manager initialization"""
        manager = MCPClientManager()
        
        assert manager.config_manager is not None
        assert manager.clients == {}
        assert manager.connected_servers == set()
        assert manager.available_tools == {}
    
    def test_init_with_config_manager(self, mock_config_manager):
        """Test manager initialization with custom config manager"""
        manager = MCPClientManager(mock_config_manager)
        
        assert manager.config_manager == mock_config_manager
    
    @pytest.mark.asyncio
    async def test_initialize_success(self, mock_config_manager, mock_client_factory):
        """Test successful initialization"""
        manager = MCPClientManager(mock_config_manager)
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.initialize()
            
            mock_config_manager.load_configuration.assert_called_once()
            assert len(manager.connected_servers) == 2  # Only enabled servers
            assert "weather-server" in manager.connected_servers
            assert "calc-server" in manager.connected_servers
            assert "disabled-server" not in manager.connected_servers
    
    @pytest.mark.asyncio
    async def test_initialize_with_config_file(self, mock_config_manager, mock_client_factory):
        """Test initialization with specific config file"""
        manager = MCPClientManager(mock_config_manager)
        config_file = "custom_config.json"
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.initialize(config_file)
            
            mock_config_manager.load_configuration.assert_called_once_with(config_file)
    
    @pytest.mark.asyncio
    async def test_initialize_failure(self, mock_config_manager):
        """Test initialization failure"""
        manager = MCPClientManager(mock_config_manager)
        mock_config_manager.load_configuration.side_effect = Exception("Config load failed")
        
        with pytest.raises(MCPClientManagerError, match="Failed to initialize"):
            await manager.initialize()
    
    @pytest.mark.asyncio
    async def test_connect_to_servers_success(self, mock_config_manager, mock_client_factory):
        """Test successful server connections"""
        manager = MCPClientManager(mock_config_manager)
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.connect_to_servers()
            
            assert len(manager.connected_servers) == 2
            assert len(manager.clients) == 2
            assert len(manager.available_tools) == 2
    
    @pytest.mark.asyncio
    async def test_connect_to_servers_partial_failure(self, mock_config_manager, mock_client_factory):
        """Test server connections with partial failures"""
        manager = MCPClientManager(mock_config_manager)
        
        def create_client_with_failure(config):
            # Weather server fails, calc server succeeds
            should_connect = config.name != "weather-server"
            return mock_client_factory(config.name, should_connect)
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = create_client_with_failure
            
            await manager.connect_to_servers()
            
            assert len(manager.connected_servers) == 1
            assert "calc-server" in manager.connected_servers
            assert "weather-server" not in manager.connected_servers
    
    @pytest.mark.asyncio
    async def test_connect_to_servers_no_enabled(self, mock_config_manager):
        """Test connecting when no servers are enabled"""
        mock_config_manager.get_enabled_servers.return_value = {}
        manager = MCPClientManager(mock_config_manager)
        
        await manager.connect_to_servers()
        
        assert len(manager.connected_servers) == 0
        assert len(manager.clients) == 0
    
    @pytest.mark.asyncio
    async def test_disconnect_from_servers(self, mock_config_manager, mock_client_factory):
        """Test disconnecting from all servers"""
        manager = MCPClientManager(mock_config_manager)
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.connect_to_servers()
            assert len(manager.connected_servers) == 2
            
            await manager.disconnect_from_servers()
            
            assert len(manager.connected_servers) == 0
            assert len(manager.clients) == 0
            assert len(manager.available_tools) == 0
    
    @pytest.mark.asyncio
    async def test_reconnect_server_success(self, mock_config_manager, mock_client_factory):
        """Test successful server reconnection"""
        manager = MCPClientManager(mock_config_manager)
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.connect_to_servers()
            
            # Simulate disconnection
            manager.connected_servers.discard("weather-server")
            manager.available_tools.pop("weather-server", None)
            
            # Reconnect
            success = await manager.reconnect_server("weather-server")
            
            assert success is True
            assert "weather-server" in manager.connected_servers
            assert "weather-server" in manager.available_tools
    
    @pytest.mark.asyncio
    async def test_reconnect_server_not_found(self, mock_config_manager):
        """Test reconnecting to non-existent server"""
        manager = MCPClientManager(mock_config_manager)
        
        success = await manager.reconnect_server("nonexistent-server")
        
        assert success is False
    
    @pytest.mark.asyncio
    async def test_health_check_servers(self, mock_config_manager, mock_client_factory):
        """Test health checking all servers"""
        manager = MCPClientManager(mock_config_manager)
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.connect_to_servers()
            
            health_results = await manager.health_check_servers()
            
            assert len(health_results) == 2
            assert health_results["weather-server"] is True
            assert health_results["calc-server"] is True
    
    @pytest.mark.asyncio
    async def test_health_check_servers_with_failure(self, mock_config_manager, mock_client_factory):
        """Test health checking with server failure"""
        manager = MCPClientManager(mock_config_manager)
        
        def create_client_with_health_failure(config):
            client = mock_client_factory(config.name, True)
            # Weather server fails health check
            if config.name == "weather-server":
                client.health_check.return_value = False
            return client
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = create_client_with_health_failure
            
            await manager.connect_to_servers()
            
            health_results = await manager.health_check_servers()
            
            assert health_results["weather-server"] is False
            assert health_results["calc-server"] is True
            # Failed server should be removed from connected servers
            assert "weather-server" not in manager.connected_servers
    
    def test_get_available_tools(self, mock_config_manager, sample_tools):
        """Test getting available tools"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = sample_tools
        
        tools = manager.get_available_tools()
        
        assert len(tools) == 2
        assert "weather-server" in tools
        assert "calc-server" in tools
        # Ensure it's a copy
        tools["new-server"] = []
        assert "new-server" not in manager.available_tools
    
    def test_get_all_tools_flat(self, mock_config_manager, sample_tools):
        """Test getting all tools as flat list"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = sample_tools
        
        flat_tools = manager.get_all_tools_flat()
        
        assert len(flat_tools) == 4  # 2 tools per server
        for tool in flat_tools:
            assert "server_name" in tool
            assert tool["server_name"] in ["weather-server", "calc-server"]
    
    def test_find_tools_by_name(self, mock_config_manager, sample_tools):
        """Test finding tools by name"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = sample_tools
        
        tools = manager.find_tools_by_name("get_weather")
        
        assert len(tools) == 1
        assert tools[0]["name"] == "get_weather"
        assert tools[0]["server_name"] == "weather-server"
    
    def test_find_tools_by_name_not_found(self, mock_config_manager, sample_tools):
        """Test finding non-existent tool by name"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = sample_tools
        
        tools = manager.find_tools_by_name("nonexistent_tool")
        
        assert len(tools) == 0
    
    def test_find_tools_by_description(self, mock_config_manager, sample_tools):
        """Test finding tools by description keywords"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = sample_tools
        
        tools = manager.find_tools_by_description(["weather", "current"])
        
        assert len(tools) >= 1
        # Should find weather-related tools
        weather_tools = [t for t in tools if "weather" in t["description"].lower()]
        assert len(weather_tools) > 0
        
        # Check relevance scoring
        for tool in tools:
            assert "relevance_score" in tool
            assert tool["relevance_score"] > 0
    
    @pytest.mark.asyncio
    async def test_call_tool_success(self, mock_config_manager, mock_client_factory):
        """Test successful tool call"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = {"weather-server": [
            {
                "name": "get_weather",
                "inputSchema": {
                    "type": "object",
                    "properties": {"location": {"type": "string"}},
                    "required": ["location"]
                }
            }
        ]}
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.connect_to_servers()
            
            result = await manager.call_tool("weather-server", "get_weather", {"location": "New York"})
            
            assert result.status == "success"
            assert result.server_name == "weather-server"
            assert result.tool_name == "get_weather"
            assert result.parameters == {"location": "New York"}
    
    @pytest.mark.asyncio
    async def test_call_tool_server_not_connected(self, mock_config_manager):
        """Test tool call when server not connected"""
        manager = MCPClientManager(mock_config_manager)
        
        result = await manager.call_tool("weather-server", "get_weather", {"location": "New York"})
        
        assert result.status == "error"
        assert "not connected" in result.error.lower()
    
    @pytest.mark.asyncio
    async def test_call_tool_parameter_validation_failure(self, mock_config_manager, mock_client_factory):
        """Test tool call with invalid parameters"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = {"weather-server": [
            {
                "name": "get_weather",
                "inputSchema": {
                    "type": "object",
                    "properties": {"location": {"type": "string"}},
                    "required": ["location"]
                }
            }
        ]}
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.connect_to_servers()
            
            # Missing required parameter
            result = await manager.call_tool("weather-server", "get_weather", {})
            
            assert result.status == "error"
            assert "validation failed" in result.error.lower()
            assert "required parameter" in result.error.lower()
    
    @pytest.mark.asyncio
    async def test_call_tools_parallel(self, mock_config_manager, mock_client_factory):
        """Test parallel tool execution"""
        manager = MCPClientManager(mock_config_manager)
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.connect_to_servers()
            
            tool_calls = [
                {
                    "server_name": "weather-server",
                    "tool_name": "get_weather",
                    "parameters": {"location": "New York"}
                },
                {
                    "server_name": "calc-server",
                    "tool_name": "calculate",
                    "parameters": {"expression": "2 + 2"}
                }
            ]
            
            results = await manager.call_tools_parallel(tool_calls)
            
            assert len(results) == 2
            assert all(result.status == "success" for result in results)
            assert results[0].server_name == "weather-server"
            assert results[1].server_name == "calc-server"
    
    @pytest.mark.asyncio
    async def test_call_tools_parallel_empty_list(self, mock_config_manager):
        """Test parallel tool execution with empty list"""
        manager = MCPClientManager(mock_config_manager)
        
        results = await manager.call_tools_parallel([])
        
        assert results == []
    
    def test_validate_tool_parameters_success(self, mock_config_manager):
        """Test successful parameter validation"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = {"weather-server": [
            {
                "name": "get_weather",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "units": {"type": "string"}
                    },
                    "required": ["location"]
                }
            }
        ]}
        
        error = manager._validate_tool_parameters(
            "weather-server", 
            "get_weather", 
            {"location": "New York", "units": "metric"}
        )
        
        assert error is None
    
    def test_validate_tool_parameters_missing_required(self, mock_config_manager):
        """Test parameter validation with missing required parameter"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = {"weather-server": [
            {
                "name": "get_weather",
                "inputSchema": {
                    "type": "object",
                    "properties": {"location": {"type": "string"}},
                    "required": ["location"]
                }
            }
        ]}
        
        error = manager._validate_tool_parameters("weather-server", "get_weather", {})
        
        assert error is not None
        assert "required parameter" in error.lower()
        assert "location" in error
    
    def test_validate_tool_parameters_wrong_type(self, mock_config_manager):
        """Test parameter validation with wrong type"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = {"weather-server": [
            {
                "name": "get_weather",
                "inputSchema": {
                    "type": "object",
                    "properties": {"location": {"type": "string"}},
                    "required": ["location"]
                }
            }
        ]}
        
        error = manager._validate_tool_parameters(
            "weather-server", 
            "get_weather", 
            {"location": 123}  # Should be string
        )
        
        assert error is not None
        assert "invalid type" in error.lower()
    
    def test_validate_tool_parameters_tool_not_found(self, mock_config_manager):
        """Test parameter validation for non-existent tool"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = {"weather-server": []}
        
        error = manager._validate_tool_parameters(
            "weather-server", 
            "nonexistent_tool", 
            {}
        )
        
        assert error is not None
        assert "not found" in error.lower()
    
    def test_validate_parameter_type(self, mock_config_manager):
        """Test parameter type validation"""
        manager = MCPClientManager(mock_config_manager)
        
        assert manager._validate_parameter_type("hello", "string") is True
        assert manager._validate_parameter_type(123, "integer") is True
        assert manager._validate_parameter_type(123.45, "number") is True
        assert manager._validate_parameter_type(True, "boolean") is True
        assert manager._validate_parameter_type([], "array") is True
        assert manager._validate_parameter_type({}, "object") is True
        
        assert manager._validate_parameter_type(123, "string") is False
        assert manager._validate_parameter_type("hello", "integer") is False
    
    def test_select_tools_for_query(self, mock_config_manager, sample_tools):
        """Test tool selection for query"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = sample_tools
        
        tools = manager.select_tools_for_query("get current weather forecast")
        
        assert len(tools) > 0
        # Should prioritize weather-related tools
        weather_tools = [t for t in tools if "weather" in t["description"].lower()]
        assert len(weather_tools) > 0
    
    def test_select_tools_for_query_empty(self, mock_config_manager, sample_tools):
        """Test tool selection with empty query"""
        manager = MCPClientManager(mock_config_manager)
        manager.available_tools = sample_tools
        
        tools = manager.select_tools_for_query("")
        
        assert len(tools) == 0
    
    def test_get_server_status(self, mock_config_manager, sample_server_configs, sample_tools):
        """Test getting server status"""
        manager = MCPClientManager(mock_config_manager)
        manager.connected_servers = {"weather-server", "calc-server"}
        manager.available_tools = sample_tools
        
        status = manager.get_server_status()
        
        assert len(status) == 3  # All servers including disabled
        assert status["weather-server"]["connected"] is True
        assert status["weather-server"]["enabled"] is True
        assert status["weather-server"]["tool_count"] == 2
        assert status["disabled-server"]["connected"] is False
        assert status["disabled-server"]["enabled"] is False
    
    @pytest.mark.asyncio
    async def test_refresh_server_tools(self, mock_config_manager, mock_client_factory):
        """Test refreshing server tools"""
        manager = MCPClientManager(mock_config_manager)
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.connect_to_servers()
            
            success = await manager.refresh_server_tools("weather-server")
            
            assert success is True
    
    @pytest.mark.asyncio
    async def test_refresh_server_tools_not_connected(self, mock_config_manager):
        """Test refreshing tools for non-connected server"""
        manager = MCPClientManager(mock_config_manager)
        
        success = await manager.refresh_server_tools("weather-server")
        
        assert success is False
    
    @pytest.mark.asyncio
    async def test_shutdown(self, mock_config_manager, mock_client_factory):
        """Test manager shutdown"""
        manager = MCPClientManager(mock_config_manager)
        
        with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
            mock_client_class.side_effect = lambda config: mock_client_factory(config.name, True)
            
            await manager.connect_to_servers()
            assert len(manager.connected_servers) > 0
            
            await manager.shutdown()
            
            assert len(manager.connected_servers) == 0
            assert len(manager.clients) == 0
    
    def test_str_representation(self, mock_config_manager, sample_tools):
        """Test string representation"""
        manager = MCPClientManager(mock_config_manager)
        manager.connected_servers = {"weather-server", "calc-server"}
        manager.available_tools = sample_tools
        
        str_repr = str(manager)
        
        assert "2/3 servers connected" in str_repr
        assert "4 tools available" in str_repr
    
    def test_repr_representation(self, mock_config_manager):
        """Test repr representation"""
        manager = MCPClientManager(mock_config_manager)
        manager.clients = {"server1": None, "server2": None}
        manager.connected_servers = {"server1"}
        
        repr_str = repr(manager)
        
        assert "servers=2" in repr_str
        assert "connected=1" in repr_str