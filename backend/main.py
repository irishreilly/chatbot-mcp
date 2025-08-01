# Main FastAPI application entry point
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import traceback
import time
import uuid
from datetime import datetime, timezone

from config import settings
from models import Message, Conversation
from services.ai_service import AIService, AIProvider, AIServiceError, AIProviderError
from services.error_service import (
    error_service, log_error, create_error_context,
    ErrorCategory, ErrorSeverity, handle_api_errors
)

# In-memory storage for conversations (temporary until we add proper persistence)
conversations: Dict[str, Conversation] = {}

# Initialize AI service
ai_service: Optional[AIService] = None

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Pydantic models for API requests and responses
class HealthResponse(BaseModel):
    status: str
    timestamp: float
    version: str

class ErrorResponse(BaseModel):
    error: Dict[str, Any]

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000, description="User message")
    conversation_id: Optional[str] = Field(None, description="Optional conversation ID")

class ChatResponse(BaseModel):
    response: str = Field(..., description="AI response")
    conversation_id: str = Field(..., description="Conversation ID")
    mcp_tools_used: List[str] = Field(default_factory=list, description="MCP tools used")
    timestamp: str = Field(..., description="Response timestamp")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global ai_service
    logger.info("Starting MCP Chatbot API server")
    
    # Initialize AI service
    try:
        # Try OpenAI first, fallback to Anthropic if available
        if settings.openai_api_key:
            ai_service = AIService(provider=AIProvider.OPENAI, timeout=settings.ai_service_timeout)
            logger.info("AI service initialized with OpenAI provider")
            logger.info(f"AI service object: {ai_service}")
        elif settings.anthropic_api_key:
            ai_service = AIService(provider=AIProvider.ANTHROPIC, timeout=settings.ai_service_timeout)
            logger.info("AI service initialized with Anthropic provider")
            logger.info(f"AI service object: {ai_service}")
        else:
            logger.warning("No AI API keys configured - AI service will not be available")
        
        # MCP connections temporarily disabled
        # if ai_service:
        #     try:
        #         await ai_service.initialize_mcp_connections()
        #         logger.info("MCP connections initialized")
        #     except Exception as e:
        #         logger.warning(f"Failed to initialize MCP connections: {e}")
    except Exception as e:
        logger.error(f"Failed to initialize AI service: {e}")
        import traceback
        logger.error(traceback.format_exc())
        ai_service = None
    
    logger.info(f"Final ai_service value: {ai_service}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down MCP Chatbot API server")

app = FastAPI(
    title="MCP Chatbot API",
    version="1.0.0",
    description="A chatbot API with Model Context Protocol integration",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"],  # Frontend dev servers
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Create error context
    context = create_error_context(
        request=request,
        request_id=getattr(request.state, 'request_id', None)
    )
    
    # Log error with structured information
    if isinstance(exc, HTTPException):
        # Log HTTP exceptions with appropriate severity
        severity = ErrorSeverity.LOW if exc.status_code < 500 else ErrorSeverity.HIGH
        error_id = log_error(exc, ErrorCategory.API, severity, context)
        
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(error={
                "code": f"HTTP_{exc.status_code}",
                "message": exc.detail,
                "error_id": error_id
            }).dict()
        )
    else:
        # Log unexpected errors as critical
        error_id = log_error(exc, ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL, context)
        
        # Create user-friendly message
        user_message = error_service.create_user_friendly_message(exc, ErrorCategory.SYSTEM)
        
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(error={
                "code": "INTERNAL_SERVER_ERROR",
                "message": user_message,
                "error_id": error_id
            }).dict()
        )

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    # Log request
    logger.info(f"Request: {request.method} {request.url}")
    
    response = await call_next(request)
    
    # Log response
    process_time = time.time() - start_time
    logger.info(f"Response: {response.status_code} - {process_time:.4f}s")
    
    return response

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint to verify API is running"""
    return HealthResponse(
        status="healthy",
        timestamp=time.time(),
        version="1.0.0"
    )

@app.get("/api/errors/stats")
async def get_error_stats():
    """Get error statistics for monitoring"""
    return error_service.get_error_stats()

@app.get("/api/errors/recent")
async def get_recent_errors(limit: int = 50):
    """Get recent errors for debugging"""
    return error_service.get_recent_errors(limit)

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process chat messages and return AI responses"""
    # Create error context for this request
    context = create_error_context(
        conversation_id=request.conversation_id,
        message_length=len(request.message)
    )
    
    try:
        # Get or create conversation
        conversation_id = request.conversation_id or str(uuid.uuid4())
        
        if conversation_id not in conversations:
            conversations[conversation_id] = Conversation(id=conversation_id)
        
        conversation = conversations[conversation_id]
        
        # Add user message to conversation
        user_message = Message(
            conversation_id=conversation_id,
            content=request.message,
            sender="user"
        )
        conversation.add_message(user_message)
        
        # Generate AI response
        ai_response_content = "I'm sorry, but the AI service is not available at the moment."
        mcp_tools_used = []
        
        if ai_service:
            try:
                # Generate AI response using the conversation context
                ai_response = await ai_service.generate_response(
                    prompt=request.message,
                    conversation=conversation
                )
                ai_response_content = ai_response.content
                mcp_tools_used = ai_response.mcp_tools_used or []
                logger.info(f"AI response generated using {ai_response.provider} ({ai_response.model})")
                
                # Log MCP tools used
                if mcp_tools_used:
                    logger.info(f"MCP tools used: {mcp_tools_used}")
                
                # Log token usage if available
                if ai_response.tokens_used:
                    logger.info(f"Tokens used: {ai_response.tokens_used}")
                    
            except asyncio.TimeoutError as e:
                log_error(e, ErrorCategory.AI_SERVICE, ErrorSeverity.MEDIUM, context)
                ai_response_content = "I'm experiencing some technical difficulties due to a timeout. This may be due to slow external services like Grafana. Please try again later or try a simpler query."
            except AIServiceError as e:
                log_error(e, ErrorCategory.AI_SERVICE, ErrorSeverity.HIGH, context)
                ai_response_content = error_service.create_user_friendly_message(e, ErrorCategory.AI_SERVICE)
            except AIProviderError as e:
                log_error(e, ErrorCategory.EXTERNAL_SERVICE, ErrorSeverity.HIGH, context)
                ai_response_content = error_service.create_user_friendly_message(e, ErrorCategory.EXTERNAL_SERVICE)
            except Exception as e:
                log_error(e, ErrorCategory.AI_SERVICE, ErrorSeverity.CRITICAL, context)
                ai_response_content = "An unexpected error occurred. Please try again later."
        else:
            logger.warning("AI service not available - returning fallback response")
        
        # Add AI response to conversation
        ai_message = Message(
            conversation_id=conversation_id,
            content=ai_response_content,
            sender="assistant",
            mcp_tools_used=mcp_tools_used
        )
        conversation.add_message(ai_message)
        
        # Return formatted response
        return ChatResponse(
            response=ai_response_content,
            conversation_id=conversation_id,
            mcp_tools_used=mcp_tools_used,
            timestamp=datetime.now(timezone.utc).isoformat()
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Log unexpected errors
        error_id = log_error(e, ErrorCategory.API, ErrorSeverity.CRITICAL, context)
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Failed to process chat message",
                "error_id": error_id
            }
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host=settings.api_host, 
        port=settings.api_port,
        log_level="info" if not settings.debug else "debug"
    )