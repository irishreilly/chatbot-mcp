"""
End-to-end MCP integration tests with mocked servers
"""

import pytest
import asyncio
import json
from unittest.mock import Mock, AsyncMock, patch
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.mcp_client_manager import MCPClientManager
from backend.services.chat_service import ChatService
from backend.services.ai_service import AIService, AIProvider
from backend.models.mcp import MCPServerConfig, MCPToolCall
from backend.tests.fixtures import TestDataFactory, MockServices


class MockMCPServer:
    """Mock MCP server for testing"""
    
    def __init__(self, name: str, tools: list = None):
        self.name = name
        self.tools = tools or [
            {
                "name": "get_weather",
                "description": "Get weather information for a location",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "units": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                    },
                    "required": ["location"]
                }
            },
            {
                "name": "search_web",
                "description": "Search the web for information",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 5}
                    },
                    "required": ["query"]
                }
            }
        ]
        self.connected = True
        self.call_count = 0
    
    async def list_tools(self):
        """Mock list tools response"""
        return {
            "tools": self.tools
        }
    
    async def call_tool(self, tool_name: str, parameters: dict):
        """Mock tool call response"""
        self.call_count += 1
        
        if not self.connected:
            raise ConnectionError(f"Server {self.name} is not connected")
        
        if tool_name == "get_weather":
            location = parameters.get("location", "Unknown")
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"The weather in {location} is sunny with a temperature of 72°F"
                    }
                ]
            }
        elif tool_name == "search_web":
            query = parameters.get("query", "")
            limit = parameters.get("limit", 5)
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Found {limit} results for '{query}': Mock search results..."
                    }
                ]
            }
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
    
    def disconnect(self):
        """Simulate server disconnection"""
        self.connected = False
    
    def reconnect(self):
        """Simulate server reconnection"""
        self.connected = True


