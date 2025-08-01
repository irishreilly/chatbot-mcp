#!/bin/bash

# Frontend Startup Script - Handles cleanup and reliable startup

echo "🚀 Starting Frontend with cleanup..."

# Kill any existing processes on port 8080
echo "🧹 Cleaning up existing processes..."
lsof -ti:8080 | xargs kill -9 2>/dev/null || true

# Kill any existing vite processes
pkill -f "vite" 2>/dev/null || true

# Wait a moment for cleanup
sleep 2

# Clear any cached files that might cause issues
echo "🗑️  Clearing cache..."
rm -rf node_modules/.vite 2>/dev/null || true
rm -rf dist 2>/dev/null || true

# Verify port is free
if lsof -i:8080 >/dev/null 2>&1; then
    echo "❌ Port 8080 is still in use. Please manually kill the process:"
    lsof -i:8080
    exit 1
fi

echo "✅ Port 8080 is free"

# Start the development server
echo "🎯 Starting Vite development server..."
nohup npm run dev > frontend.log 2>&1 &

echo "🎉 Frontend startup complete!"
