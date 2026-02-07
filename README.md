# ServerTUI

A secure, interactive TUI-based server manager with multi-server support.

## Project Structure

```
servertui/
├── client/              # TypeScript/Node.js TUI client (Ink-based)
│   ├── src/
│   │   ├── components/  # Ink React components (tabs, lists, etc.)
│   │   ├── hooks/       # Custom React hooks
│   │   ├── utils/       # Utility functions
│   │   ├── types/       # TypeScript type definitions
│   │   ├── db/          # SQLite database helpers
│   │   └── index.tsx    # Entry point
│   ├── package.json
│   └── tsconfig.json
├── agent/               # Go server agent
│   ├── cmd/             # Main entry point
│   │   └── main.go
│   └── internal/        # Internal packages
│       ├── metrics/     # System metrics (gopsutil)
│       ├── docker/      # Docker integration
│       ├── updates/     # OS update management
│       ├── server/      # HTTP/WebSocket server
│       └── config/      # Configuration handling
├── docs/                # Documentation
├── scripts/             # Build and deployment scripts
└── prd.md               # Product Requirements Document
```

## Features

- **Multi-Server Management**: Connect to and manage multiple Linux servers
- **Tabbed Interface**: Overview, SSH, Performance, Docker, Commands, Updates
- **Secure Communication**: SSH + TLS encrypted agent communication
- **Real-time Metrics**: Live CPU, memory, disk, and network stats

## Technology Stack

### Client (macOS/Linux)

- **Framework**: TypeScript + Node.js
- **TUI**: Ink (React-based)
- **SSH**: node-ssh (ssh2)
- **Storage**: SQLite (better-sqlite3)
- **WebSocket**: ws

### Agent (Linux)

- **Language**: Go
- **Metrics**: gopsutil
- **Docker**: Official Docker SDK
- **Server**: net/http + gorilla/websocket

## Getting Started

### Prerequisites

- Node.js >= 18 (client)
- Go >= 1.21 (agent)

### Client Setup

```bash
cd client
npm install
npm run dev
```

### Agent Setup

```bash
cd agent
go build -o server-agent ./cmd
```

## License

MIT
