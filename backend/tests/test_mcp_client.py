"""
Unit tests for MCP Protocol Client
"""

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import aiohttp
from aioresponses import aioresponses

from backend.models.mcp import MCPServerConfig, MCPToolCall
from backend.services.mcp_client import (
    MCPProtocolClient,
    MCPConnectionError,
    MCPProtocolError,
    MCPTimeoutError
)


@pytest.fixture
def sample_config():
    """Sample MCP server configuration for testing"""
    return MCPServerConfig(
        name="test-server",
        endpoint="http://localhost:8001",
        authentication={"api_key": "test-key"},
        enabled=True,
        timeout=10,
        max_retries=2
    )


@pytest.fixture
def websocket_config():
    """WebSocket MCP server configuration for testing"""
    return MCPServerConfig(
        name="ws-test-server",
        endpoint="ws://localhost:8001",
        authentication={},
        enabled=True,
        timeout=10
    )


@pytest.fixture
def mock_initialize_response():
    """Mock response for initialize request"""
    return {
        "jsonrpc": "2.0",
        "id": "test-server-1",
        "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "test-mcp-server",
                "version": "1.0.0"
            }
        }
    }


@pytest.fixture
def mock_tools_list_response():
    """Mock response for tools/list request"""
    return {
        "jsonrpc": "2.0",
        "id": "test-server-2",
        "result": {
            "tools": [
                {
                    "name": "get_weather",
                    "description": "Get current weather",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "location": {"type": "string"}
                        }
                    }
                },
                {
                    "name": "calculate",
                    "description": "Perform calculations",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "expression": {"type": "string"}
                        }
                    }
                }
            ]
        }
    }


@pytest.fixture
def mock_tool_call_response():
    """Mock response for tools/call request"""
    return {
        "jsonrpc": "2.0",
        "id": "test-server-3",
        "result": {
            "content": [
                {
                    "type": "text",
                    "text": "The weather in New York is sunny, 22°C"
                }
            ]
        }
    }


