from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
import uuid

from .message import Message


class Conversation(BaseModel):
    """Conversation model representing a chat conversation with multiple messages"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique conversation identifier")
    messages: List[Message] = Field(default_factory=list, description="List of messages in the conversation")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Conversation creation timestamp")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Last update timestamp")
    
    def add_message(self, message: Message) -> None:
        """Add a message to the conversation"""
        if message.conversation_id != self.id:
            message.conversation_id = self.id
        self.messages.append(message)
        self.updated_at = datetime.now(timezone.utc)
    
    def get_messages_by_sender(self, sender: str) -> List[Message]:
        """Get all messages from a specific sender"""
        return [msg for msg in self.messages if msg.sender == sender]
    
    def get_latest_message(self) -> Optional[Message]:
        """Get the most recent message in the conversation"""
        if not self.messages:
            return None
        return max(self.messages, key=lambda msg: msg.timestamp)
    
    def get_context_messages(self, limit: int = 10) -> List[Message]:
        """Get the most recent messages for context, limited by count"""
        sorted_messages = sorted(self.messages, key=lambda msg: msg.timestamp)
        return sorted_messages[-limit:] if len(sorted_messages) > limit else sorted_messages
    
    @field_validator('messages')
    @classmethod
    def validate_messages_belong_to_conversation(cls, v, info):
        """Ensure all messages belong to this conversation"""
        conversation_id = info.data.get('id') if info.data else None
        if conversation_id:
            for message in v:
                if message.conversation_id != conversation_id:
                    message.conversation_id = conversation_id
        return v
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        json_schema_extra = {
            "example": {
                "id": "conv-123e4567-e89b-12d3-a456-426614174000",
                "messages": [],
                "created_at": "2023-01-01T12:00:00Z",
                "updated_at": "2023-01-01T12:00:00Z"
            }
        }