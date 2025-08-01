"""
Integration tests for Chat Service with MCP Client Manager
Tests the complete integration between chat service and MCP functionality
"""

import pytest
import pytest_asyncio
import asyncio
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime, timezone

from backend.services.chat_service import ChatService, ChatServiceError
from backend.services.ai_service import AIService, AIResponse, AIServiceError
from backend.services.mcp_client_manager import MCPClientManager, MCPClientManagerError
from backend.services.mcp_client import MCPProtocolClient
from backend.services.mcp_config_manager import MCPConfigManager
from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.mcp import MCPServerConfig, MCPToolCall


@pytest.fixture
def sample_mcp_config():
    """Sample MCP server configuration"""
    return {
        "weather-server": MCPServerConfig(
            name="weather-server",
            endpoint="http://localhost:8001",
            authentication={"api_key": "test-key"},
            available_tools=["get_weather", "get_forecast"],
            enabled=True,
            timeout=30
        ),
        "search-server": MCPServerConfig(
            name="search-server", 
            endpoint="ws://localhost:8002",
            authentication={},
            available_tools=["web_search", "document_search"],
            enabled=True,
            timeout=15
        ),
        "calc-server": MCPServerConfig(
            name="calc-server",
            endpoint="http://localhost:8003",
            authentication={},
            available_tools=["calculate", "convert_units"],
            enabled=False,  # Disabled server for testing fallback
            timeout=30
        )
    }


@pytest.fixture
def sample_tools():
    """Sample tool definitions with schemas"""
    return {
        "weather-server": [
            {
                "name": "get_weather",
                "description": "Get current weather for a location",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "units": {"type": "string", "enum": ["metric", "imperial"]}
                    },
                    "required": ["location"]
                }
            },
            {
                "name": "get_forecast",
                "description": "Get weather forecast for multiple days",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "days": {"type": "integer", "minimum": 1, "maximum": 7}
                    },
                    "required": ["location"]
                }
            }
        ],
        "search-server": [
            {
                "name": "web_search",
                "description": "Search the web for information",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 5}
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "document_search",
                "description": "Search through documents",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "document_type": {"type": "string"}
                    },
                    "required": ["query"]
                }
            }
        ]
    }


@pytest.fixture
def mock_ai_service():
    """Mock AI service for testing"""
    service = Mock(spec=AIService)
    service.get_available_providers = Mock(return_value=['openai'])
    return service


