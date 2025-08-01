"""
Performance tests for concurrent chat sessions and load testing
"""

import pytest
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch
import httpx
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.error_service import error_service


class TestPerformance:
    """Performance and load testing"""
    
    def setup_method(self):
        """Setup for each test method"""
        error_service.clear_stats()
        self.client = TestClient(app)
    
    def test_single_chat_request_performance(self):
        """Test performance of a single chat request"""
        start_time = time.time()
        
        response = self.client.post("/api/chat", json={
            "message": "Hello, how are you?"
        })
        
        end_time = time.time()
        response_time = end_time - start_time
        
        assert response.status_code == 200
        assert response_time < 5.0  # Should respond within 5 seconds
        
        data = response.json()
        assert "response" in data
        assert "conversation_id" in data
        assert "timestamp" in data
    
    def test_concurrent_chat_requests(self):
        """Test handling of concurrent chat requests"""
        def make_chat_request(message_id):
            response = self.client.post("/api/chat", json={
                "message": f"Test message {message_id}"
            })
            return response.status_code, response.json()
        
        # Test with 10 concurrent requests
        num_requests = 10
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=num_requests) as executor:
            futures = [
                executor.submit(make_chat_request, i) 
                for i in range(num_requests)
            ]
            results = [future.result() for future in futures]
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # All requests should succeed
        for status_code, data in results:
            assert status_code == 200
            assert "response" in data
        
        # Should handle concurrent requests efficiently
        assert total_time < 15.0  # All requests within 15 seconds
        
        # Each request should have unique conversation IDs
        conversation_ids = [data["conversation_id"] for _, data in results]
        assert len(set(conversation_ids)) == num_requests
    
    def test_conversation_memory_usage(self):
        """Test memory usage with multiple conversations"""
        conversation_ids = []
        
        # Create multiple conversations
        for i in range(50):
            response = self.client.post("/api/chat", json={
                "message": f"Start conversation {i}"
            })
            assert response.status_code == 200
            data = response.json()
            conversation_ids.append(data["conversation_id"])
        
        # Add messages to each conversation
        for conv_id in conversation_ids[:10]:  # Test first 10 conversations
            for j in range(5):  # 5 messages each
                response = self.client.post("/api/chat", json={
                    "message": f"Message {j} in conversation",
                    "conversation_id": conv_id
                })
                assert response.status_code == 200
        
        # All conversations should still be accessible
        assert len(set(conversation_ids)) == 50
    
    def test_large_message_handling(self):
        """Test handling of large messages"""
        # Create a large message (close to limit)
        large_message = "This is a test message. " * 400  # ~9600 characters
        
        start_time = time.time()
        response = self.client.post("/api/chat", json={
            "message": large_message
        })
        end_time = time.time()
        
        assert response.status_code == 200
        assert end_time - start_time < 10.0  # Should handle large messages efficiently
        
        data = response.json()
        assert "response" in data
    
    def test_rapid_sequential_requests(self):
        """Test rapid sequential requests from same conversation"""
        # Create initial conversation
        response = self.client.post("/api/chat", json={
            "message": "Start conversation"
        })
        assert response.status_code == 200
        conversation_id = response.json()["conversation_id"]
        
        # Send rapid sequential messages
        start_time = time.time()
        for i in range(20):
            response = self.client.post("/api/chat", json={
                "message": f"Rapid message {i}",
                "conversation_id": conversation_id
            })
            assert response.status_code == 200
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Should handle rapid requests efficiently
        assert total_time < 30.0  # 20 requests within 30 seconds
        average_time = total_time / 20
        assert average_time < 2.0  # Average less than 2 seconds per request
    
    def test_health_check_performance(self):
        """Test health check endpoint performance"""
        # Test multiple health checks
        times = []
        for _ in range(10):
            start_time = time.time()
            response = self.client.get("/api/health")
            end_time = time.time()
            
            assert response.status_code == 200
            times.append(end_time - start_time)
        
        # Health checks should be very fast
        average_time = sum(times) / len(times)
        assert average_time < 0.1  # Average less than 100ms
        assert max(times) < 0.5  # No single request over 500ms
    
    def test_error_handling_performance(self):
        """Test that error handling doesn't significantly impact performance"""
        # Test with invalid requests
        invalid_requests = [
            {},  # Empty request
            {"message": ""},  # Empty message
            {"message": "x" * 20000},  # Too long message
            {"invalid_field": "test"},  # Invalid field
        ]
        
        start_time = time.time()
        for invalid_request in invalid_requests:
            response = self.client.post("/api/chat", json=invalid_request)
            # Should return error quickly
            assert response.status_code in [400, 422]
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Error handling should be fast
        assert total_time < 2.0  # All error responses within 2 seconds
    
    @pytest.mark.asyncio
    async def test_async_performance(self):
        """Test async performance with httpx client"""
        async with httpx.AsyncClient(app=app, base_url="http://test") as client:
            # Test concurrent async requests
            async def make_async_request(message_id):
                response = await client.post("/api/chat", json={
                    "message": f"Async test message {message_id}"
                })
                return response.status_code, response.json()
            
            start_time = time.time()
            
            # Create 15 concurrent async requests
            tasks = [make_async_request(i) for i in range(15)]
            results = await asyncio.gather(*tasks)
            
            end_time = time.time()
            total_time = end_time - start_time
            
            # All requests should succeed
            for status_code, data in results:
                assert status_code == 200
                assert "response" in data
            
            # Async requests should be faster than sync
            assert total_time < 10.0  # All async requests within 10 seconds
    
    def test_memory_leak_detection(self):
        """Test for potential memory leaks with repeated requests"""
        import gc
        import sys
        
        # Get initial memory usage (approximate)
        gc.collect()
        initial_objects = len(gc.get_objects())
        
        # Make many requests
        for i in range(100):
            response = self.client.post("/api/chat", json={
                "message": f"Memory test {i}"
            })
            assert response.status_code == 200
            
            # Occasionally force garbage collection
            if i % 20 == 0:
                gc.collect()
        
        # Final garbage collection
        gc.collect()
        final_objects = len(gc.get_objects())
        
        # Object count shouldn't grow excessively
        object_growth = final_objects - initial_objects
        # Allow some growth but not excessive (this is a rough check)
        assert object_growth < 1000, f"Potential memory leak detected: {object_growth} new objects"
    
    def test_error_service_performance(self):
        """Test error service performance under load"""
        from backend.services.error_service import log_error, ErrorCategory, ErrorSeverity
        
        start_time = time.time()
        
        # Log many errors quickly
        for i in range(1000):
            try:
                raise ValueError(f"Test error {i}")
            except ValueError as e:
                log_error(e, ErrorCategory.SYSTEM, ErrorSeverity.LOW)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Error logging should be efficient
        assert total_time < 5.0  # 1000 errors logged within 5 seconds
        
        # Verify error stats
        stats = error_service.get_error_stats()
        assert stats['total_errors'] == 1000
        assert len(stats['recent_errors']) <= 100  # Should be limited
    
    def test_concurrent_error_logging(self):
        """Test concurrent error logging performance"""
        from backend.services.error_service import log_error, ErrorCategory, ErrorSeverity
        
        def log_errors_batch(batch_id):
            for i in range(50):
                try:
                    raise RuntimeError(f"Batch {batch_id} error {i}")
                except RuntimeError as e:
                    log_error(e, ErrorCategory.SYSTEM, ErrorSeverity.MEDIUM)
        
        start_time = time.time()
        
        # Run concurrent error logging
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(log_errors_batch, i) for i in range(10)]
            for future in futures:
                future.result()
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Concurrent error logging should be efficient
        assert total_time < 10.0  # 500 errors from 10 threads within 10 seconds
        
        # Verify all errors were logged
        stats = error_service.get_error_stats()
        assert stats['total_errors'] == 500


