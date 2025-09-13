#!/bin/bash

# Docmost Local Docker Image Builder Script
# This script builds a local Docker image for Docmost from source code
# instead of using the official docmost/docmost:latest from Docker Hub

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
IMAGE_NAME="docmost/docmost"
IMAGE_TAG="local"
BUILD_CACHE=""
PLATFORM=""
VERBOSE=""

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Function to print colored output
print_color() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Function to print usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Build a local Docker image for Docmost from source code.

OPTIONS:
    -h, --help              Show this help message
    -t, --tag TAG           Tag for the image (default: local)
    -n, --name NAME         Image name (default: docmost/docmost)
    -c, --no-cache          Build without using cache
    -p, --platform PLATFORM Platform to build for (e.g., linux/amd64, linux/arm64)
    -v, --verbose           Show detailed build output
    --push                  Push the image to registry (requires login)
    --clean                 Remove existing local image before building

EXAMPLES:
    # Build with default settings (docmost/docmost:local)
    $0

    # Build with custom tag
    $0 --tag v1.0.0

    # Build without cache
    $0 --no-cache

    # Build for specific platform
    $0 --platform linux/arm64

    # Build with verbose output
    $0 --verbose

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -c|--no-cache)
            BUILD_CACHE="--no-cache"
            shift
            ;;
        -p|--platform)
            PLATFORM="--platform $2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE="--progress=plain"
            shift
            ;;
        --push)
            PUSH_IMAGE="true"
            shift
            ;;
        --clean)
            CLEAN_FIRST="true"
            shift
            ;;
        *)
            print_color $RED "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Full image name with tag
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_color $RED "Error: Docker is not installed or not in PATH"
    print_color $YELLOW "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    print_color $RED "Error: Docker daemon is not running"
    print_color $YELLOW "Please start Docker and try again"
    exit 1
fi

# Change to the repository directory
cd "$SCRIPT_DIR"

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    print_color $RED "Error: Dockerfile not found in $SCRIPT_DIR"
    exit 1
fi

# Clean existing image if requested
if [ "$CLEAN_FIRST" = "true" ]; then
    print_color $YELLOW "Removing existing image ${FULL_IMAGE_NAME}..."
    docker rmi -f ${FULL_IMAGE_NAME} 2>/dev/null || true
fi

# Print build information
print_color $BLUE "========================================="
print_color $BLUE "Docmost Local Docker Image Builder"
print_color $BLUE "========================================="
print_color $GREEN "Building image: ${FULL_IMAGE_NAME}"
print_color $GREEN "Build directory: ${SCRIPT_DIR}"
if [ -n "$PLATFORM" ]; then
    print_color $GREEN "Target platform: ${PLATFORM#--platform }"
fi
if [ -n "$BUILD_CACHE" ]; then
    print_color $YELLOW "Cache: Disabled"
else
    print_color $GREEN "Cache: Enabled"
fi
print_color $BLUE "========================================="
echo

# Build the Docker image
print_color $YELLOW "Starting Docker build process..."
print_color $YELLOW "This may take several minutes depending on your system..."
echo

BUILD_CMD="docker build ${BUILD_CACHE} ${PLATFORM} ${VERBOSE} -t ${FULL_IMAGE_NAME} -f Dockerfile ."

if [ -n "$VERBOSE" ]; then
    print_color $BLUE "Executing: $BUILD_CMD"
fi

if $BUILD_CMD; then
    echo
    print_color $GREEN "========================================="
    print_color $GREEN "✅ Build completed successfully!"
    print_color $GREEN "========================================="
    print_color $GREEN "Image created: ${FULL_IMAGE_NAME}"
    
    # Show image size
    IMAGE_SIZE=$(docker images ${IMAGE_NAME}:${IMAGE_TAG} --format "Size: {{.Size}}")
    print_color $GREEN "$IMAGE_SIZE"
    
    echo
    print_color $BLUE "Next steps:"
    print_color $BLUE "1. Update docker-compose.yml to use '${FULL_IMAGE_NAME}' instead of 'docmost/docmost:latest'"
    print_color $BLUE "2. Run: docker-compose up -d"
    
    # Push image if requested
    if [ "$PUSH_IMAGE" = "true" ]; then
        echo
        print_color $YELLOW "Pushing image to registry..."
        if docker push ${FULL_IMAGE_NAME}; then
            print_color $GREEN "✅ Image pushed successfully!"
        else
            print_color $RED "❌ Failed to push image"
            exit 1
        fi
    fi
    
else
    echo
    print_color $RED "========================================="
    print_color $RED "❌ Build failed!"
    print_color $RED "========================================="
    print_color $YELLOW "Please check the error messages above."
    print_color $YELLOW "Common issues:"
    print_color $YELLOW "  - Insufficient disk space"
    print_color $YELLOW "  - Network connectivity problems"
    print_color $YELLOW "  - Missing dependencies in source code"
    exit 1
fi

# Additional helpful information
echo
print_color $BLUE "========================================="
print_color $BLUE "Useful Docker commands:"
print_color $BLUE "========================================="
echo "View image details:    docker images ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Inspect image:        docker inspect ${FULL_IMAGE_NAME}"
echo "View image history:   docker history ${FULL_IMAGE_NAME}"
echo "Remove image:         docker rmi ${FULL_IMAGE_NAME}"
echo "Tag for production:   docker tag ${FULL_IMAGE_NAME} ${IMAGE_NAME}:production"
echo
print_color $BLUE "========================================="

