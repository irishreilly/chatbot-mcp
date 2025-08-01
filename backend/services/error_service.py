"""
Error Service - Centralized error handling and logging for the backend
"""

import logging
import traceback
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from enum import Enum
from dataclasses import dataclass, asdict


class ErrorSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ErrorCategory(Enum):
    API = "api"
    DATABASE = "database"
    EXTERNAL_SERVICE = "external_service"
    VALIDATION = "validation"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    BUSINESS_LOGIC = "business_logic"
    SYSTEM = "system"
    MCP = "mcp"
    AI_SERVICE = "ai_service"


@dataclass
class ErrorContext:
    """Context information for an error"""
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    additional_data: Optional[Dict[str, Any]] = None


class ErrorService:
    """
    Centralized error handling and logging service
    """
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.error_stats = {
            'total_errors': 0,
            'errors_by_category': {},
            'errors_by_severity': {},
            'recent_errors': []
        }
    
    def log_error(self, 
                  error: Exception, 
                  category: ErrorCategory = ErrorCategory.SYSTEM,
                  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
                  context: Optional[ErrorContext] = None,
                  additional_data: Optional[Dict[str, Any]] = None) -> str:
        """Log an error with structured information"""
        error_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Update statistics
        self.error_stats['total_errors'] += 1
        
        category_key = category.value
        self.error_stats['errors_by_category'][category_key] = \
            self.error_stats['errors_by_category'].get(category_key, 0) + 1
        
        severity_key = severity.value
        self.error_stats['errors_by_severity'][severity_key] = \
            self.error_stats['errors_by_severity'].get(severity_key, 0) + 1
        
        # Log based on severity
        log_data = {
            'error_id': error_id,
            'category': category.value,
            'severity': severity.value,
            'message': str(error),
            'type': type(error).__name__,
            'context': asdict(context) if context else None,
            'additional_data': additional_data
        }
        
        if severity == ErrorSeverity.CRITICAL:
            self.logger.critical(f"CRITICAL ERROR: {json.dumps(log_data, indent=2)}")
        elif severity == ErrorSeverity.HIGH:
            self.logger.error(f"HIGH SEVERITY ERROR: {json.dumps(log_data, indent=2)}")
        elif severity == ErrorSeverity.MEDIUM:
            self.logger.warning(f"MEDIUM SEVERITY ERROR: {json.dumps(log_data, indent=2)}")
        else:
            self.logger.info(f"LOW SEVERITY ERROR: {json.dumps(log_data, indent=2)}")
        
        return error_id
    
    def get_error_stats(self) -> Dict[str, Any]:
        """Get current error statistics"""
        return self.error_stats.copy()
    
    def get_recent_errors(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent errors"""
        return self.error_stats['recent_errors'][-limit:]
    
    def clear_stats(self):
        """Clear error statistics (for testing)"""
        self.error_stats = {
            'total_errors': 0,
            'errors_by_category': {},
            'errors_by_severity': {},
            'recent_errors': []
        }
    
    def create_user_friendly_message(self, 
                                   error: Exception, 
                                   category: ErrorCategory) -> str:
        """Create user-friendly error message"""
        if category == ErrorCategory.VALIDATION:
            return f"Invalid input: {str(error)}"
        elif category == ErrorCategory.AUTHENTICATION:
            return "Authentication failed. Please check your credentials."
        elif category == ErrorCategory.AUTHORIZATION:
            return "You don't have permission to perform this action."
        elif category == ErrorCategory.EXTERNAL_SERVICE:
            return "External service is temporarily unavailable. Please try again later."
        elif category == ErrorCategory.AI_SERVICE:
            return "AI service is experiencing issues. Please try again later."
        elif category == ErrorCategory.MCP:
            return "Tool service is temporarily unavailable. Continuing with basic response."
        elif category == ErrorCategory.DATABASE:
            return "Database error occurred. Please try again later."
        else:
            return "An unexpected error occurred. Please try again later."


# Global error service instance
error_service = ErrorService()


# Convenience functions
def log_error(error: Exception, 
              category: ErrorCategory = ErrorCategory.SYSTEM,
              severity: ErrorSeverity = ErrorSeverity.MEDIUM,
              context: Optional[ErrorContext] = None,
              additional_data: Optional[Dict[str, Any]] = None) -> str:
    """Convenience function to log an error"""
    return error_service.log_error(error, category, severity, context, additional_data)


def create_error_context(**kwargs) -> ErrorContext:
    """Create error context from additional data"""
    # Filter kwargs to only include valid ErrorContext fields
    valid_fields = {
        'user_id', 'session_id', 'request_id', 'endpoint', 'method', 
        'ip_address', 'user_agent', 'additional_data'
    }
    
    filtered_kwargs = {}
    additional_data = {}
    
    for key, value in kwargs.items():
        if key in valid_fields:
            filtered_kwargs[key] = value
        else:
            additional_data[key] = value
    
    if additional_data:
        filtered_kwargs['additional_data'] = additional_data
    
    return ErrorContext(**filtered_kwargs)


# Error handler decorators
def handle_api_errors(category: ErrorCategory = ErrorCategory.API,
                     severity: ErrorSeverity = ErrorSeverity.MEDIUM):
    """Decorator to automatically handle and log API errors"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                error_id = log_error(e, category, severity)
                # Re-raise the exception to be handled by FastAPI
                raise
        return wrapper
    return decorator