class TestStressTest:
    """Stress testing for extreme conditions"""
    
    def setup_method(self):
        """Setup for each test method"""
        error_service.clear_stats()
        self.client = TestClient(app)
    
    @pytest.mark.slow
    def test_high_load_stress(self):
        """Stress test with high concurrent load"""
        def make_requests_batch():
            results = []
            for i in range(10):
                try:
                    response = self.client.post("/api/chat", json={
                        "message": f"Stress test message {i}"
                    })
                    results.append(response.status_code)
                except Exception as e:
                    results.append(500)  # Mark as error
            return results
        
        start_time = time.time()
        
        # Run high concurrent load (20 threads, 10 requests each = 200 total)
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(make_requests_batch) for _ in range(20)]
            all_results = []
            for future in futures:
                all_results.extend(future.result())
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Most requests should succeed even under high load
        success_count = sum(1 for status in all_results if status == 200)
        success_rate = success_count / len(all_results)
        
        assert success_rate > 0.8  # At least 80% success rate
        assert total_time < 60.0  # Complete within 60 seconds
    
    @pytest.mark.slow
    def test_sustained_load(self):
        """Test sustained load over time"""
        duration = 30  # 30 seconds
        start_time = time.time()
        request_count = 0
        error_count = 0
        
        while time.time() - start_time < duration:
            try:
                response = self.client.post("/api/chat", json={
                    "message": f"Sustained load test {request_count}"
                })
                if response.status_code != 200:
                    error_count += 1
                request_count += 1
                
                # Small delay to simulate realistic usage
                time.sleep(0.1)
                
            except Exception:
                error_count += 1
                request_count += 1
        
        error_rate = error_count / request_count if request_count > 0 else 1
        
        # Should handle sustained load with low error rate
        assert error_rate < 0.1  # Less than 10% error rate
        assert request_count > 100  # Should process reasonable number of requests
    
    def test_resource_exhaustion_handling(self):
        """Test handling when resources are exhausted"""
        # This test simulates resource exhaustion scenarios
        
        # Test with many simultaneous conversations
        conversation_ids = []
        for i in range(200):  # Create many conversations
            try:
                response = self.client.post("/api/chat", json={
                    "message": f"Resource test {i}"
                })
                if response.status_code == 200:
                    conversation_ids.append(response.json()["conversation_id"])
            except Exception:
                pass  # Expected under resource pressure
        
        # Should create at least some conversations
        assert len(conversation_ids) > 50
        
        # Test that existing conversations still work
        if conversation_ids:
            response = self.client.post("/api/chat", json={
                "message": "Test existing conversation",
                "conversation_id": conversation_ids[0]
            })
            # Should either work or fail gracefully
            assert response.status_code in [200, 500, 503]