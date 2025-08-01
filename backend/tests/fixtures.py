"""
Test fixtures and data for comprehensive testing
"""

import pytest
import asyncio
from datetime import datetime, timezone
from typing import Dict, List, Any
from unittest.mock import Mock, AsyncMock

from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.mcp import MCPServerConfig, MCPToolCall
from backend.services.error_service import ErrorContext, ErrorRecord, ErrorCategory, ErrorSeverity


class TestDataFactory:
    """Factory for creating test data"""
    
    @staticmethod
    def create_message(
        content: str = "Test message",
        sender: str = "user",
        conversation_id: str = "test-conv-123",
        mcp_tools_used: List[str] = None
    ) -> Message:
        """Create a test message"""
        return Message(
            conversation_id=conversation_id,
            content=content,
            sender=sender,
            mcp_tools_used=mcp_tools_used or []
        )
    
    @staticmethod
    def create_conversation(
        conversation_id: str = "test-conv-123",
        message_count: int = 0
    ) -> Conversation:
        """Create a test conversation with optional messages"""
        conversation = Conversation(id=conversation_id)
        
        for i in range(message_count):
            user_msg = TestDataFactory.create_message(
                content=f"User message {i + 1}",
                sender="user",
                conversation_id=conversation_id
            )
            assistant_msg = TestDataFactory.create_message(
                content=f"Assistant response {i + 1}",
                sender="assistant",
                conversation_id=conversation_id
            )
            conversation.add_message(user_msg)
            conversation.add_message(assistant_msg)
        
        return conversation
    
    @staticmethod
    def create_mcp_server_config(
        name: str = "test-server",
        endpoint: str = "http://localhost:8080",
        enabled: bool = True
    ) -> MCPServerConfig:
        """Create a test MCP server configuration"""
        return MCPServerConfig(
            name=name,
            endpoint=endpoint,
            authentication={},
            available_tools=["test-tool-1", "test-tool-2"],
            enabled=enabled
        )
    
    @staticmethod
    def create_mcp_tool_call(
        server_name: str = "test-server",
        tool_name: str = "test-tool",
        status: str = "success",
        result: Any = None
    ) -> MCPToolCall:
        """Create a test MCP tool call"""
        return MCPToolCall(
            server_name=server_name,
            tool_name=tool_name,
            parameters={"test_param": "test_value"},
            result=result or {"test_result": "success"},
            status=status,
            execution_time=0.1,
            error=None if status == "success" else "Test error"
        )
    
    @staticmethod
    def create_error_context(
        user_id: str = "test-user-123",
        session_id: str = "test-session-456",
        endpoint: str = "/api/test"
    ) -> ErrorContext:
        """Create a test error context"""
        return ErrorContext(
            user_id=user_id,
            session_id=session_id,
            request_id="test-request-789",
            endpoint=endpoint,
            method="POST",
            ip_address="127.0.0.1",
            user_agent="test-agent/1.0",
            additional_data={"test_key": "test_value"}
        )
    
    @staticmethod
    def create_error_record(
        message: str = "Test error",
        category: ErrorCategory = ErrorCategory.SYSTEM,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM
    ) -> ErrorRecord:
        """Create a test error record"""
        return ErrorRecord(
            id="test-error-123",
            timestamp=datetime.now(timezone.utc).isoformat(),
            message=message,
            category=category,
            severity=severity,
            error_type="TestError",
            stack_trace="Test stack trace",
            context=TestDataFactory.create_error_context()
        )


