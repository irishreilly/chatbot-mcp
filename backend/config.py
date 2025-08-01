import os
from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # API Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = False
    
    # AI Service Configuration
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    
    # Timeout Configuration
    ai_service_timeout: int = 45
    mcp_client_timeout: int = 40
    
    # MCP Configuration
    mcp_config_path: str = "mcp_config.json"
    
    class Config:
        # Look for .env in multiple locations
        env_file = [".env", "../.env"]

settings = Settings()