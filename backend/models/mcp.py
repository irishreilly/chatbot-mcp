from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field, field_validator
import uuid


class MCPServerConfig(BaseModel):
    """Configuration model for MCP servers"""
    name: str = Field(..., description="Unique name identifier for the MCP server")
    endpoint: str = Field(..., description="Server endpoint URL or connection string")
    authentication: Dict[str, Any] = Field(default_factory=dict, description="Authentication configuration")
    available_tools: List[str] = Field(default_factory=list, description="List of available tool names")
    enabled: bool = Field(default=True, description="Whether the server is enabled")
    timeout: int = Field(default=30, description="Request timeout in seconds")
    max_retries: int = Field(default=3, description="Maximum number of retry attempts")
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('name cannot be empty')
        # Ensure name is a valid identifier
        if not v.replace('-', '').replace('_', '').isalnum():
            raise ValueError('name must contain only alphanumeric characters, hyphens, and underscores')
        return v.strip()
    
    @field_validator('endpoint')
    @classmethod
    def validate_endpoint(cls, v):
        if not v.strip():
            raise ValueError('endpoint cannot be empty')
        return v.strip()
    
    @field_validator('timeout')
    @classmethod
    def validate_timeout(cls, v):
        if v <= 0:
            raise ValueError('timeout must be positive')
        return v
    
    @field_validator('max_retries')
    @classmethod
    def validate_max_retries(cls, v):
        if v < 0:
            raise ValueError('max_retries cannot be negative')
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "weather-server",
                "endpoint": "http://localhost:8001",
                "authentication": {"api_key": "secret"},
                "available_tools": ["get_weather", "get_forecast"],
                "enabled": True,
                "timeout": 30,
                "max_retries": 3
            }
        }


class MCPToolCall(BaseModel):
    """Model representing an MCP tool call and its result"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique tool call identifier")
    server_name: str = Field(..., description="Name of the MCP server")
    tool_name: str = Field(..., description="Name of the tool being called")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Parameters passed to the tool")
    result: Optional[Any] = Field(default=None, description="Result returned by the tool")
    error: Optional[str] = Field(default=None, description="Error message if the call failed")
    execution_time: float = Field(default=0.0, description="Execution time in seconds")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="When the tool call was made")
    status: str = Field(default="pending", description="Status of the tool call")
    
    @field_validator('server_name', 'tool_name')
    @classmethod
    def validate_names(cls, v):
        if not v.strip():
            raise ValueError('server_name and tool_name cannot be empty')
        return v.strip()
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        valid_statuses = ['pending', 'success', 'error', 'timeout']
        if v not in valid_statuses:
            raise ValueError(f'status must be one of: {valid_statuses}')
        return v
    
    @field_validator('execution_time')
    @classmethod
    def validate_execution_time(cls, v):
        if v < 0:
            raise ValueError('execution_time cannot be negative')
        return v
    
    def mark_success(self, result: Any, execution_time: float) -> None:
        """Mark the tool call as successful"""
        self.result = result
        self.execution_time = execution_time
        self.status = "success"
        self.error = None
    
    def mark_error(self, error_message: str, execution_time: float = 0.0) -> None:
        """Mark the tool call as failed"""
        self.error = error_message
        self.execution_time = execution_time
        self.status = "error"
        self.result = None
    
    def mark_timeout(self, execution_time: float) -> None:
        """Mark the tool call as timed out"""
        self.error = "Tool call timed out"
        self.execution_time = execution_time
        self.status = "timeout"
        self.result = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        json_schema_extra = {
            "example": {
                "id": "tool-123e4567-e89b-12d3-a456-426614174000",
                "server_name": "weather-server",
                "tool_name": "get_weather",
                "parameters": {"location": "New York", "units": "metric"},
                "result": {"temperature": 22, "condition": "sunny"},
                "error": None,
                "execution_time": 1.5,
                "timestamp": "2023-01-01T12:00:00Z",
                "status": "success"
            }
        }