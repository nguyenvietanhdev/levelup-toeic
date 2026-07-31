# Redis Setup Guide

## Cài đặt Redis (Optional - hệ thống vẫn chạy được không có Redis)

### Windows:

**Option 1: Sử dụng Docker (Recommended)**
```bash
docker run -d --name redis -p 6379:6379 redis:latest
```

**Option 2: WSL (Windows Subsystem for Linux)**
```bash
# Install WSL2 first, then:
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

**Option 3: Download Redis for Windows**
- Download từ: https://github.com/microsoftarchive/redis/releases
- Giải nén và chạy `redis-server.exe`

### macOS:
```bash
brew install redis
brew services start redis
```

### Linux:
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

---

## Cấu hình

Thêm vào file `.env` (optional):
```env
REDIS_URL=redis://localhost:6379
```

Nếu không có Redis, server vẫn chạy bình thường nhưng:
- ⚠️  Không có caching → Chậm hơn khi có nhiều user
- ℹ️  Mỗi request đều query database

---

## Kiểm tra Redis hoạt động

```bash
# Test connection
redis-cli ping
# Should return: PONG

# Check cached keys
redis-cli keys "cache:*"

# Monitor cache hits
redis-cli MONITOR
```

---

## Performance với/không Redis

| Metric | Không Redis | Có Redis |
|--------|-------------|----------|
| Response time (first load) | 50-100ms | 50-100ms |
| Response time (cached) | 50-100ms | 5-10ms |
| Database queries | Mỗi request | Chỉ khi cache miss |
| Max concurrent users | ~30-50 | **100+** |

---

## Cache Strategy

- **Tests list**: Cache 5 phút (300s)
- **Single test**: Cache 5 phút
- Cache tự động xóa khi admin update/delete test
- Cache miss → Query DB → Store in cache

