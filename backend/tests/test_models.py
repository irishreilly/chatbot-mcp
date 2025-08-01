import pytest
from datetime import datetime
from pydantic import ValidationError
import uuid

from backend.models import Message, Conversation, MCPServerConfig, MCPToolCall


class TestMessage:
    """Test cases for Message model"""
    
    def test_message_creation_with_defaults(self):
        """Test creating a message with minimal required fields"""
        message = Message(
            conversation_id="conv-123",
            content="Hello world",
            sender="user"
        )
        
        assert message.conversation_id == "conv-123"
        assert message.content == "Hello world"
        assert message.sender == "user"
        assert isinstance(message.id, str)
        assert isinstance(message.timestamp, datetime)
        assert message.mcp_tools_used == []
    
    def test_message_creation_with_all_fields(self):
        """Test creating a message with all fields specified"""
        timestamp = datetime.utcnow()
        message = Message(
            id="msg-123",
            conversation_id="conv-123",
            content="Hello world",
            sender="assistant",
            timestamp=timestamp,
            mcp_tools_used=["tool1", "tool2"]
        )
        
        assert message.id == "msg-123"
        assert message.conversation_id == "conv-123"
        assert message.content == "Hello world"
        assert message.sender == "assistant"
        assert message.timestamp == timestamp
        assert message.mcp_tools_used == ["tool1", "tool2"]
    
    def test_message_sender_validation(self):
        """Test that sender must be 'user' or 'assistant'"""
        with pytest.raises(ValidationError) as exc_info:
            Message(
                conversation_id="conv-123",
                content="Hello world",
                sender="invalid"
            )
        assert "sender must be either" in str(exc_info.value)
    
    def test_message_content_validation(self):
        """Test content validation rules"""
        # Empty content should fail
        with pytest.raises(ValidationError):
            Message(
                conversation_id="conv-123",
                content="",
                sender="user"
            )
        
        # Whitespace-only content should fail
        with pytest.raises(ValidationError):
            Message(
                conversation_id="conv-123",
                content="   ",
                sender="user"
            )
        
        # Content should be stripped
        message = Message(
            conversation_id="conv-123",
            content="  Hello world  ",
            sender="user"
        )
        assert message.content == "Hello world"
    
    def test_message_content_length_validation(self):
        """Test content length limits"""
        # Very long content should fail
        long_content = "x" * 10001
        with pytest.raises(ValidationError):
            Message(
                conversation_id="conv-123",
                content=long_content,
                sender="user"
            )


class TestConversation:
    """Test cases for Conversation model"""
    
    def test_conversation_creation_with_defaults(self):
        """Test creating a conversation with default values"""
        conversation = Conversation()
        
        assert isinstance(conversation.id, str)
        assert conversation.messages == []
        assert isinstance(conversation.created_at, datetime)
        assert isinstance(conversation.updated_at, datetime)
    
    def test_conversation_add_message(self):
        """Test adding messages to a conversation"""
        conversation = Conversation()
        message = Message(
            conversation_id="different-id",
            content="Hello",
            sender="user"
        )
        
        conversation.add_message(message)
        
        assert len(conversation.messages) == 1
        assert conversation.messages[0] == message
        assert message.conversation_id == conversation.id  # Should be updated
    
    def test_conversation_get_messages_by_sender(self):
        """Test filtering messages by sender"""
        conversation = Conversation()
        user_msg = Message(conversation_id=conversation.id, content="Hello", sender="user")
        assistant_msg = Message(conversation_id=conversation.id, content="Hi", sender="assistant")
        
        conversation.add_message(user_msg)
        conversation.add_message(assistant_msg)
        
        user_messages = conversation.get_messages_by_sender("user")
        assistant_messages = conversation.get_messages_by_sender("assistant")
        
        assert len(user_messages) == 1
        assert len(assistant_messages) == 1
        assert user_messages[0] == user_msg
        assert assistant_messages[0] == assistant_msg
    
    def test_conversation_get_latest_message(self):
        """Test getting the latest message"""
        conversation = Conversation()
        
        # No messages
        assert conversation.get_latest_message() is None
        
        # Add messages with different timestamps
        msg1 = Message(conversation_id=conversation.id, content="First", sender="user")
        msg2 = Message(conversation_id=conversation.id, content="Second", sender="assistant")
        
        conversation.add_message(msg1)
        conversation.add_message(msg2)
        
        latest = conversation.get_latest_message()
        assert latest == msg2  # Should be the most recent
    
    def test_conversation_get_context_messages(self):
        """Test getting context messages with limit"""
        conversation = Conversation()
        
        # Add 15 messages
        for i in range(15):
            msg = Message(
                conversation_id=conversation.id,
                content=f"Message {i}",
                sender="user" if i % 2 == 0 else "assistant"
            )
            conversation.add_message(msg)
        
        # Get last 10 messages
        context = conversation.get_context_messages(limit=10)
        assert len(context) == 10
        
        # Get all messages when limit is higher
        context_all = conversation.get_context_messages(limit=20)
        assert len(context_all) == 15


