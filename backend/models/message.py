from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
import uuid


class Message(BaseModel):
    """Message model representing a single chat message"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique message identifier")
    conversation_id: str = Field(..., description="ID of the conversation this message belongs to")
    content: str = Field(..., min_length=1, max_length=10000, description="Message content")
    sender: str = Field(..., description="Message sender: 'user' or 'assistant'")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Message timestamp")
    mcp_tools_used: List[str] = Field(default_factory=list, description="List of MCP tools used for this message")
    
    @field_validator('sender')
    @classmethod
    def validate_sender(cls, v):
        if v not in ['user', 'assistant']:
            raise ValueError('sender must be either "user" or "assistant"')
        return v
    
    @field_validator('content')
    @classmethod
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError('content cannot be empty or only whitespace')
        return v.strip()
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "conversation_id": "conv-123",
                "content": "Hello, how can I help you?",
                "sender": "assistant",
                "timestamp": "2023-01-01T12:00:00Z",
                "mcp_tools_used": ["weather-tool", "search-tool"]
            }
        }