class MockServices:
    """Mock services for testing"""
    
    @staticmethod
    def create_mock_ai_service():
        """Create a mock AI service"""
        mock_service = Mock()
        mock_service.generate_response = AsyncMock()
        mock_service.generate_response.return_value = Mock(
            content="Mock AI response",
            provider="mock",
            model="mock-model",
            tokens_used={"prompt": 10, "completion": 20, "total": 30}
        )
        mock_service.get_available_providers.return_value = ["mock"]
        return mock_service
    
    @staticmethod
    def create_mock_mcp_client_manager():
        """Create a mock MCP client manager"""
        mock_manager = Mock()
        mock_manager.call_tools_parallel = AsyncMock()
        mock_manager.call_tools_parallel.return_value = [
            TestDataFactory.create_mcp_tool_call()
        ]
        mock_manager.select_tools_for_query.return_value = [
            {
                "server_name": "test-server",
                "name": "test-tool",
                "inputSchema": {"properties": {"query": {"type": "string"}}}
            }
        ]
        mock_manager.get_server_status.return_value = {
            "test-server": {"connected": True, "tool_count": 2}
        }
        mock_manager.health_check_servers = AsyncMock()
        mock_manager.health_check_servers.return_value = {
            "test-server": True
        }
        return mock_manager
    
    @staticmethod
    def create_mock_chat_service():
        """Create a mock chat service"""
        mock_service = Mock()
        mock_service.process_message = AsyncMock()
        mock_service.process_message.return_value = {
            "response": "Mock chat response",
            "conversation_id": "test-conv-123",
            "mcp_tools_used": [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "ai_provider": "mock",
            "ai_model": "mock-model",
            "tokens_used": {"total": 30}
        }
        mock_service.get_mcp_status.return_value = {
            "available": True,
            "servers": {"test-server": {"connected": True}},
            "total_tools": 2
        }
        mock_service.health_check = AsyncMock()
        mock_service.health_check.return_value = {
            "chat_service": True,
            "ai_service": True,
            "mcp_service": True
        }
        return mock_service


class TestScenarios:
    """Pre-defined test scenarios"""
    
    @staticmethod
    def simple_chat_scenario():
        """Simple chat interaction scenario"""
        return {
            "user_message": "Hello, how are you?",
            "expected_response_contains": ["hello", "how", "help"],
            "conversation_id": None,
            "should_use_mcp": False
        }
    
    @staticmethod
    def mcp_weather_scenario():
        """Weather query that should use MCP tools"""
        return {
            "user_message": "What's the weather like in New York?",
            "expected_response_contains": ["weather", "temperature"],
            "conversation_id": None,
            "should_use_mcp": True,
            "expected_tools": ["weather-tool"]
        }
    
    @staticmethod
    def conversation_context_scenario():
        """Multi-turn conversation with context"""
        return [
            {
                "user_message": "My name is Alice",
                "expected_response_contains": ["alice", "nice", "meet"]
            },
            {
                "user_message": "What's my name?",
                "expected_response_contains": ["alice", "name"]
            }
        ]
    
    @staticmethod
    def error_scenarios():
        """Various error scenarios"""
        return [
            {
                "name": "empty_message",
                "request": {"message": ""},
                "expected_status": 422
            },
            {
                "name": "missing_message",
                "request": {},
                "expected_status": 422
            },
            {
                "name": "too_long_message",
                "request": {"message": "x" * 20000},
                "expected_status": 422
            },
            {
                "name": "invalid_conversation_id",
                "request": {
                    "message": "Test",
                    "conversation_id": "invalid-format"
                },
                "expected_status": 200  # Should create new conversation
            }
        ]
    
    @staticmethod
    def performance_scenarios():
        """Performance testing scenarios"""
        return {
            "concurrent_users": 10,
            "messages_per_user": 5,
            "max_response_time": 5.0,
            "min_success_rate": 0.95
        }


@pytest.fixture
def test_message():
    """Fixture for a test message"""
    return TestDataFactory.create_message()


@pytest.fixture
def test_conversation():
    """Fixture for a test conversation"""
    return TestDataFactory.create_conversation(message_count=3)


@pytest.fixture
def test_mcp_config():
    """Fixture for MCP server configuration"""
    return TestDataFactory.create_mcp_server_config()


@pytest.fixture
def test_error_context():
    """Fixture for error context"""
    return TestDataFactory.create_error_context()


@pytest.fixture
def mock_ai_service():
    """Fixture for mock AI service"""
    return MockServices.create_mock_ai_service()


@pytest.fixture
def mock_mcp_manager():
    """Fixture for mock MCP client manager"""
    return MockServices.create_mock_mcp_client_manager()


@pytest.fixture
def mock_chat_service():
    """Fixture for mock chat service"""
    return MockServices.create_mock_chat_service()


@pytest.fixture
def chat_scenarios():
    """Fixture for chat test scenarios"""
    return {
        "simple": TestScenarios.simple_chat_scenario(),
        "weather": TestScenarios.mcp_weather_scenario(),
        "conversation": TestScenarios.conversation_context_scenario(),
        "errors": TestScenarios.error_scenarios(),
        "performance": TestScenarios.performance_scenarios()
    }


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


class TestCleanup:
    """Utilities for test cleanup"""
    
    @staticmethod
    def clear_conversations():
        """Clear all test conversations"""
        # This would clear the in-memory conversation storage
        # In a real implementation, this might clear a database
        from backend.main import conversations
        conversations.clear()
    
    @staticmethod
    def clear_error_logs():
        """Clear error service logs"""
        from backend.services.error_service import error_service
        error_service.clear_stats()
    
    @staticmethod
    def reset_all():
        """Reset all test state"""
        TestCleanup.clear_conversations()
        TestCleanup.clear_error_logs()


@pytest.fixture(autouse=True)
def cleanup_after_test():
    """Automatically cleanup after each test"""
    yield
    TestCleanup.reset_all()


# Pytest markers for different test categories
pytest.mark.unit = pytest.mark.unit
pytest.mark.integration = pytest.mark.integration
pytest.mark.e2e = pytest.mark.e2e
pytest.mark.performance = pytest.mark.performance
pytest.mark.slow = pytest.mark.slow