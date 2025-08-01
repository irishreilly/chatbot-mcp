# Frontend Troubleshooting Guide

## 🚨 Frontend Hangs After Restart

### Quick Fix (90% of cases):
```bash
# Use the startup script
npm run start

# Or manually:
./start-frontend.sh
```

### Manual Cleanup (if script doesn't work):
```bash
# 1. Kill all processes on port 8080
lsof -ti:8080 | xargs kill -9

# 2. Kill all vite processes
pkill -f "vite"

# 3. Clear cache
rm -rf node_modules/.vite dist

# 4. Wait 3 seconds
sleep 3

# 5. Start normally
npm run dev
```

### Root Causes:
1. **Zombie processes** - Old Vite processes don't terminate properly
2. **Port conflicts** - Multiple processes trying to use port 8080
3. **File watchers** - Vite's hot reload gets stuck on certain file changes
4. **Import cycles** - Complex service imports create startup deadlocks

### Prevention:
- Always use `npm run start` instead of `npm run dev`
- Don't restart too quickly (wait 3+ seconds between stops/starts)
- Avoid importing recovery services until circular dependencies are fixed

### If Still Hanging:
1. Check for multiple node processes: `ps aux | grep node`
2. Kill all node processes: `killall node` (nuclear option)
3. Restart terminal/IDE
4. Check if backend is running and accessible

### Backend Connection Issues:
- Ensure backend is running on `localhost:8000`
- Check proxy configuration in `vite.config.js`
- Test backend directly: `curl http://localhost:8000/api/health`