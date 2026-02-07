# Overview and Goals

We will build a **secure, interactive TUI-based server manager** with a client (for Mac/Linux) and lightweight server-side agents (Linux). The client (written in TypeScript/Node.js) will offer a **tabbed interface** for each server: Overview, SSH console, performance metrics, Docker, command-runner, and updates. All server data and commands go through an authenticated, encrypted channel (SSH and/or TLS). The client can handle **multiple servers**, each with its own session and tabs. We store configuration and session history locally (e.g. in SQLite) for fast access. In effect, the system looks like a multi-tab terminal "dashboard" where each tab is focused on the currently selected server. This satisfies requirements for secure design, rich interactivity (arrow-key navigation between tabs), and multi-server management.

# Architecture and Components

- **Client (TUI)** - Runs on the user's machine (macOS/Linux) and is implemented in Node.js/TypeScript for rich TUI support. We will use a modern TUI framework like **Ink** (React-based CLI)[\[1\]](https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/#:~:text=6) or similar libraries (e.g. [blessed](https://github.com/chjj/blessed) or newer ones). Ink lets us define flexible layouts (boxes, lists, etc.) using React-style components[\[1\]](https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/#:~:text=6). The client renders a full-screen interface with **tab navigation** (e.g. using arrow keys or hotkeys) and handles input. It also manages configuration (server list, credentials) and session history (commands run, outputs).
- **Agent (Server Daemon)** - A small Go (or Rust) program running on each managed server (Linux only). The agent provides system info (CPU/memory/disk usage, Docker info, available updates, etc.) and executes commands securely. Go is a good fit: it compiles to a single binary, has excellent libraries (e.g. [gopsutil](https://github.com/shirou/gopsutil) for metrics and the official Docker client[\[2\]](https://leapcell.medium.com/gopsutil-powerful-system-stats-for-go-developers-2a1941c40822#:~:text=gopsutil%20is%20a%20Golang%20port,compilation%20possible)[\[3\]](https://pkg.go.dev/github.com/docker/docker/client#:~:text=The%20,pulling%20images%2C%20managing%20swarms%2C%20etc)), and low overhead. The agent listens on a local port (e.g. HTTP/HTTPS server) or communicates via SSH. In one design, the agent exposes a **TLS-encrypted WebSocket/HTTP API**: the client connects to it over a secure channel to stream metrics and send commands. (We could use gRPC with mTLS as well, but WebSockets/REST are simpler with Node.)
- **Communication (Secure)** - All data in transit is encrypted and authenticated. For SSH access (the SSH tab and possibly command execution), we use standard SSH with keys. For metrics/commands through the agent, we use TLS (HTTPS/WSS). In Go, running a WebSocket over TLS is straightforward (e.g. http.ListenAndServeTLS)[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5). We'll provision certificates (self-signed or via Let's Encrypt) or use key fingerprint pinning. Optionally, we can tunnel the agent's port over SSH for extra security. Either way, every connection is encrypted end-to-end.
- **Monorepo** - Both client and agent code live in one repository (e.g. using a monorepo tool or workspaces). This simplifies versioning and CI. For example, use Yarn Workspaces or Nx to manage the TS client and Go agent projects together.

This **client-agent architecture** cleanly separates concerns: the client handles UI and user flow, the agent does low-level system work. It also scales to many servers (each has its own agent). If an agent is not installed, the client could fallback to pure SSH commands, but having an agent makes real-time updates easy and efficient.

# Technology Stack

- **Client**: TypeScript/Node.js. For the TUI, use **Ink** (a React-like terminal UI library) or a similar high-level TUI lib[\[1\]](https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/#:~:text=6). Ink is well-known for making complex TUIs (lists, charts, forms) via React components. For example, a review says _"Node.js + SQLite + Ink is actually excellent for a local CLI tool"_[\[5\]](https://www.reddit.com/r/CLI/comments/1p4o03u/an_opensource_cli_tool_with_a_tui_dashboard_for/#:~:text=1.%20,system%20for%20a%20localhost%20monitor). That underscores our choice of Ink (for UI) and an embedded DB (SQLite) for client state/history.
- **Client Support Libraries**:
- **Ink (React CLI)** - offers Box, Text, List, and other widgets, plus key handling and raw mode. We'll use Ink hooks (useInput, useApp) to capture arrow keys and focus on tabs.
- **node-ssh (ssh2)** - to perform SSH commands from Node. For example, node-ssh is "an extremely lightweight promise wrapper for ssh2"[\[6\]](https://github.com/steelbrain/node-ssh#:~:text=Node), making it easy to run commands or open a shell. We can use ssh2 directly to spawn an interactive shell or run commands remotely.
- **SQLite (better-sqlite3)** - store config (server list, keys) and session logs locally. The TUI can query this DB for history. As noted, using SQLite in a Node CLI (with Ink) is a good fit[\[5\]](https://www.reddit.com/r/CLI/comments/1p4o03u/an_opensource_cli_tool_with_a_tui_dashboard_for/#:~:text=1.%20,system%20for%20a%20localhost%20monitor).
- **WebSocket / HTTP** - use a WS client (e.g. ws or built-in) to connect to the agent for streaming metrics. With HTTPS/WSS, all data is secured[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5).
- **State & Config** - either JSON/YAML config files or store in SQLite. SQLite is robust and cross-platform.
- **Agent**: Golang. It compiles to a single static binary. Key libraries:
- **gopsutil** - "a Golang port of the Python library psutil" that provides CPU, memory, disk, network stats, etc.[\[2\]](https://leapcell.medium.com/gopsutil-powerful-system-stats-for-go-developers-2a1941c40822#:~:text=gopsutil%20is%20a%20Golang%20port,compilation%20possible). No cgo dependencies, so cross-compiles easily. We'll use it to gather CPU%, memory%, disk I/O, etc.
- **Docker Engine SDK for Go** - the official client (github.com/docker/docker/client). The Docker CLI itself uses this package[\[3\]](https://pkg.go.dev/github.com/docker/docker/client#:~:text=The%20,pulling%20images%2C%20managing%20swarms%2C%20etc). We can list containers/images via ContainerList and ImageList calls (equivalent to docker ps -a and docker images).
- **HTTP/WS** - Go's net/http for REST endpoints (e.g. GET stats) and [Gorilla WebSocket](https://github.com/gorilla/websocket) or similar for streaming live stats. The HTTP server runs with TLS (http.ListenAndServeTLS which also covers WS)[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5).
- **Package Management** - The agent will invoke OS commands for updates (e.g. apt update, apt list --upgradable, yum check-update) and parse results. It will likely need root privileges (run agent as root via systemd or allow sudo).
- **Security**:
- **SSH Keys**: For passwordless SSH, we generate an SSH key pair on the client and install the public key on each server's ~/.ssh/authorized_keys[\[7\]](https://www.redhat.com/en/blog/passwordless-ssh#:~:text=If%20you%20interact%20regularly%20with,public%20and%20private%20key%20pair). This avoids entering passwords on every connection. (As Red Hat notes, "authentication can be automatically negotiated using a public/private key pair"[\[7\]](https://www.redhat.com/en/blog/passwordless-ssh#:~:text=If%20you%20interact%20regularly%20with,public%20and%20private%20key%20pair).)
- **TLS for Agent**: The agent's HTTPS can use self-signed certs. The client should verify the certificate or at least pin a fingerprint. We could also support mutual TLS (mTLS) if needed.
- **Transport Security**: By using http.ListenAndServeTLS on the agent, **all** HTTP and WebSocket traffic is encrypted[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5). The client only accepts secure connections.
- **Network**: If not trusting the network, one can SSH-tunnel the WS port instead of direct TLS.
- **Least Privilege**: The agent only opens one port (say 8443). We recommend using a firewall rule to only allow connections from the client machine(s).

# UI/UX Design

- **Server List / Selection**: On startup, the client shows a list of configured servers (IP or name). The user can add/remove servers via a form (enter IP, port, SSH user, key path). Once servers are defined, the user selects one (arrow keys + Enter) to open its dashboard.
- **Tabbed Interface**: For each server, the interface has tabs (e.g. at the top or side): **Overview**, **SSH Shell**, **Performance**, **Docker**, **Commands**, **Updates/Patches**, **Logs**. The user switches tabs with arrow keys or shortcuts (e.g. Tab key or function keys). Only the active tab's content is visible.
- **Overview Tab**: Shows basic info (hostname, OS version, uptime) and maybe summarized metrics.
- **SSH Tab**: Embeds an SSH shell session. We can implement this by forking the system ssh command in a pseudo-terminal and capturing its output into the UI. Alternatively, use the ssh2 client to start an interactive shell, then pipe input/output to the Ink UI (more work). The goal is: the user has a fully interactive remote shell within the TUI window. This satisfies "ssh option inside the TUI, seamless".
- **Performance Tab**: Shows live CPU, memory, disk I/O, network stats (like a "top" view or simple counters). These are streamed from the agent via WebSocket. For example, every second the agent sends a JSON update ({"cpu":12.3,"mem":45.6,"diskIO":...}) and the UI updates gauges or bars. We can use text/ASCII charts or progress bars. We will use **gopsutil** on the agent to gather these stats, so we don't reinvent low-level calls[\[2\]](https://leapcell.medium.com/gopsutil-powerful-system-stats-for-go-developers-2a1941c40822#:~:text=gopsutil%20is%20a%20Golang%20port,compilation%20possible).
- **Docker Tab**: Shows Docker information. If Docker is not installed (agent sees no Docker daemon), display "Docker not installed". If installed, list all containers and images (with statuses). The agent can call the Docker SDK: e.g. cli.ContainerList(ctx, types.ContainerListOptions{All: true}). The UI presents a scrollable list: each container's name, image, status. Possibly allow starting/stopping containers. Similarly list images and sizes. This uses Go's official Docker client[\[3\]](https://pkg.go.dev/github.com/docker/docker/client#:~:text=The%20,pulling%20images%2C%20managing%20swarms%2C%20etc) under the hood.
- **Commands Tab**: A simple interface where the user types an arbitrary shell command, presses Enter, and sees the output. Implementation: send the command to the agent (via SSH or API) and display output. Could be done by running ssh.execCommand()[\[6\]](https://github.com/steelbrain/node-ssh#:~:text=Node) or calling an agent endpoint to run a command. The agent returns stdout/stderr to show.
- **Updates/Patches Tab**: Shows OS-level updates. On Linux, this varies by distro:
- **Debian/Ubuntu**: run apt update then apt list --upgradable (as documented, this lists available upgrades)[\[8\]](https://itsfoss.com/apt-list-upgradable/#:~:text=apt%20list%20). Display package, current and new version. User can select packages to upgrade. Running a package update (e.g. apt install pkg or apt upgrade) likely requires root; the agent might run with sudo. We offer "Update all" or individual upgrades.
- **RHEL/CentOS**: run yum check-update. That prints packages. We parse it (or use yum list updates). Each result lists &lt;name&gt; &lt;current&gt; -> &lt;available&gt; (see SO answers for parsing). Provide similar "Update" actions (yum update pkg or yum update -y).
- This fulfills "list available updates" and "option to update individual/all packages". We should cite that apt list --upgradable shows all packages that can be updated[\[8\]](https://itsfoss.com/apt-list-upgradable/#:~:text=apt%20list%20). (For yum, we rely on standard commands.)
- **Logs/History Tab**: Every action (remote command run, update applied, etc.) is logged. This tab shows a scrollable history (with timestamps). We store these logs locally (in SQLite or a file) keyed by server. This lets users review past commands or outputs. For example, SSH sessions could be recorded.
- **Multi-Server UX**: The UI must make it easy to switch servers. Two approaches:
  - **Server List Screen**: A main screen listing all servers, where one presses Enter to "open" that server's set of tabs.
  - **Inline Top Bar**: A top bar showing the current server name, with left/right arrows to switch servers (each server's tabs change accordingly). We favor a main menu at startup to pick a server. The UI always indicates which server's data is shown (e.g. "Server: 192.168.1.10").

Throughout, keyboard navigation (arrow keys, tab, function keys) is supported. Prompts and confirm dialogues use Ink's Text and input components.

# Implementation Steps and Details

- **Setup and Onboarding**
- _Client Installation_: Package the Node/TS app (maybe using pkg or as a global npm CLI). The user will download or npm install -g yourtool. It should work on macOS/Linux.
- _Agent Installation_: Provide a downloadable Go binary (e.g. from GitHub releases). On each Linux server, the admin copies the agent binary (e.g. via scp). They then configure it as a service (e.g. create a systemd service file to run agent at startup) so it runs on boot. For example, follow guides like "Running Go program as systemd service" (create /etc/systemd/system/myagent.service, systemctl enable myagent)[\[9\]](https://dev.to/ducnt114/running-golang-program-as-systemd-service-in-ubuntu-3k7j#:~:text=Create%20system%20service%20file,root%20user%20with%20below%20content).
- _SSH Key Setup_: The client (user) generates an SSH keypair with ssh-keygen (or reuse an existing key). They distribute the public key to each server (ssh-copy-id user@server)[\[7\]](https://www.redhat.com/en/blog/passwordless-ssh#:~:text=If%20you%20interact%20regularly%20with,public%20and%20private%20key%20pair). This enables passwordless SSH. We should document that private keys should be secure (chmod 600) and optionally protected with passphrase cached via ssh-agent.
- _TLS Setup_: When the agent first runs, it can generate a self-signed certificate (or the user places a cert/key). The client must be made aware (e.g. prompt to trust the certificate fingerprint). We might not automate this fully, but document it.
- _Configuration_: The client reads a config file (YAML/JSON) or a database for server entries. At first run, prompt user to add a server: input IP, SSH user, and path to private key. Save this for future.
- **Secure Communication**
- **SSH**: Use the user's SSH key (given or default) to connect for the SSH console and for running remote commands. In Node, the node-ssh library can ssh.connect({host, username, privateKeyPath})[\[6\]](https://github.com/steelbrain/node-ssh#:~:text=Node). Once connected, for the SSH tab we want an interactive session. One approach is to spawn a child process running ssh -tt user@server with the provided key, and attach the Node TTY to Ink so it captures output. (Alternatively, use ssh2.client.shell() to create a shell stream.)
- **Agent API**: The agent's HTTP/WSS endpoints all use TLS. In Go, we start with http.ListenAndServeTLS(":8443", certFile, keyFile, handler)[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5). The client's WS client connects to wss://server:8443/metrics and HTTP to <https://server:8443/api/>.... All these are encrypted (as \[11\] notes, using ListenAndServeTLS "secures the entire communication on the underlying connection including all WebSocket traffic"[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5)).
- **Authentication**: Besides TLS, we should verify the agent identity. For simplicity, we can trust the cert after initial confirmation. Optionally implement a shared secret (JWT) or client cert. If using SSH tunneling instead of direct TLS, the SSH key already authenticates.
- **Metric Streaming (WebSocket)**
- The agent, once connected, runs a loop (e.g. every second) gathering metrics via gopsutil (e.g. cpu.Percent, mem.VirtualMemory, disk.IOCounters, etc.) and sends JSON to any connected WebSocket client. This provides _real-time streaming_. WS is perfect for low-latency full-duplex flow (no need to poll).
- The client connects to the agent's WS at the start of the Performance tab. It receives updates and re-renders the CPU/memory bars. If WS drops, the client can try to reconnect. Ensure WS uses TLS so traffic is encrypted.
- **Docker Management**
- Agent checks if Docker is available (e.g. try initializing the Docker SDK client or check /var/run/docker.sock).
- If available, call dockerClient.ContainerList(..., All=true) to get all containers. For each, send back JSON with container names, image, status, ports, etc. Also dockerClient.ImageList(...) for images.
- The client lists these in the Docker tab. If user selects a container, we could add "stop/remove" actions. (Basic MVP can just show info.) We must mention to the user that managing containers requires the agent to run as a user in the docker group or root.
- If Docker not present or agent can't connect, display "Docker not installed or not running" in that tab.
- **Remote Command Execution**
- In the Commands tab, the user types a command. Upon Enter, the client sends it to the server. Implementation: either use the SSH connection to execute (ssh.execCommand(cmd))[\[6\]](https://github.com/steelbrain/node-ssh#:~:text=Node), or call an agent endpoint (e.g. POST /api/exec) that runs cmd in a shell. SSH approach is simpler (no need to code execution on agent) and automatically uses SSH's security. We then capture stdout/stderr and display.
- We also record the command and its output in the session history (in local DB).
- **Updates/Patches**
- Agent detects OS type (e.g. read /etc/os-release). Based on distro, it chooses commands:
  - **Debian/Ubuntu**: run apt update (to refresh cache), then parse apt list --upgradable[\[8\]](https://itsfoss.com/apt-list-upgradable/#:~:text=apt%20list%20). That command "lists all the upgradable packages"[\[8\]](https://itsfoss.com/apt-list-upgradable/#:~:text=apt%20list%20). The agent sends the list of packages (name, current version, new version).
  - **RHEL/CentOS**: run yum check-update and parse the output. (SO answers show one-liners: e.g. yum check-update | awk ... to get package names.) The agent returns similar info.
- The client shows a table of updates. The user can press a key on a package to upgrade it, triggering the agent to run e.g. apt install pkg -y or yum update pkg -y. We show progress or result. There should also be an "Update All" which runs apt upgrade/yum update. We'll ensure to ask for confirmation.
- This satisfies **(e)** from the list.
- **Multi-Server Handling**
- All the above happens per-server context. The client maintains a pool of SSH or WebSocket connections - one active per selected server. When the user switches servers, the UI reloads data from that server (possibly reconnecting WS and SSH).
- Configurable: Servers can be added/edited in the UI (or a config file).
- Session management: We keep separate logs per server (e.g. logs.db table keyed by server ID). The History tab per server shows only that server's entries.
- UI flow: After managing one server, user returns to server list or directly switches to another (via some key).
- **Session History and Logging**
- Every command run (SSH or in Commands tab) and every agent response (like updates applied) is timestamped and saved in a local database. We can use SQLite to persist this. For example, a table logs(server_id, timestamp, type, content).
- The **History/Logs** tab reads from this DB and displays past actions. This gives us the requested "session history".
- We maintain logs on the **client side**, since the client owns the user session.
- **Configuration and Settings**
- Allow editing settings (e.g. change polling interval, colors) in a config file or UI.
- Provide a --help or help command listing keys (like ↑↓ to move, Enter to select, Esc to go back).
- Possibly use something like Ink's FocusManager to handle tab focus and inputs.

# Security and Deployment

- **Encryption**: SSH keys for login (as above[\[7\]](https://www.redhat.com/en/blog/passwordless-ssh#:~:text=If%20you%20interact%20regularly%20with,public%20and%20private%20key%20pair)). Use TLS (HTTPS/WSS) for agent communications[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5). No plain-text passwords. For extra safety, run the agent on a non-standard port and/or behind a jump host.
- **Authentication**: We rely on SSH key auth. For HTTP, the initial handshake can verify agent cert. Optionally add a token: on first setup, generate a shared secret (long random key) and have the agent and client use it for API calls (JWT or HMAC). But may not be needed for initial version.
- **Agent Privileges**: The agent likely needs root (or at least sudo privileges) to gather all metrics and install updates. In practice, the admin will run it as root via systemd. We should warn in docs that the agent is powerful and should be secured accordingly.
- **Client-Server Binding**: Since the client can manage multiple servers, it will have multiple concurrent connections. We should ensure our data models (state) separate them to avoid cross-server leakage.

# Language Choice Justification

- **TypeScript/Node (Client)** - Rich ecosystem for TUI (Ink, prompts, etc.). Ink with TypeScript provides a familiar React-style dev experience and strong type-checking. The cited analysis praises Node+SQLite+Ink for CLI tools[\[5\]](https://www.reddit.com/r/CLI/comments/1p4o03u/an_opensource_cli_tool_with_a_tui_dashboard_for/#:~:text=1.%20,system%20for%20a%20localhost%20monitor). Using TS keeps code maintainable and leverages existing UI/UX libraries. The client mainly orchestrates UI and I/O, so a GC language is fine.
- **Go (Agent)** - Generates a single static binary. Excellent cross-compilation. Vast libraries for system tasks (gopsutil) and networking. It's lighter and faster than a Python agent, and easier than C++ or Java for dev velocity. Go's strong standard library covers HTTP and crypto out of the box. If an alternative were considered, Rust could do similarly, but Go is more common for ops tools and has mature Docker and sysinfo libraries.
- We keep all code in one **monorepo**. For example, use a workspace where /client is a Node project and /agent is a Go module. CI can build and test both. Documentation and scripts are unified.

# Onboarding and Configuration (User Flows)

- **First Launch (Client)**: The user installs the client app (instructions in README). On running it, the TUI prompts: "No servers configured. Add a new server?" The user enters:
- Server name or IP
- SSH username (e.g. admin)
- Path to SSH private key (or choose default ~/.ssh/id_rsa)
- (Optionally) API port if not default. The client attempts an SSH connection (to verify key) and checks if the agent is responding (try connecting to <https://server:8443/health>). If all good, the server is added to config.
- **Server Setup**: Separately, on each Linux server:
- Download the agent binary and place it (e.g. /usr/local/bin/server-agent).
- Generate or provide TLS certificate (e.g. /etc/server-agent/cert.pem and key).
- Create a systemd service:

- \[Unit\]  
    Description=Server Management Agent  
    After=network.target  
    <br/>\[Service\]  
    ExecStart=/usr/local/bin/server-agent --tls-cert /etc/server-agent/cert.pem --tls-key /etc/server-agent/key.pem  
    User=root  
    Restart=on-failure  
    <br/>\[Install\]  
    WantedBy=multi-user.target

- Enable and start it: systemctl enable server-agent && systemctl start server-agent.
- Ensure SSH key was copied earlier (ssh-copy-id or manual .ssh/authorized_keys).
- **Trust and Security**: When the client first connects to the agent's TLS port, it should ask to trust the server's cert fingerprint (similar to SSH's first-login). This prevents man-in-the-middle. Document how to update/rotate certs.
- **Continuous Use**: After setup, the user just runs the TUI (mytool) and picks a server. Tabs start populating: performance graphs from live data, Docker info, etc. If the agent or SSH is unreachable, the UI should show an error.

# Detailed Feature Implementation (Summary)

- **SSH Console**: Use a pseudo-terminal. For example, spawn ssh -tt -i key user@host with Node's child_process.spawn. Connect the child's stdio to Ink's &lt;Text&gt; output and handle &lt;TextInput&gt; for keystrokes. This can give a near-direct experience. Alternatively, try ssh2.Client.shell() to get streams for input/output, but routing that through Ink is complex. In practice, simply dropping the user into an actual ssh session might suffice (although then we'd lose control of the Ink UI). If integration is tricky, a fallback is to instruct the user that pressing a key will drop to the real shell outside the TUI. But ideally we embed it.
- **UI Layout**: Use Ink &lt;Box&gt; components for each tab. E.g. a &lt;Box&gt; for tab headers (with current tab highlighted) and a &lt;Box&gt; for content. Ink's useInput can capture arrow keys and change tab index. Each tab content (performance charts, lists) is composed of Ink components like &lt;Text&gt;, &lt;Newline&gt;, or even custom components.
- **Metrics and Charts**: For nice visuals, libraries like [blessed-contrib](https://github.com/yaronn/blessed-contrib) (for Node) can draw spark lines or gauges in text, but since we're in Ink, we may use plain text or draw bars manually (e.g. ASCII progress bars). Either way, use color (Ink supports &lt;Text color="green"&gt;). We won't cite a specific library for charts; building simple widgets by hand is fine.
- **Agent Data APIs**: Example API design:
- GET /api/metrics (returns JSON of current CPU, mem, disk). Or use WS instead.
- POST /api/exec with JSON {command: "ls"} returns {stdout,stderr}.
- GET /api/docker/containers and /api/docker/images.
- GET /api/updates returns pending updates list.
- POST /api/update/{pkg} triggers update.
- WS on /ws/metrics for streaming. These endpoints run with handler functions in Go, using e.g. exec.Command for non-metric tasks.
- **Concurrency**: The agent may handle multiple requests (from one client controlling multiple servers). Go's HTTP server and WebSockets are concurrent by default. We should ensure thread-safety (e.g. avoid race on any shared state; most calls just read system info).
- **Error Handling**: The client should gracefully handle timeouts or missing features (like if Docker API call fails, just say "disabled"). Provide clear error messages.
- **Testing**: Write unit tests for parsing the yum/apt outputs, for generating mock metrics, etc. Possibly integration test where the client runs against a local agent instance.

# Security and Best Practices

- **Encryption Always**: Never send credentials in clear. As \[11\] shows, using TLS for both HTTP and WS ensures all exchanged data (metrics, commands, etc.) is encrypted[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5).
- **Credentials Storage**: Store SSH private keys carefully (probably the user's normal SSH key). The client should not persist any passwords - use key-only auth. If we allow password fallback, do so interactively without saving.
- **Update Mechanism**: Since the agent can update the system, the agent should authenticate requests. Right now, only the client (with secure access) should be able to tell it to update. If we expose the agent on the internet, we'd need stronger auth (API keys). We assume this is for trusted local networks or VPNs.

# Summary

This plan covers the full implementation approach: a **TypeScript/Ink-based TUI client** with modular tabs, communicating securely with a **Go-based agent** on each server. We leverage existing libraries (Node-SSH, gopsutil, Docker SDK) to implement features robustly. The architecture (client-agent over TLS) keeps the design secure by default (SSH keys, HTTPS) and scalable to many servers. Both client and agent code live in one monorepo for ease of development.

All aspects (UI, security, multi-server support, onboarding) are considered. We will proceed by first scaffolding the monorepo, implementing basic SSH connectivity and one tab, then incrementally adding features (metrics, Docker, updates, etc.) with thorough testing. The result will be an interactive, secure TUI tool for managing VPSes at scale.

**Sources:** We will use libraries documented in community sources. For example, Ink (the React CLI library) is noted for building rich TUIs[\[1\]](https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/#:~:text=6), and a review of a similar tool praises "Node.js + SQLite + Ink" for CLI apps[\[5\]](https://www.reddit.com/r/CLI/comments/1p4o03u/an_opensource_cli_tool_with_a_tui_dashboard_for/#:~:text=1.%20,system%20for%20a%20localhost%20monitor). We will secure WebSocket communications using TLS (as recommended in Go WebSocket tutorials[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5)) and gather system stats with gopsutil[\[2\]](https://leapcell.medium.com/gopsutil-powerful-system-stats-for-go-developers-2a1941c40822#:~:text=gopsutil%20is%20a%20Golang%20port,compilation%20possible). Docker data is fetched via the official Go client[\[3\]](https://pkg.go.dev/github.com/docker/docker/client#:~:text=The%20,pulling%20images%2C%20managing%20swarms%2C%20etc), and updates use standard Linux commands (apt list --upgradable[\[8\]](https://itsfoss.com/apt-list-upgradable/#:~:text=apt%20list%20) and yum check-update). SSH key-based auth will be the norm for login[\[7\]](https://www.redhat.com/en/blog/passwordless-ssh#:~:text=If%20you%20interact%20regularly%20with,public%20and%20private%20key%20pair). All these choices combine to meet the requirements.

[\[1\]](https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/#:~:text=6) 7 TUI libraries for creating interactive terminal apps - LogRocket Blog

<https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/>

[\[2\]](https://leapcell.medium.com/gopsutil-powerful-system-stats-for-go-developers-2a1941c40822#:~:text=gopsutil%20is%20a%20Golang%20port,compilation%20possible) Gopsutil: Powerful System Stats for Go Developers | by Leapcell | Medium

<https://leapcell.medium.com/gopsutil-powerful-system-stats-for-go-developers-2a1941c40822>

[\[3\]](https://pkg.go.dev/github.com/docker/docker/client#:~:text=The%20,pulling%20images%2C%20managing%20swarms%2C%20etc) client package - github.com/docker/docker/client - Go Packages

<https://pkg.go.dev/github.com/docker/docker/client>

[\[4\]](https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla#:~:text=5) go - WebSocket over TLS: Golang / Gorilla - Stack Overflow

<https://stackoverflow.com/questions/61324875/websocket-over-tls-golang-gorilla>

[\[5\]](https://www.reddit.com/r/CLI/comments/1p4o03u/an_opensource_cli_tool_with_a_tui_dashboard_for/#:~:text=1.%20,system%20for%20a%20localhost%20monitor) An open-source CLI tool with a TUI dashboard for monitoring services : r/CLI

<https://www.reddit.com/r/CLI/comments/1p4o03u/an_opensource_cli_tool_with_a_tui_dashboard_for/>

[\[6\]](https://github.com/steelbrain/node-ssh#:~:text=Node) GitHub - steelbrain/node-ssh: SSH2 with Promises

<https://github.com/steelbrain/node-ssh>

[\[7\]](https://www.redhat.com/en/blog/passwordless-ssh#:~:text=If%20you%20interact%20regularly%20with,public%20and%20private%20key%20pair) Passwordless SSH using public-private key pairs

<https://www.redhat.com/en/blog/passwordless-ssh>

[\[8\]](https://itsfoss.com/apt-list-upgradable/#:~:text=apt%20list%20) List Upgradable Packages With apt Command in Ubuntu

<https://itsfoss.com/apt-list-upgradable/>

[\[9\]](https://dev.to/ducnt114/running-golang-program-as-systemd-service-in-ubuntu-3k7j#:~:text=Create%20system%20service%20file,root%20user%20with%20below%20content) Running Golang program as systemd service in Ubuntu

<https://dev.to/ducnt114/running-golang-program-as-systemd-service-in-ubuntu-3k7j>
