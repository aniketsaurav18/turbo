#!/bin/bash

# Build the test image
echo "Building test image..."
docker build -f Dockerfile.agenttest -t servertui-test .

# Run the container
echo "Starting test container..."
echo "SSH Port: 2222 (user: testuser, pass: password)"
echo "Agent Port: 8443"
docker run -p 2222:22 -p 8443:8443 --rm -it servertui-test
