#!/bin/bash

# Build the test image
echo "Building test image..."
docker build -f Dockerfile.agenttest -t servertui-test .

# Run the container with Docker socket access
echo "Starting test container..."
echo "SSH Port: 2222 (user: testuser, pass: password)"
echo "Agent Port: 8443"
echo "Docker: Mounting host Docker socket"

# Mount Docker socket and add to docker group
# Note: The container process needs access to the Docker socket
docker run \
  -p 2222:22 \
  -p 8443:8443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --group-add $(getent group docker | cut -d: -f3) \
  --rm -it servertui-test