class TestMCPProtocolClient:
    """Test cases for MCPProtocolClient"""
    
    @pytest.mark.asyncio
    async def test_init(self, sample_config):
        """Test client initialization"""
        client = MCPProtocolClient(sample_config)
        
        assert client.config == sample_config
        assert client.session is None
        assert client.websocket is None
        assert client.connection_type is None
        assert not client.is_connected
        assert client.available_tools == []
        assert client.server_info == {}
    
    @pytest.mark.asyncio
    async def test_http_connection_success(self, sample_config, mock_initialize_response, mock_tools_list_response):
        """Test successful HTTP connection"""
        client = MCPProtocolClient(sample_config)
        
        with aioresponses() as m:
            # Mock initialize request
            m.post(
                sample_config.endpoint,
                payload=mock_initialize_response
            )
            
            # Mock initialized notification
            m.post(sample_config.endpoint, payload={})
            
            # Mock tools/list request
            m.post(
                sample_config.endpoint,
                payload=mock_tools_list_response
            )
            
            success = await client.connect()
            
            assert success is True
            assert client.is_connected is True
            assert client.connection_type == "http"
            assert client.session is not None
            assert len(client.available_tools) == 2
            assert client.config.available_tools == ["get_weather", "calculate"]
            
            await client.disconnect()
    
    @pytest.mark.asyncio
    async def test_websocket_connection_success(self, websocket_config, mock_initialize_response, mock_tools_list_response):
        """Test successful WebSocket connection"""
        client = MCPProtocolClient(websocket_config)
        
        mock_websocket = AsyncMock()
        mock_websocket.send = AsyncMock()
        mock_websocket.recv = AsyncMock(side_effect=[
            json.dumps(mock_initialize_response),
            json.dumps(mock_tools_list_response)
        ])
        mock_websocket.close = AsyncMock()
        
        async def mock_connect_func(*args, **kwargs):
            return mock_websocket
        
        with patch('backend.services.mcp_client.websockets.connect', side_effect=mock_connect_func):
            success = await client.connect()
            
            assert success is True
            assert client.is_connected is True
            assert client.connection_type == "websocket"
            assert client.websocket is not None
            assert len(client.available_tools) == 2
            
            await client.disconnect()
    
    @pytest.mark.asyncio
    async def test_connection_failure(self, sample_config):
        """Test connection failure handling"""
        client = MCPProtocolClient(sample_config)
        
        with aioresponses() as m:
            # Mock connection failure
            m.post(sample_config.endpoint, exception=aiohttp.ClientError("Connection failed"))
            
            success = await client.connect()
            
            assert success is False
            assert client.is_connected is False
    
    @pytest.mark.asyncio
    async def test_unsupported_protocol(self):
        """Test unsupported protocol handling"""
        config = MCPServerConfig(
            name="invalid-server",
            endpoint="ftp://localhost:8001",
            authentication={},
            enabled=True
        )
        
        client = MCPProtocolClient(config)
        success = await client.connect()
        
        assert success is False
        assert not client.is_connected
    
    @pytest.mark.asyncio
    async def test_health_check_success(self, sample_config):
        """Test successful health check"""
        client = MCPProtocolClient(sample_config)
        client.is_connected = True
        client.connection_type = "http"
        
        # Create a real session for the test
        client.session = aiohttp.ClientSession()
        
        ping_response = {
            "jsonrpc": "2.0",
            "id": "test-server-1",
            "result": "pong"
        }
        
        with aioresponses() as m:
            m.post(sample_config.endpoint, payload=ping_response)
            
            is_healthy = await client.health_check()
            
            assert is_healthy is True
            
        await client.session.close()
    
    @pytest.mark.asyncio
    async def test_health_check_failure(self, sample_config):
        """Test health check failure"""
        client = MCPProtocolClient(sample_config)
        client.is_connected = True
        client.connection_type = "http"
        
        # Create a real session for the test
        client.session = aiohttp.ClientSession()
        
        error_response = {
            "jsonrpc": "2.0",
            "id": "test-server-1",
            "error": {"code": -1, "message": "Server error"}
        }
        
        with aioresponses() as m:
            m.post(sample_config.endpoint, payload=error_response)
            
            is_healthy = await client.health_check()
            
            assert is_healthy is False
            
        await client.session.close()
    
    @pytest.mark.asyncio
    async def test_health_check_not_connected(self, sample_config):
        """Test health check when not connected"""
        client = MCPProtocolClient(sample_config)
        
        is_healthy = await client.health_check()
        
        assert is_healthy is False
    
    @pytest.mark.asyncio
    async def test_list_tools_success(self, sample_config, mock_tools_list_response):
        """Test successful tool listing"""
        client = MCPProtocolClient(sample_config)
        client.is_connected = True
        client.connection_type = "http"
        client.session = aiohttp.ClientSession()
        
        with aioresponses() as m:
            m.post(sample_config.endpoint, payload=mock_tools_list_response)
            
            tools = await client.list_tools()
            
            assert len(tools) == 2
            assert tools[0]["name"] == "get_weather"
            assert tools[1]["name"] == "calculate"
            
        await client.session.close()
    
    @pytest.mark.asyncio
    async def test_list_tools_not_connected(self, sample_config):
        """Test tool listing when not connected"""
        client = MCPProtocolClient(sample_config)
        
        with pytest.raises(MCPConnectionError):
            await client.list_tools()
    
    @pytest.mark.asyncio
    async def test_call_tool_success(self, sample_config, mock_tool_call_response):
        """Test successful tool call"""
        client = MCPProtocolClient(sample_config)
        client.is_connected = True
        client.connection_type = "http"
        client.session = aiohttp.ClientSession()
        
        with aioresponses() as m:
            m.post(sample_config.endpoint, payload=mock_tool_call_response)
            
            tool_call = await client.call_tool("get_weather", {"location": "New York"})
            
            assert tool_call.server_name == "test-server"
            assert tool_call.tool_name == "get_weather"
            assert tool_call.parameters == {"location": "New York"}
            assert tool_call.status == "success"
            assert tool_call.result == mock_tool_call_response["result"]
            assert tool_call.error is None
            assert tool_call.execution_time > 0
            
        await client.session.close()
    
    @pytest.mark.asyncio
    async def test_call_tool_error(self, sample_config):
        """Test tool call with server error"""
        client = MCPProtocolClient(sample_config)
        client.is_connected = True
        client.connection_type = "http"
        client.session = aiohttp.ClientSession()
        
        error_response = {
            "jsonrpc": "2.0",
            "id": "test-server-1",
            "error": {"code": -32602, "message": "Invalid params"}
        }
        
        with aioresponses() as m:
            m.post(sample_config.endpoint, payload=error_response)
            
            tool_call = await client.call_tool("invalid_tool", {})
            
            assert tool_call.status == "error"
            assert "Invalid params" in tool_call.error
            assert tool_call.result is None
            
        await client.session.close()
    
    @pytest.mark.asyncio
    async def test_call_tool_not_connected(self, sample_config):
        """Test tool call when not connected"""
        client = MCPProtocolClient(sample_config)
        
        tool_call = await client.call_tool("get_weather", {"location": "New York"})
        
        assert tool_call.status == "error"
        assert "Not connected" in tool_call.error
        assert tool_call.result is None
    
    @pytest.mark.asyncio
    async def test_call_tool_timeout(self, sample_config):
        """Test tool call timeout"""
        client = MCPProtocolClient(sample_config)
        client.is_connected = True
        client.connection_type = "http"
        client.session = aiohttp.ClientSession()
        
        with aioresponses() as m:
            m.post(sample_config.endpoint, exception=asyncio.TimeoutError())
            
            tool_call = await client.call_tool("slow_tool", {})
            
            assert tool_call.status == "timeout"
            assert "timed out" in tool_call.error
            assert tool_call.result is None
            
        await client.session.close()
    
    @pytest.mark.asyncio
    async def test_disconnect(self, sample_config):
        """Test disconnection"""
        client = MCPProtocolClient(sample_config)
        
        # Mock connected state with real objects that have close methods
        client.is_connected = True
        mock_session = MagicMock()
        mock_session.close = AsyncMock()
        mock_websocket = MagicMock()
        mock_websocket.close = AsyncMock()
        
        client.session = mock_session
        client.websocket = mock_websocket
        client.connection_type = "http"
        
        await client.disconnect()
        
        assert not client.is_connected
        assert client.connection_type is None
        assert client.session is None
        assert client.websocket is None
        mock_session.close.assert_called_once()
        mock_websocket.close.assert_called_once()
    
    def test_get_server_info(self, sample_config):
        """Test getting server info"""
        client = MCPProtocolClient(sample_config)
        client.server_info = {"name": "test-server", "version": "1.0.0"}
        
        info = client.get_server_info()
        
        assert info == {"name": "test-server", "version": "1.0.0"}
        # Ensure it's a copy
        info["modified"] = True
        assert "modified" not in client.server_info
    
    def test_get_available_tools(self, sample_config):
        """Test getting available tools"""
        client = MCPProtocolClient(sample_config)
        client.available_tools = [{"name": "tool1"}, {"name": "tool2"}]
        
        tools = client.get_available_tools()
        
        assert len(tools) == 2
        assert tools[0]["name"] == "tool1"
        # Ensure it's a copy
        tools.append({"name": "tool3"})
        assert len(client.available_tools) == 2
    
    def test_str_representation(self, sample_config):
        """Test string representation"""
        client = MCPProtocolClient(sample_config)
        
        str_repr = str(client)
        
        assert "test-server" in str_repr
        assert "localhost:8001" in str_repr
        assert "connected=False" in str_repr
    
    def test_request_id_generation(self, sample_config):
        """Test request ID generation"""
        client = MCPProtocolClient(sample_config)
        
        id1 = client._get_next_request_id()
        id2 = client._get_next_request_id()
        
        assert id1 != id2
        assert "test-server" in id1
        assert "test-server" in id2
        assert id1.endswith("-1")
        assert id2.endswith("-2")