@pytest_asyncio.fixture
async def integrated_chat_service(sample_mcp_config, sample_tools, mock_ai_service):
    """Create a fully integrated chat service with real MCP client manager"""
    # Create mock config manager
    config_manager = Mock(spec=MCPConfigManager)
    config_manager.get_enabled_servers.return_value = {
        name: config for name, config in sample_mcp_config.items() 
        if config.enabled
    }
    config_manager.get_all_servers.return_value = sample_mcp_config
    config_manager.load_configuration = Mock()
    
    # Create MCP client manager with mocked clients
    mcp_manager = MCPClientManager(config_manager)
    
    # Mock the MCP clients
    def create_mock_client(config):
        client = AsyncMock(spec=MCPProtocolClient)
        client.connect.return_value = True
        client.disconnect = AsyncMock()
        client.health_check.return_value = True
        client.get_available_tools.return_value = sample_tools.get(config.name, [])
        client.list_tools = AsyncMock(return_value=sample_tools.get(config.name, []))
        
        # Mock tool calls with realistic responses
        async def mock_call_tool(tool_name: str, parameters: dict) -> MCPToolCall:
            tool_call = MCPToolCall(
                server_name=config.name,
                tool_name=tool_name,
                parameters=parameters
            )
            
            # Generate realistic mock responses based on tool
            if tool_name == "get_weather":
                result = {
                    "location": parameters.get("location", "Unknown"),
                    "temperature": "72°F",
                    "condition": "Sunny",
                    "humidity": "45%",
                    "wind": "5 mph NW"
                }
                tool_call.mark_success(result, 0.5)
            elif tool_name == "get_forecast":
                days = parameters.get("days", 3)
                result = {
                    "location": parameters.get("location", "Unknown"),
                    "forecast": [
                        {"day": i+1, "high": f"{70+i}°F", "low": f"{55+i}°F", "condition": "Partly cloudy"}
                        for i in range(days)
                    ]
                }
                tool_call.mark_success(result, 0.8)
            elif tool_name == "web_search":
                result = {
                    "query": parameters.get("query", ""),
                    "results": [
                        {"title": "Search Result 1", "url": "https://example1.com", "snippet": "Relevant information..."},
                        {"title": "Search Result 2", "url": "https://example2.com", "snippet": "More information..."}
                    ]
                }
                tool_call.mark_success(result, 1.2)
            elif tool_name == "document_search":
                result = {
                    "query": parameters.get("query", ""),
                    "documents": [
                        {"title": "Document 1", "content": "Relevant document content..."},
                        {"title": "Document 2", "content": "Additional document content..."}
                    ]
                }
                tool_call.mark_success(result, 0.7)
            else:
                tool_call.mark_error(f"Unknown tool: {tool_name}")
            
            return tool_call
        
        client.call_tool = mock_call_tool
        return client
    
    # Patch the MCPProtocolClient creation
    with patch('backend.services.mcp_client_manager.MCPProtocolClient') as mock_client_class:
        mock_client_class.side_effect = create_mock_client
        
        # Initialize the MCP manager
        await mcp_manager.initialize()
        
        # Create chat service with integrated MCP manager
        chat_service = ChatService(
            ai_service=mock_ai_service,
            mcp_client_manager=mcp_manager
        )
        
        yield chat_service, mcp_manager
        
        # Cleanup
        await mcp_manager.shutdown()


