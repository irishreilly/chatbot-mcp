#!/usr/bin/env python3
"""
Manual integration test to verify MCP client integration with chat service
"""

import asyncio
from unittest.mock import Mock, AsyncMock
from backend.services.chat_service import ChatService
from backend.services.ai_service import AIService, AIResponse
from backend.services.mcp_client_manager import MCPClientManager
from backend.models.mcp import MCPToolCall


async def test_mcp_integration():
    """Test complete MCP integration with chat service"""
    
    # Create mock AI service
    mock_ai_service = Mock(spec=AIService)
    mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
        content="Based on the weather data, it's sunny and 72°F in New York today.",
        provider="openai",
        model="gpt-3.5-turbo",
        tokens_used=25
    ))
    mock_ai_service.get_available_providers = Mock(return_value=['openai'])
    
    # Create mock MCP manager
    mock_mcp_manager = Mock(spec=MCPClientManager)
    
    # Setup mock tools
    mock_tools = [
        {
            'name': 'get_weather',
            'server_name': 'weather_server',
            'description': 'Get current weather for a location',
            'inputSchema': {
                'properties': {
                    'location': {'type': 'string'}
                }
            }
        }
    ]
    mock_mcp_manager.select_tools_for_query = Mock(return_value=mock_tools)
    
    # Setup successful MCP call
    successful_call = MCPToolCall(
        server_name='weather_server',
        tool_name='get_weather',
        parameters={'location': 'New York'}
    )
    successful_call.mark_success({'temperature': '72F', 'condition': 'sunny'})
    mock_mcp_manager.call_tools_parallel = AsyncMock(return_value=[successful_call])
    
    # Setup other required methods
    mock_mcp_manager.get_server_status = Mock(return_value={
        'weather_server': {'connected': True, 'tool_count': 1}
    })
    mock_mcp_manager.get_all_tools_flat = Mock(return_value=mock_tools)
    mock_mcp_manager.health_check_servers = AsyncMock(return_value={'weather_server': True})
    
    # Create chat service with MCP integration
    chat_service = ChatService(
        ai_service=mock_ai_service,
        mcp_client_manager=mock_mcp_manager
    )
    
    print("🧪 Testing MCP integration with chat service...")
    
    # Test 1: Basic MCP tool detection
    should_use, tools = await chat_service._should_use_mcp_tools("What's the weather in New York?")
    assert should_use is True
    assert len(tools) == 1
    assert tools[0]['name'] == 'get_weather'
    print("✅ MCP tool detection works correctly")
    
    # Test 2: Complete message processing with MCP
    result = await chat_service.process_message(
        message="What's the weather in New York?",
        conversation_id="test-123"
    )
    
    # Verify MCP integration
    assert result['response'] == "Based on the weather data, it's sunny and 72°F in New York today."
    assert result['mcp_tools_used'] == ['get_weather']
    assert result['tokens_used'] == 25
    print("✅ Complete MCP-enhanced chat processing works")
    
    # Verify MCP manager was called correctly
    mock_mcp_manager.select_tools_for_query.assert_called()
    mock_mcp_manager.call_tools_parallel.assert_called_once()
    
    # Verify tool call parameters
    call_args = mock_mcp_manager.call_tools_parallel.call_args[0][0]
    assert len(call_args) == 1
    assert call_args[0]['server_name'] == 'weather_server'
    assert call_args[0]['tool_name'] == 'get_weather'
    assert 'location' in call_args[0]['parameters']
    print("✅ Parallel tool execution works correctly")
    
    # Test 3: Fallback behavior when MCP unavailable
    chat_service_no_mcp = ChatService(ai_service=mock_ai_service)
    
    result_no_mcp = await chat_service_no_mcp.process_message(
        message="What's the weather in New York?",
        conversation_id="test-456"
    )
    
    # Should still work without MCP
    assert 'response' in result_no_mcp
    assert result_no_mcp['mcp_tools_used'] == []
    print("✅ Fallback behavior when MCP unavailable works")
    
    # Test 4: Health check integration
    health = await chat_service.health_check()
    assert health['chat_service'] is True
    assert health['ai_service'] is True
    assert health['mcp_service'] is True
    print("✅ Health check integration works")
    
    # Test 5: MCP status reporting
    status = chat_service.get_mcp_status()
    assert status['available'] is True
    assert status['total_tools'] == 1
    assert status['connected_servers'] == 1
    print("✅ MCP status reporting works")
    
    # Test 6: Parallel tool execution with multiple tools
    mock_tools_multi = [
        {
            'name': 'get_weather',
            'server_name': 'weather_server',
            'inputSchema': {'properties': {'location': {'type': 'string'}}}
        },
        {
            'name': 'search_info',
            'server_name': 'search_server',
            'inputSchema': {'properties': {'query': {'type': 'string'}}}
        }
    ]
    
    # Setup multiple successful calls
    weather_call = MCPToolCall('weather_server', 'get_weather', {'location': 'NYC'})
    weather_call.mark_success({'temp': '70F'})
    
    search_call = MCPToolCall('search_server', 'search_info', {'query': 'NYC weather'})
    search_call.mark_success({'results': ['Weather info']})
    
    mock_mcp_manager.select_tools_for_query.return_value = mock_tools_multi
    mock_mcp_manager.call_tools_parallel.return_value = [weather_call, search_call]
    
    result_multi = await chat_service.process_message(
        message="Search for weather information about NYC",
        conversation_id="test-789"
    )
    
    assert len(result_multi['mcp_tools_used']) == 2
    assert 'get_weather' in result_multi['mcp_tools_used']
    assert 'search_info' in result_multi['mcp_tools_used']
    print("✅ Multiple parallel tool execution works")
    
    print("🎉 All MCP integration tests passed!")


if __name__ == "__main__":
    asyncio.run(test_mcp_integration())