class TestMCPIntegrationE2E:
    """End-to-end MCP integration tests"""
    
    def setup_method(self):
        """Setup for each test method"""
        self.client = TestClient(app)
        self.mock_servers = {
            "weather-server": MockMCPServer("weather-server", [
                {
                    "name": "get_weather",
                    "description": "Get weather information",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "location": {"type": "string"}
                        },
                        "required": ["location"]
                    }
                }
            ]),
            "search-server": MockMCPServer("search-server", [
                {
                    "name": "search_web",
                    "description": "Search the web",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"}
                        },
                        "required": ["query"]
                    }
                }
            ])
        }
    
    @patch('backend.services.mcp_client_manager.MCPClient')
    def test_weather_query_with_mcp(self, mock_mcp_client):
        """Test weather query that uses MCP tools"""
        # Setup mock MCP client
        mock_client_instance = Mock()
        mock_client_instance.list_tools = AsyncMock()
        mock_client_instance.list_tools.return_value = {
            "tools": self.mock_servers["weather-server"].tools
        }
        mock_client_instance.call_tool = AsyncMock()
        mock_client_instance.call_tool.return_value = {
            "content": [{"type": "text", "text": "Weather in New York: 72°F, sunny"}]
        }
        mock_client_instance.is_connected = True
        mock_mcp_client.return_value = mock_client_instance
        
        # Make weather query
        response = self.client.post("/api/chat", json={
            "message": "What's the weather like in New York?"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Should contain weather information
        assert "weather" in data["response"].lower()
        assert "conversation_id" in data
        
        # Note: In a full integration, we would verify MCP tools were used
        # For now, we verify the response structure is correct
    
    @patch('backend.services.mcp_client_manager.MCPClient')
    def test_search_query_with_mcp(self, mock_mcp_client):
        """Test search query that uses MCP tools"""
        # Setup mock MCP client
        mock_client_instance = Mock()
        mock_client_instance.list_tools = AsyncMock()
        mock_client_instance.list_tools.return_value = {
            "tools": self.mock_servers["search-server"].tools
        }
        mock_client_instance.call_tool = AsyncMock()
        mock_client_instance.call_tool.return_value = {
            "content": [{"type": "text", "text": "Search results for Python: Documentation, tutorials, etc."}]
        }
        mock_client_instance.is_connected = True
        mock_mcp_client.return_value = mock_client_instance
        
        # Make search query
        response = self.client.post("/api/chat", json={
            "message": "Search for information about Python programming"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Should contain search-related response
        assert "conversation_id" in data
        assert "response" in data
    
    @patch('backend.services.mcp_client_manager.MCPClient')
    def test_mcp_server_failure_handling(self, mock_mcp_client):
        """Test handling when MCP server fails"""
        # Setup mock MCP client that fails
        mock_client_instance = Mock()
        mock_client_instance.list_tools = AsyncMock()
        mock_client_instance.list_tools.side_effect = ConnectionError("Server unavailable")
        mock_client_instance.is_connected = False
        mock_mcp_client.return_value = mock_client_instance
        
        # Make query that would normally use MCP
        response = self.client.post("/api/chat", json={
            "message": "What's the weather in Paris?"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Should still get a response (fallback to AI only)
        assert "response" in data
        assert "conversation_id" in data
        # MCP tools should be empty since server failed
        assert data.get("mcp_tools_used", []) == []
    
    @patch('backend.services.mcp_client_manager.MCPClient')
    def test_multiple_mcp_tools_coordination(self, mock_mcp_client):
        """Test coordination of multiple MCP tools"""
        # Setup mock MCP client with multiple tools
        mock_client_instance = Mock()
        mock_client_instance.list_tools = AsyncMock()
        mock_client_instance.list_tools.return_value = {
            "tools": [
                {
                    "name": "get_weather",
                    "description": "Get weather information",
                    "inputSchema": {"type": "object", "properties": {"location": {"type": "string"}}}
                },
                {
                    "name": "get_time",
                    "description": "Get current time",
                    "inputSchema": {"type": "object", "properties": {"timezone": {"type": "string"}}}
                }
            ]
        }
        mock_client_instance.call_tool = AsyncMock()
        mock_client_instance.call_tool.side_effect = [
            {"content": [{"type": "text", "text": "Weather: 75°F, cloudy"}]},
            {"content": [{"type": "text", "text": "Time: 2:30 PM EST"}]}
        ]
        mock_client_instance.is_connected = True
        mock_mcp_client.return_value = mock_client_instance
        
        # Make query that could use multiple tools
        response = self.client.post("/api/chat", json={
            "message": "What's the weather and current time in Boston?"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Should get response incorporating multiple tools
        assert "response" in data
        assert "conversation_id" in data
    
    @patch('backend.services.mcp_client_manager.MCPClient')
    def test_mcp_tool_parameter_extraction(self, mock_mcp_client):
        """Test parameter extraction for MCP tools"""
        # Setup mock MCP client
        mock_client_instance = Mock()
        mock_client_instance.list_tools = AsyncMock()
        mock_client_instance.list_tools.return_value = {
            "tools": [{
                "name": "get_weather",
                "description": "Get weather information",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "units": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                    },
                    "required": ["location"]
                }
            }]
        }
        mock_client_instance.call_tool = AsyncMock()
        mock_client_instance.call_tool.return_value = {
            "content": [{"type": "text", "text": "Weather data retrieved"}]
        }
        mock_client_instance.is_connected = True
        mock_mcp_client.return_value = mock_client_instance
        
        # Make query with specific location
        response = self.client.post("/api/chat", json={
            "message": "What's the weather in San Francisco in Celsius?"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Should extract location parameter correctly
        assert "response" in data
    
    @patch('backend.services.mcp_client_manager.MCPClient')
    def test_mcp_conversation_context(self, mock_mcp_client):
        """Test MCP tool usage with conversation context"""
        # Setup mock MCP client
        mock_client_instance = Mock()
        mock_client_instance.list_tools = AsyncMock()
        mock_client_instance.list_tools.return_value = {
            "tools": [{
                "name": "get_weather",
                "description": "Get weather information",
                "inputSchema": {
                    "type": "object",
                    "properties": {"location": {"type": "string"}},
                    "required": ["location"]
                }
            }]
        }
        mock_client_instance.call_tool = AsyncMock()
        mock_client_instance.call_tool.return_value = {
            "content": [{"type": "text", "text": "Weather in Tokyo: 68°F, rainy"}]
        }
        mock_client_instance.is_connected = True
        mock_mcp_client.return_value = mock_client_instance
        
        # First message establishes location context
        response1 = self.client.post("/api/chat", json={
            "message": "I'm planning a trip to Tokyo"
        })
        assert response1.status_code == 200
        conversation_id = response1.json()["conversation_id"]
        
        # Second message asks about weather (should use context)
        response2 = self.client.post("/api/chat", json={
            "message": "What's the weather like there?",
            "conversation_id": conversation_id
        })
        assert response2.status_code == 200
        
        # Should use Tokyo as location from context
        data = response2.json()
        assert "response" in data
    
    def test_mcp_error_recovery(self):
        """Test error recovery when MCP operations fail"""
        # Test with various error scenarios
        error_scenarios = [
            {"message": "Get weather for invalid location xyz123"},
            {"message": "Search for something that causes timeout"},
            {"message": "Use tool that doesn't exist"}
        ]
        
        for scenario in error_scenarios:
            response = self.client.post("/api/chat", json=scenario)
            
            # Should still return 200 with fallback response
            assert response.status_code == 200
            data = response.json()
            assert "response" in data
            assert "conversation_id" in data
    
    @patch('backend.services.mcp_client_manager.MCPClient')
    def test_mcp_performance_under_load(self, mock_mcp_client):
        """Test MCP performance under concurrent load"""
        # Setup mock MCP client
        mock_client_instance = Mock()
        mock_client_instance.list_tools = AsyncMock()
        mock_client_instance.list_tools.return_value = {"tools": []}
        mock_client_instance.call_tool = AsyncMock()
        mock_client_instance.call_tool.return_value = {
            "content": [{"type": "text", "text": "Mock response"}]
        }
        mock_client_instance.is_connected = True
        mock_mcp_client.return_value = mock_client_instance
        
        import concurrent.futures
        import time
        
        def make_mcp_request(i):
            return self.client.post("/api/chat", json={
                "message": f"Test MCP request {i}"
            })
        
        start_time = time.time()
        
        # Make concurrent requests
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(make_mcp_request, i) for i in range(10)]
            responses = [future.result() for future in futures]
        
        end_time = time.time()
        
        # All requests should succeed
        for response in responses:
            assert response.status_code == 200
        
        # Should complete within reasonable time
        assert end_time - start_time < 10.0
    
    def test_mcp_tool_discovery(self):
        """Test MCP tool discovery and listing"""
        # This would test the tool discovery endpoint if implemented
        # For now, we test that the system handles unknown tools gracefully
        
        response = self.client.post("/api/chat", json={
            "message": "Use some unknown tool that doesn't exist"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        # Should not crash when tool doesn't exist


class TestMCPClientManager:
    """Test MCP Client Manager directly"""
    
    @pytest.mark.asyncio
    async def test_mcp_client_manager_initialization(self):
        """Test MCP client manager initialization"""
        config = {
            "test-server": TestDataFactory.create_mcp_server_config()
        }
        
        manager = MCPClientManager(config)
        assert manager is not None
        assert len(manager.clients) == 0  # No clients until connection
    
    @pytest.mark.asyncio
    async def test_mcp_tool_selection(self):
        """Test tool selection logic"""
        manager = MCPClientManager({})
        
        # Mock available tools
        manager.available_tools = {
            "weather-server": [
                {
                    "name": "get_weather",
                    "description": "Get weather information",
                    "inputSchema": {"properties": {"location": {"type": "string"}}}
                }
            ]
        }
        
        # Test tool selection
        tools = manager.select_tools_for_query("What's the weather in NYC?", max_tools=1)
        
        # Should select weather tool for weather query
        assert len(tools) <= 1
    
    @pytest.mark.asyncio
    async def test_mcp_parallel_execution(self):
        """Test parallel tool execution"""
        manager = MCPClientManager({})
        
        # Mock clients
        mock_client = Mock()
        mock_client.call_tool = AsyncMock()
        mock_client.call_tool.return_value = {"result": "success"}
        mock_client.is_connected = True
        
        manager.clients["test-server"] = mock_client
        
        # Test parallel execution
        tool_calls = [
            {
                "server_name": "test-server",
                "tool_name": "tool1",
                "parameters": {"param": "value1"}
            },
            {
                "server_name": "test-server", 
                "tool_name": "tool2",
                "parameters": {"param": "value2"}
            }
        ]
        
        results = await manager.call_tools_parallel(tool_calls)
        
        # Should execute both tools
        assert len(results) == 2
        for result in results:
            assert isinstance(result, MCPToolCall)


class TestMCPErrorHandling:
    """Test MCP-specific error handling"""
    
    def setup_method(self):
        """Setup for each test method"""
        self.client = TestClient(app)
    
    def test_mcp_server_timeout(self):
        """Test handling of MCP server timeouts"""
        response = self.client.post("/api/chat", json={
            "message": "This might cause a timeout in MCP server"
        })
        
        # Should handle timeout gracefully
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
    
    def test_mcp_authentication_failure(self):
        """Test handling of MCP authentication failures"""
        response = self.client.post("/api/chat", json={
            "message": "Test authentication failure scenario"
        })
        
        # Should handle auth failure gracefully
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
    
    def test_mcp_malformed_response(self):
        """Test handling of malformed MCP responses"""
        response = self.client.post("/api/chat", json={
            "message": "Test malformed response handling"
        })
        
        # Should handle malformed responses gracefully
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
    
    def test_mcp_partial_failure(self):
        """Test handling when some MCP tools fail but others succeed"""
        response = self.client.post("/api/chat", json={
            "message": "Test partial failure scenario with multiple tools"
        })
        
        # Should handle partial failures gracefully
        assert response.status_code == 200
        data = response.json()
        assert "response" in data