class TestChatServiceMCPIntegration:
    """Integration tests for ChatService with MCP functionality"""
    
    @pytest.mark.asyncio
    async def test_weather_query_integration(self, integrated_chat_service, mock_ai_service):
        """Test complete weather query integration with MCP tools"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Setup AI response that incorporates MCP data
        mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
            content="Based on the current weather data, it's sunny and 72°F in San Francisco with 45% humidity and light winds from the northwest at 5 mph.",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=35
        ))
        
        # Execute weather query
        result = await chat_service.process_message(
            message="What's the weather like in San Francisco?",
            conversation_id="weather-test-123"
        )
        
        # Verify response includes weather data
        assert "72°F" in result['response'] or "sunny" in result['response'].lower()
        assert 'get_weather' in result['mcp_tools_used']  # Should include weather tool
        assert result['ai_provider'] == "openai"
        assert result['tokens_used'] == 35
        
        # Verify AI service was called with MCP context
        call_args = mock_ai_service.generate_response.call_args
        assert call_args[1]['additional_context'] is not None
        assert "Tool 'get_weather' returned:" in call_args[1]['additional_context']
        assert "72°F" in call_args[1]['additional_context']
    
    @pytest.mark.asyncio
    async def test_search_query_integration(self, integrated_chat_service, mock_ai_service):
        """Test search query integration with MCP tools"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Setup AI response
        mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
            content="I found some relevant information about Python programming. Here are the top results from my search.",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=28
        ))
        
        # Execute search query
        result = await chat_service.process_message(
            message="Search for Python programming tutorials",
            conversation_id="search-test-123"
        )
        
        # Verify search tool was used
        assert 'web_search' in result['mcp_tools_used']  # Should include web search tool
        assert "search" in result['response'].lower()
        
        # Verify AI service received search results
        call_args = mock_ai_service.generate_response.call_args
        assert "Tool 'web_search' returned:" in call_args[1]['additional_context']
        assert "Search Result" in call_args[1]['additional_context']
    
    @pytest.mark.asyncio
    async def test_multiple_tools_parallel_execution(self, integrated_chat_service, mock_ai_service):
        """Test parallel execution of multiple MCP tools"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Setup AI response that uses multiple tools
        mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
            content="I've gathered both weather information and search results for San Francisco. The weather is sunny and 72°F, and I found several relevant articles about the city.",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=45
        ))
        
        # Execute query that should trigger multiple tools
        result = await chat_service.process_message(
            message="Get weather and search for information about San Francisco",
            conversation_id="multi-tool-test-123"
        )
        
        # Verify multiple tools were used
        assert len(result['mcp_tools_used']) >= 1  # At least one tool should be used
        
        # Verify AI service received context from multiple tools
        call_args = mock_ai_service.generate_response.call_args
        additional_context = call_args[1]['additional_context']
        assert additional_context is not None
        # Should contain results from at least one tool
        assert "Tool '" in additional_context
    
    @pytest.mark.asyncio
    async def test_mcp_server_unavailable_fallback(self, integrated_chat_service, mock_ai_service):
        """Test fallback behavior when MCP servers are unavailable"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Simulate server disconnection
        mcp_manager.connected_servers.clear()
        mcp_manager.available_tools.clear()
        
        # Setup AI response for fallback scenario
        mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
            content="I'm unable to access external weather services right now, but I can provide general weather information.",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=25
        ))
        
        # Execute weather query
        result = await chat_service.process_message(
            message="What's the weather in New York?",
            conversation_id="fallback-test-123"
        )
        
        # Verify fallback behavior
        assert result['mcp_tools_used'] == []  # No tools should be used
        assert "unable to access" in result['response'].lower() or "general" in result['response'].lower()
        
        # Verify AI service was called without additional context
        call_args = mock_ai_service.generate_response.call_args
        assert call_args[1]['additional_context'] is None
    
    @pytest.mark.asyncio
    async def test_mcp_tool_failure_graceful_handling(self, integrated_chat_service, mock_ai_service):
        """Test graceful handling of MCP tool failures"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Mock a tool failure
        original_call_tool = mcp_manager.call_tool
        
        async def failing_call_tool(server_name, tool_name, parameters):
            tool_call = MCPToolCall(server_name, tool_name, parameters)
            tool_call.mark_error("Server temporarily unavailable")
            return tool_call
        
        mcp_manager.call_tool = failing_call_tool
        
        # Setup AI response for tool failure scenario
        mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
            content="I'm having trouble accessing the weather service right now. Please try again later.",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=22
        ))
        
        # Execute weather query
        result = await chat_service.process_message(
            message="What's the weather in Boston?",
            conversation_id="tool-failure-test-123"
        )
        
        # Verify graceful failure handling
        assert result['mcp_tools_used'] == []  # Failed tools shouldn't be listed as used
        assert "trouble" in result['response'].lower() or "try again" in result['response'].lower()
        
        # Restore original method
        mcp_manager.call_tool = original_call_tool
    
    @pytest.mark.asyncio
    async def test_conversation_context_with_mcp_integration(self, integrated_chat_service, mock_ai_service):
        """Test conversation context preservation with MCP integration"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Create conversation with history
        conversation = Conversation(id="context-test-123")
        conversation.add_message(Message(
            id="msg-1",
            conversation_id="context-test-123",
            content="What's the weather in Seattle?",
            sender="user",
            timestamp=datetime.now(timezone.utc)
        ))
        conversation.add_message(Message(
            id="msg-2",
            conversation_id="context-test-123",
            content="It's currently sunny and 68°F in Seattle with light winds.",
            sender="assistant",
            timestamp=datetime.now(timezone.utc)
        ))
        
        # Setup AI response that references previous context
        mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
            content="Based on our previous discussion about Seattle weather and the current forecast data, tomorrow will be partly cloudy with temperatures reaching 70°F.",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=38
        ))
        
        # Execute follow-up query
        result = await chat_service.process_message(
            message="What about the weather forecast for tomorrow?",
            conversation_id="context-test-123",
            conversation=conversation
        )
        
        # Verify context and MCP integration
        assert 'get_forecast' in result['mcp_tools_used']  # Should include forecast tool
        assert "previous" in result['response'].lower() or "tomorrow" in result['response'].lower()
        
        # Verify AI service received both conversation context and MCP data
        call_args = mock_ai_service.generate_response.call_args
        assert call_args[1]['conversation'] == conversation
        assert call_args[1]['additional_context'] is not None
        assert "Tool 'get_forecast' returned:" in call_args[1]['additional_context']
    
    @pytest.mark.asyncio
    async def test_ai_service_error_with_mcp_fallback(self, integrated_chat_service, mock_ai_service):
        """Test behavior when AI service fails but MCP tools succeed"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Setup AI service to fail
        mock_ai_service.generate_response = AsyncMock(side_effect=AIServiceError("AI service unavailable"))
        
        # Execute query that would use MCP tools
        result = await chat_service.process_message(
            message="Get weather for Chicago",
            conversation_id="ai-error-test-123"
        )
        
        # Verify fallback response is provided
        assert "technical difficulties" in result['response']
        assert result['ai_provider'] == "fallback"
        assert result['ai_model'] == "none"
        
        # MCP tools should still have been attempted
        # (though the results won't be integrated due to AI failure)
    
    @pytest.mark.asyncio
    async def test_no_relevant_tools_found(self, integrated_chat_service, mock_ai_service):
        """Test behavior when no relevant MCP tools are found for query"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Setup AI response for non-tool query
        mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
            content="Hello! I'm doing well, thank you for asking. How can I help you today?",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=18
        ))
        
        # Execute non-tool query
        result = await chat_service.process_message(
            message="Hello, how are you doing today?",
            conversation_id="no-tools-test-123"
        )
        
        # Verify no tools were used
        assert result['mcp_tools_used'] == []
        assert "Hello!" in result['response']
        
        # Verify AI service was called without additional context
        call_args = mock_ai_service.generate_response.call_args
        assert call_args[1]['additional_context'] is None
    
    @pytest.mark.asyncio
    async def test_tool_parameter_generation_accuracy(self, integrated_chat_service, mock_ai_service):
        """Test accuracy of tool parameter generation from user queries"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Setup AI response
        mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
            content="Here's the 5-day weather forecast for Miami with detailed daily predictions.",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=32
        ))
        
        # Execute specific forecast query
        result = await chat_service.process_message(
            message="Get 5-day weather forecast for Miami",
            conversation_id="params-test-123"
        )
        
        # Verify correct tool was used
        assert 'get_forecast' in result['mcp_tools_used']  # Should include forecast tool
        
        # Verify AI service received properly formatted tool results
        call_args = mock_ai_service.generate_response.call_args
        additional_context = call_args[1]['additional_context']
        assert "Miami" in additional_context
        assert "forecast" in additional_context.lower()
    
    @pytest.mark.asyncio
    async def test_mcp_status_reporting(self, integrated_chat_service):
        """Test MCP status reporting functionality"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Get MCP status
        status = chat_service.get_mcp_status()
        
        # Verify status structure
        assert status['available'] is True
        assert isinstance(status['servers'], dict)
        assert status['total_tools'] > 0
        assert status['connected_servers'] > 0
        
        # Verify server details
        assert 'weather-server' in status['servers']
        assert 'search-server' in status['servers']
        assert status['servers']['weather-server']['connected'] is True
        assert status['servers']['search-server']['connected'] is True
    
    @pytest.mark.asyncio
    async def test_available_tools_listing(self, integrated_chat_service):
        """Test listing of available MCP tools"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Get available tools
        tools = chat_service.get_available_tools()
        
        # Verify tools structure
        assert len(tools) > 0
        
        # Verify tool details
        tool_names = [tool['name'] for tool in tools]
        assert 'get_weather' in tool_names
        assert 'get_forecast' in tool_names
        assert 'web_search' in tool_names
        assert 'document_search' in tool_names
        
        # Verify server information is included
        for tool in tools:
            assert 'server_name' in tool
            assert tool['server_name'] in ['weather-server', 'search-server']
    
    @pytest.mark.asyncio
    async def test_health_check_integration(self, integrated_chat_service, mock_ai_service):
        """Test health check with MCP integration"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Setup AI service health
        mock_ai_service.get_available_providers.return_value = ['openai', 'anthropic']
        
        # Perform health check
        health = await chat_service.health_check()
        
        # Verify health status
        assert health['chat_service'] is True
        assert health['ai_service'] is True
        assert health['mcp_service'] is True
        
        # Verify details
        assert 'ai_providers' in health['details']
        assert 'mcp_servers' in health['details']
        assert len(health['details']['ai_providers']) == 2
        assert len(health['details']['mcp_servers']) >= 2
    
    @pytest.mark.asyncio
    async def test_concurrent_requests_handling(self, integrated_chat_service, mock_ai_service):
        """Test handling of concurrent chat requests with MCP integration"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Setup AI responses for concurrent requests
        responses = [
            AIResponse(content=f"Weather response {i}", provider="openai", model="gpt-3.5-turbo", tokens_used=20)
            for i in range(3)
        ]
        mock_ai_service.generate_response = AsyncMock(side_effect=responses)
        
        # Create concurrent requests
        cities = ["New York", "Los Angeles", "Chicago"]
        tasks = [
            chat_service.process_message(
                message=f"Weather in {cities[i]}",
                conversation_id=f"concurrent-test-{i}"
            )
            for i in range(3)
        ]
        
        # Execute concurrently
        results = await asyncio.gather(*tasks)
        
        # Verify all requests completed successfully
        assert len(results) == 3
        for i, result in enumerate(results):
            assert f"concurrent-test-{i}" == result['conversation_id']
            assert 'get_weather' in result['mcp_tools_used']  # Should include weather tool
    
    @pytest.mark.asyncio
    async def test_large_mcp_response_handling(self, integrated_chat_service, mock_ai_service):
        """Test handling of large MCP tool responses"""
        # Get the chat service
        chat_service, mcp_manager = integrated_chat_service
        
        # Mock a tool that returns large response
        original_call_tool = mcp_manager.call_tool
        
        async def large_response_tool(server_name, tool_name, parameters):
            tool_call = MCPToolCall(
                server_name=server_name,
                tool_name=tool_name,
                parameters=parameters
            )
            # Create large response (simulate detailed search results)
            large_result = {
                "query": parameters.get("query", ""),
                "results": [
                    {
                        "title": f"Search Result {i}",
                        "content": "This is a very detailed search result with lots of content. " * 20,
                        "url": f"https://example{i}.com"
                    }
                    for i in range(10)
                ]
            }
            tool_call.mark_success(large_result, 2.0)
            return tool_call
        
        mcp_manager.call_tool = large_response_tool
        
        # Setup AI response
        mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
            content="I found extensive search results for your query. Here's a summary of the most relevant information.",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=42
        ))
        
        # Execute search query
        result = await chat_service.process_message(
            message="Search for detailed information about machine learning",
            conversation_id="large-response-test-123"
        )
        
        # Verify handling of large response
        assert 'web_search' in result['mcp_tools_used']  # Should include web search tool
        assert "extensive" in result['response'].lower() or "summary" in result['response'].lower()
        
        # Verify AI service received truncated context (should be limited to 500 chars per tool)
        call_args = mock_ai_service.generate_response.call_args
        additional_context = call_args[1]['additional_context']
        # Context should be present but truncated
        assert len(additional_context) < 2000  # Much smaller than the full large response
        
        # Restore original method
        mcp_manager.call_tool = original_call_tool