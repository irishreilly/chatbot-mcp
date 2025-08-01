"""
Tests for the error service
"""

import pytest
import asyncio
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from backend.services.error_service import (
    ErrorService, ErrorSeverity, ErrorCategory, ErrorContext, ErrorRecord,
    error_service, log_error, create_error_context, handle_api_errors
)


class TestErrorService:
    """Test cases for ErrorService class"""
    
    def setup_method(self):
        """Setup for each test method"""
        self.service = ErrorService()
        self.service.clear_stats()
    
    def test_log_error_basic(self):
        """Test basic error logging"""
        error = ValueError("Test error")
        error_id = self.service.log_error(error)
        
        assert error_id is not None
        assert isinstance(error_id, str)
        
        stats = self.service.get_error_stats()
        assert stats['total_errors'] == 1
        assert stats['errors_by_category']['system'] == 1
        assert stats['errors_by_severity']['medium'] == 1
    
    def test_log_error_with_context(self):
        """Test error logging with context"""
        error = ValueError("Test error")
        context = ErrorContext(
            user_id="user123",
            session_id="session456",
            endpoint="/api/test"
        )
        
        error_id = self.service.log_error(
            error, 
            ErrorCategory.API, 
            ErrorSeverity.HIGH, 
            context
        )
        
        assert error_id is not None
        
        stats = self.service.get_error_stats()
        assert stats['total_errors'] == 1
        assert stats['errors_by_category']['api'] == 1
        assert stats['errors_by_severity']['high'] == 1
    
    def test_error_categories(self):
        """Test different error categories"""
        errors = [
            (ValueError("API error"), ErrorCategory.API),
            (ConnectionError("DB error"), ErrorCategory.DATABASE),
            (TimeoutError("External error"), ErrorCategory.EXTERNAL_SERVICE),
            (PermissionError("Auth error"), ErrorCategory.AUTHENTICATION),
        ]
        
        for error, category in errors:
            self.service.log_error(error, category)
        
        stats = self.service.get_error_stats()
        assert stats['total_errors'] == 4
        assert stats['errors_by_category']['api'] == 1
        assert stats['errors_by_category']['database'] == 1
        assert stats['errors_by_category']['external_service'] == 1
        assert stats['errors_by_category']['authentication'] == 1
    
    def test_error_severities(self):
        """Test different error severities"""
        severities = [
            ErrorSeverity.LOW,
            ErrorSeverity.MEDIUM,
            ErrorSeverity.HIGH,
            ErrorSeverity.CRITICAL
        ]
        
        for severity in severities:
            error = ValueError(f"Error {severity.value}")
            self.service.log_error(error, ErrorCategory.SYSTEM, severity)
        
        stats = self.service.get_error_stats()
        assert stats['total_errors'] == 4
        assert stats['errors_by_severity']['low'] == 1
        assert stats['errors_by_severity']['medium'] == 1
        assert stats['errors_by_severity']['high'] == 1
        assert stats['errors_by_severity']['critical'] == 1
    
    def test_recent_errors_limit(self):
        """Test recent errors list is limited"""
        # Log more than 100 errors
        for i in range(150):
            error = ValueError(f"Error {i}")
            self.service.log_error(error)
        
        stats = self.service.get_error_stats()
        assert stats['total_errors'] == 150
        assert len(stats['recent_errors']) == 100  # Should be limited to 100
    
    def test_get_recent_errors(self):
        """Test getting recent errors with limit"""
        for i in range(10):
            error = ValueError(f"Error {i}")
            self.service.log_error(error)
        
        recent = self.service.get_recent_errors(5)
        assert len(recent) == 5
        
        # Should get the most recent ones
        assert "Error 9" in recent[-1]['message']
        assert "Error 5" in recent[0]['message']
    
    def test_error_handlers(self):
        """Test error handler registration and execution"""
        handler_called = []
        
        def test_handler(error_record):
            handler_called.append(error_record.id)
        
        self.service.register_error_handler(ErrorCategory.API, test_handler)
        
        error = ValueError("Test error")
        error_id = self.service.log_error(error, ErrorCategory.API)
        
        assert len(handler_called) == 1
        assert handler_called[0] == error_id
    
    def test_error_handler_exception(self):
        """Test that error handler exceptions don't break logging"""
        def failing_handler(error_record):
            raise Exception("Handler failed")
        
        self.service.register_error_handler(ErrorCategory.API, failing_handler)
        
        # Should not raise exception even if handler fails
        error = ValueError("Test error")
        error_id = self.service.log_error(error, ErrorCategory.API)
        
        assert error_id is not None
    
    def test_user_friendly_messages(self):
        """Test user-friendly message generation"""
        test_cases = [
            (ValueError("Invalid input"), ErrorCategory.VALIDATION, "Invalid input"),
            (PermissionError("Access denied"), ErrorCategory.AUTHENTICATION, "Authentication failed"),
            (ConnectionError("Connection failed"), ErrorCategory.EXTERNAL_SERVICE, "External service"),
            (TimeoutError("Timeout"), ErrorCategory.AI_SERVICE, "AI service"),
            (Exception("Generic error"), ErrorCategory.DATABASE, "Database error"),
        ]
        
        for error, category, expected_text in test_cases:
            message = self.service.create_user_friendly_message(error, category)
            assert expected_text.lower() in message.lower()
    
    @pytest.mark.asyncio
    async def test_error_context_manager(self):
        """Test error context manager"""
        with pytest.raises(ValueError):
            async with self.service.error_context(ErrorCategory.API, ErrorSeverity.HIGH):
                raise ValueError("Context error")
        
        stats = self.service.get_error_stats()
        assert stats['total_errors'] == 1
        assert stats['errors_by_category']['api'] == 1
        assert stats['errors_by_severity']['high'] == 1
    
    @pytest.mark.asyncio
    async def test_error_context_manager_success(self):
        """Test error context manager with no errors"""
        async with self.service.error_context(ErrorCategory.API):
            pass  # No error
        
        stats = self.service.get_error_stats()
        assert stats['total_errors'] == 0