@pytest.mark.asyncio
async def test_websocket_connection_lost():
    """Test handling of WebSocket connection loss"""
    from websockets.exceptions import ConnectionClosed
    
    config = MCPServerConfig(
        name="ws-test",
        endpoint="ws://localhost:8001",
        authentication={},
        enabled=True
    )
    
    client = MCPProtocolClient(config)
    client.is_connected = True
    client.connection_type = "websocket"
    
    mock_websocket = AsyncMock()
    mock_websocket.send = AsyncMock(side_effect=ConnectionClosed(None, None))
    client.websocket = mock_websocket
    
    with pytest.raises(MCPConnectionError):
        await client._send_websocket_request({"test": "request"}, 10)
    
    assert not client.is_connected


@pytest.mark.asyncio
async def test_invalid_json_response():
    """Test handling of invalid JSON responses"""
    config = MCPServerConfig(
        name="test-server",
        endpoint="http://localhost:8001",
        authentication={},
        enabled=True
    )
    
    client = MCPProtocolClient(config)
    client.is_connected = True
    client.connection_type = "http"
    client.session = aiohttp.ClientSession()
    
    with aioresponses() as m:
        m.post(config.endpoint, body="invalid json")
        
        with pytest.raises(MCPProtocolError):
            await client._send_http_request({"test": "request"}, 10)
    
    await client.session.close()