class TestMCPServerConfig:
    """Test cases for MCPServerConfig model"""
    
    def test_mcp_server_config_creation_with_defaults(self):
        """Test creating MCP server config with minimal fields"""
        config = MCPServerConfig(
            name="test-server",
            endpoint="http://localhost:8001"
        )
        
        assert config.name == "test-server"
        assert config.endpoint == "http://localhost:8001"
        assert config.authentication == {}
        assert config.available_tools == []
        assert config.enabled is True
        assert config.timeout == 30
        assert config.max_retries == 3
    
    def test_mcp_server_config_name_validation(self):
        """Test server name validation"""
        # Empty name should fail
        with pytest.raises(ValidationError):
            MCPServerConfig(name="", endpoint="http://localhost:8001")
        
        # Whitespace-only name should fail
        with pytest.raises(ValidationError):
            MCPServerConfig(name="   ", endpoint="http://localhost:8001")
        
        # Invalid characters should fail
        with pytest.raises(ValidationError):
            MCPServerConfig(name="test@server", endpoint="http://localhost:8001")
        
        # Valid names should work
        valid_names = ["test-server", "test_server", "testserver123", "test-server_123"]
        for name in valid_names:
            config = MCPServerConfig(name=name, endpoint="http://localhost:8001")
            assert config.name == name
    
    def test_mcp_server_config_endpoint_validation(self):
        """Test endpoint validation"""
        # Empty endpoint should fail
        with pytest.raises(ValidationError):
            MCPServerConfig(name="test", endpoint="")
        
        # Whitespace-only endpoint should fail
        with pytest.raises(ValidationError):
            MCPServerConfig(name="test", endpoint="   ")
    
    def test_mcp_server_config_timeout_validation(self):
        """Test timeout validation"""
        # Negative timeout should fail
        with pytest.raises(ValidationError):
            MCPServerConfig(name="test", endpoint="http://localhost:8001", timeout=-1)
        
        # Zero timeout should fail
        with pytest.raises(ValidationError):
            MCPServerConfig(name="test", endpoint="http://localhost:8001", timeout=0)
    
    def test_mcp_server_config_max_retries_validation(self):
        """Test max_retries validation"""
        # Negative retries should fail
        with pytest.raises(ValidationError):
            MCPServerConfig(name="test", endpoint="http://localhost:8001", max_retries=-1)
        
        # Zero retries should be allowed
        config = MCPServerConfig(name="test", endpoint="http://localhost:8001", max_retries=0)
        assert config.max_retries == 0


class TestMCPToolCall:
    """Test cases for MCPToolCall model"""
    
    def test_mcp_tool_call_creation_with_defaults(self):
        """Test creating MCP tool call with minimal fields"""
        tool_call = MCPToolCall(
            server_name="test-server",
            tool_name="test-tool"
        )
        
        assert isinstance(tool_call.id, str)
        assert tool_call.server_name == "test-server"
        assert tool_call.tool_name == "test-tool"
        assert tool_call.parameters == {}
        assert tool_call.result is None
        assert tool_call.error is None
        assert tool_call.execution_time == 0.0
        assert isinstance(tool_call.timestamp, datetime)
        assert tool_call.status == "pending"
    
    def test_mcp_tool_call_name_validation(self):
        """Test server_name and tool_name validation"""
        # Empty server_name should fail
        with pytest.raises(ValidationError):
            MCPToolCall(server_name="", tool_name="test-tool")
        
        # Empty tool_name should fail
        with pytest.raises(ValidationError):
            MCPToolCall(server_name="test-server", tool_name="")
    
    def test_mcp_tool_call_status_validation(self):
        """Test status validation"""
        # Invalid status should fail
        with pytest.raises(ValidationError):
            MCPToolCall(
                server_name="test-server",
                tool_name="test-tool",
                status="invalid"
            )
        
        # Valid statuses should work
        valid_statuses = ['pending', 'success', 'error', 'timeout']
        for status in valid_statuses:
            tool_call = MCPToolCall(
                server_name="test-server",
                tool_name="test-tool",
                status=status
            )
            assert tool_call.status == status
    
    def test_mcp_tool_call_execution_time_validation(self):
        """Test execution_time validation"""
        # Negative execution time should fail
        with pytest.raises(ValidationError):
            MCPToolCall(
                server_name="test-server",
                tool_name="test-tool",
                execution_time=-1.0
            )
    
    def test_mcp_tool_call_mark_success(self):
        """Test marking tool call as successful"""
        tool_call = MCPToolCall(
            server_name="test-server",
            tool_name="test-tool"
        )
        
        result = {"data": "test"}
        tool_call.mark_success(result, 1.5)
        
        assert tool_call.result == result
        assert tool_call.execution_time == 1.5
        assert tool_call.status == "success"
        assert tool_call.error is None
    
    def test_mcp_tool_call_mark_error(self):
        """Test marking tool call as failed"""
        tool_call = MCPToolCall(
            server_name="test-server",
            tool_name="test-tool"
        )
        
        tool_call.mark_error("Connection failed", 2.0)
        
        assert tool_call.error == "Connection failed"
        assert tool_call.execution_time == 2.0
        assert tool_call.status == "error"
        assert tool_call.result is None
    
    def test_mcp_tool_call_mark_timeout(self):
        """Test marking tool call as timed out"""
        tool_call = MCPToolCall(
            server_name="test-server",
            tool_name="test-tool"
        )
        
        tool_call.mark_timeout(30.0)
        
        assert tool_call.error == "Tool call timed out"
        assert tool_call.execution_time == 30.0
        assert tool_call.status == "timeout"
        assert tool_call.result is None