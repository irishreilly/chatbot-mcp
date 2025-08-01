#!/bin/bash

echo "🚀 Starting servers..."

# Kill any existing processes on port 8080
echo "🧹 Cleaning up any process on backend port..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Wait a moment for cleanup
sleep 2

# Verify port is free
if lsof -i:8000 >/dev/null 2>&1; then
    echo "❌ Port 8000 is still in use. Please manually kill the process:"
    lsof -i:8000
    exit 1
fi

echo "✅ Port 8000 is free"

# Start the backend server
echo "🎯 Running backend Python server in background..."
source /Users/paulreilly/Code/chatbot/.venv/bin/activate
nohup python main.py > backend.log 2>&1 &

echo "🎉 Backend server startup complete!"