class TestErrorServiceFunctions:
    """Test module-level functions"""
    
    def setup_method(self):
        """Setup for each test method"""
        error_service.clear_stats()
    
    def test_log_error_function(self):
        """Test log_error convenience function"""
        error = ValueError("Test error")
        error_id = log_error(error, ErrorCategory.API, ErrorSeverity.HIGH)
        
        assert error_id is not None
        
        stats = error_service.get_error_stats()
        assert stats['total_errors'] == 1
    
    def test_create_error_context(self):
        """Test create_error_context function"""
        # Mock request object
        mock_request = Mock()
        mock_request.url = "http://test.com/api/test"
        mock_request.method = "POST"
        mock_request.client.host = "127.0.0.1"
        mock_request.headers = {"user-agent": "test-agent"}
        
        context = create_error_context(
            request=mock_request,
            user_id="user123",
            session_id="session456"
        )
        
        assert context.endpoint == "http://test.com/api/test"
        assert context.method == "POST"
        assert context.ip_address == "127.0.0.1"
        assert context.user_agent == "test-agent"
        assert context.user_id == "user123"
        assert context.session_id == "session456"
    
    def test_create_error_context_no_request(self):
        """Test create_error_context without request"""
        context = create_error_context(user_id="user123")
        
        assert context.user_id == "user123"
        assert context.endpoint is None
        assert context.method is None
    
    @pytest.mark.asyncio
    async def test_handle_api_errors_decorator(self):
        """Test handle_api_errors decorator"""
        @handle_api_errors(ErrorCategory.API, ErrorSeverity.HIGH)
        async def test_function():
            raise ValueError("Decorated error")
        
        with pytest.raises(ValueError):
            await test_function()
        
        stats = error_service.get_error_stats()
        assert stats['total_errors'] == 1
        assert stats['errors_by_category']['api'] == 1
        assert stats['errors_by_severity']['high'] == 1
    
    @pytest.mark.asyncio
    async def test_handle_api_errors_decorator_success(self):
        """Test handle_api_errors decorator with successful function"""
        @handle_api_errors(ErrorCategory.API, ErrorSeverity.HIGH)
        async def test_function():
            return "success"
        
        result = await test_function()
        assert result == "success"
        
        stats = error_service.get_error_stats()
        assert stats['total_errors'] == 0


class TestErrorRecord:
    """Test ErrorRecord dataclass"""
    
    def test_error_record_creation(self):
        """Test ErrorRecord creation"""
        context = ErrorContext(user_id="user123")
        record = ErrorRecord(
            id="error123",
            timestamp="2023-01-01T00:00:00Z",
            message="Test error",
            category=ErrorCategory.API,
            severity=ErrorSeverity.HIGH,
            error_type="ValueError",
            context=context
        )
        
        assert record.id == "error123"
        assert record.message == "Test error"
        assert record.category == ErrorCategory.API
        assert record.severity == ErrorSeverity.HIGH
        assert record.error_type == "ValueError"
        assert record.context.user_id == "user123"
        assert record.resolved is False
    
    def test_error_record_dict_conversion(self):
        """Test ErrorRecord to dict conversion"""
        from dataclasses import asdict
        
        record = ErrorRecord(
            id="error123",
            timestamp="2023-01-01T00:00:00Z",
            message="Test error",
            category=ErrorCategory.API,
            severity=ErrorSeverity.HIGH,
            error_type="ValueError"
        )
        
        record_dict = asdict(record)
        assert record_dict['id'] == "error123"
        assert record_dict['message'] == "Test error"
        assert record_dict['category'] == ErrorCategory.API
        assert record_dict['severity'] == ErrorSeverity.HIGH


class TestErrorContext:
    """Test ErrorContext dataclass"""
    
    def test_error_context_creation(self):
        """Test ErrorContext creation"""
        context = ErrorContext(
            user_id="user123",
            session_id="session456",
            request_id="req789",
            endpoint="/api/test",
            method="POST",
            ip_address="127.0.0.1",
            user_agent="test-agent",
            additional_data={"key": "value"}
        )
        
        assert context.user_id == "user123"
        assert context.session_id == "session456"
        assert context.request_id == "req789"
        assert context.endpoint == "/api/test"
        assert context.method == "POST"
        assert context.ip_address == "127.0.0.1"
        assert context.user_agent == "test-agent"
        assert context.additional_data == {"key": "value"}
    
    def test_error_context_defaults(self):
        """Test ErrorContext with default values"""
        context = ErrorContext()
        
        assert context.user_id is None
        assert context.session_id is None
        assert context.request_id is None
        assert context.endpoint is None
        assert context.method is None
        assert context.ip_address is None
        assert context.user_agent is None
        assert context.additional_data is None