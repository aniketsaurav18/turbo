#!/bin/sh

# Generate certs if they don't exist (for fresh containers)
mkdir -p /app/certs
if [ ! -f /app/certs/server.crt ]; then
    echo "Generating self-signed certs..."
    openssl req -x509 -newkey rsa:4096 -keyout /app/certs/server.key -out /app/certs/server.crt -days 365 -nodes -subj "/CN=localhost"
fi

# Start SSH daemon
/usr/sbin/sshd

# Start your Agent
echo "Starting Server Agent..."
/app/server-agent --port 8443 --tls-cert /app/certs/server.crt --tls-key /app/certs/server.key
