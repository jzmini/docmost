# Building Docmost Locally

This guide explains how to build and run Docmost using a locally built Docker image instead of the official Docker Hub image.

## Prerequisites

- Docker installed and running
- Git (if cloning the repository)
- Sufficient disk space (~2-3GB for the build process)

## Quick Start

1. **Build the local Docker image:**
   ```bash
   ./build-local-image.sh
   ```
   This will create `docmost/docmost:local` image.

2. **Use the local image with Docker Compose:**
   ```bash
   # Using the provided local compose file
   docker-compose -f docker-compose.local.yml up -d
   
   # OR modify the original docker-compose.yml to use docmost/docmost:local
   ```

## Build Script Options

The `build-local-image.sh` script supports various options:

```bash
# Show help
./build-local-image.sh --help

# Build with custom tag
./build-local-image.sh --tag v1.0.0

# Build without cache (clean build)
./build-local-image.sh --no-cache

# Build for specific platform
./build-local-image.sh --platform linux/arm64

# Build with verbose output (for debugging)
./build-local-image.sh --verbose

# Clean existing image before building
./build-local-image.sh --clean

# Build with custom image name
./build-local-image.sh --name mycompany/docmost --tag custom
```

## Files Created

1. **build-local-image.sh** - Main build script
2. **docker-compose.local.yml** - Docker Compose configuration using the local image
3. **BUILD_LOCAL.md** - This documentation file

## Using the Local Image

### Option 1: Use docker-compose.local.yml

The easiest way is to use the provided `docker-compose.local.yml` file:

```bash
# Start services
docker-compose -f docker-compose.local.yml up -d

# Stop services
docker-compose -f docker-compose.local.yml down

# View logs
docker-compose -f docker-compose.local.yml logs -f
```

### Option 2: Modify Original docker-compose.yml

Edit your `docker-compose.yml` and change:
```yaml
image: docmost/docmost:latest
```
to:
```yaml
image: docmost/docmost:local
```

Then run normally:
```bash
docker-compose up -d
```

## Build Process

The build script performs a multi-stage Docker build:

1. **Base Stage**: Sets up Node.js Alpine base image
2. **Builder Stage**: 
   - Copies source code
   - Installs pnpm
   - Installs dependencies
   - Builds the application
3. **Installer Stage**:
   - Copies built artifacts
   - Installs production dependencies
   - Sets up volumes and ports
   - Configures the startup command

## Troubleshooting

### Build Fails

If the build fails, try:

1. **Clean build without cache:**
   ```bash
   ./build-local-image.sh --no-cache --clean
   ```

2. **Check Docker resources:**
   ```bash
   docker system df
   docker system prune -a  # Careful: removes all unused images
   ```

3. **Verbose build for debugging:**
   ```bash
   ./build-local-image.sh --verbose
   ```

### Permission Issues

If you get permission errors:
```bash
chmod +x build-local-image.sh
```

### Container Won't Start

Check logs:
```bash
docker-compose -f docker-compose.local.yml logs docmost
```

Common issues:
- Database connection issues - ensure PostgreSQL is running
- Redis connection issues - ensure Redis is running
- Port 3000 already in use - change the port mapping in docker-compose

## Development Workflow

For development, you might want to:

1. **Rebuild after code changes:**
   ```bash
   ./build-local-image.sh --no-cache
   docker-compose -f docker-compose.local.yml restart docmost
   ```

2. **Use different tags for versioning:**
   ```bash
   ./build-local-image.sh --tag dev-$(date +%Y%m%d)
   ```

3. **Build for different platforms:**
   ```bash
   # For M1/M2 Macs
   ./build-local-image.sh --platform linux/arm64
   
   # For standard x86_64
   ./build-local-image.sh --platform linux/amd64
   ```

## Environment Variables

Remember to configure these environment variables in your docker-compose file:

- `APP_URL`: The URL where Docmost will be accessible
- `APP_SECRET`: A long, random secret for session encryption
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string

## Security Notes

Before deploying to production:

1. Change all default passwords
2. Use strong secrets for `APP_SECRET`
3. Configure proper database credentials
4. Consider using Docker secrets for sensitive data
5. Set up proper backup strategies for volumes

## Additional Commands

```bash
# View created image
docker images docmost/docmost:local

# Inspect image details
docker inspect docmost/docmost:local

# View image layers and size
docker history docmost/docmost:local

# Export image for sharing
docker save docmost/docmost:local -o docmost-local.tar

# Import image on another machine
docker load -i docmost-local.tar

# Tag image for registry push
docker tag docmost/docmost:local myregistry.com/docmost:v1.0.0
```

## Support

For issues with:
- The build script: Check the script output and use `--verbose` flag
- The application: Refer to the official Docmost documentation
- Docker: Consult Docker documentation and ensure Docker is properly installed

