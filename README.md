# 🌐 Universal Dev Reverse Proxy & Docker Ngrok Tunnel

A standalone, universal development reverse proxy running in Docker.  
Routes traffic from a **single Dockerized Ngrok tunnel** to any projects running on your local machine.

---

## 🎯 Architecture

```text
                           [ Internet / Mobile / Remote ]
                                         │
                                         ▼
                            [ Ngrok Tunnel in Docker ]
                                         │
                                         ▼
                         [ Nginx Reverse Proxy in Docker ]
                                    (Port 80)
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   ▼                     ▼                     ▼
             Path: /               Path: /api            Path: /superadmin
                   │                     │                     │
                   ▼                     ▼                     ▼
           [ Host Port 3000 ]    [ Host Port 3001 ]    [ Host Port 3002 ]
               User Web                 API                Superadmin
           (Next.js / Vite)       (NestJS / Express)        (Next.js)
```
## 📋 Minimum Requirements

Before running the reverse proxy and tunnel, make sure your computer meets the following requirements:

| Tool / Service | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v18.0.0+` | `v20+` or `v22+` | Required for native `fetch` and ESM execution in `run.mjs` |
| **Docker Engine** | `v20.10+` | Latest | Docker Desktop must be running in the background |
| **Docker Compose**| `v2.0.0+` | Latest | Compose V2 CLI (`docker compose`) |
| **Ngrok Account** | Free or Paid | Free tier | [Sign up for free](https://dashboard.ngrok.com/) to get your authtoken |
| **Package Manager** | Any | `pnpm` or `npm` | To run `pnpm dev`, `npm start`, or `node run.mjs` |
| **Local Port 80** | Unoccupied | Port 80 | If port 80 is used by IIS or Skype, change `PROXY_PORT=8080` in `.env` |

---

### Quick Verification Commands

Verify your installed versions in terminal:

```bash
# 1. Check Node.js
node -v          # Should output v18.0.0 or higher

# 2. Check Docker
docker -v        # Should output Docker version 20+

# 3. Check Docker Compose
docker compose version  # Should output Docker Compose version v2+

---

## ⚙️ Configuration (.env)

Open `C:\workspace\dev-proxy\.env` to configure your token and target ports:

```env
# 1. Your Ngrok Authtoken (Get from https://dashboard.ngrok.com/get-started/your-authtoken)
NGROK_AUTHTOKEN=your_ngrok_token_here

# 2. Local Host Ports for Services running on your machine
WEB_PORT=3000
API_PORT=3001
SUPERADMIN_PORT=3002

# 3. Reverse Proxy Host Port (Default: 80)
PROXY_PORT=80
```

---

## 🚀 How to Run

### Step 1: Start the Proxy & Tunnel
In the `C:\workspace\dev-proxy` directory, run:

```bash
npm start
# or: pnpm start
```

This command automatically:
1. Starts the **Nginx** reverse proxy container on port `80`.
2. Starts the **Ngrok** container in Docker with your authtoken.
3. Retrieves the public tunnel URL and displays your routing dashboard:

```text
====================================================================
🎉 NGROK TUNNEL IS ACTIVE: https://xxxx-xx-xx.ngrok-free.app
====================================================================
📱 User Web:        https://xxxx-xx-xx.ngrok-free.app/            -> Host Port 3000
⚡ Superadmin:      https://xxxx-xx-xx.ngrok-free.app/superadmin  -> Host Port 3002
🔌 API Backend:     https://xxxx-xx-xx.ngrok-free.app/api         -> Host Port 3001
💻 Local Proxy:     http://localhost:80
📊 Ngrok Dashboard: http://localhost:4040
====================================================================
```

---

### Step 2: Run Any of Your Projects!

In another terminal, open your project and start your dev servers:

#### For `monorepo-setup`:
```bash
cd C:\workspace\monorepo-setup
pnpm dev
```

#### For `restaurant`:
```bash
cd C:\workspace\restaurant
pnpm dev
```

Both projects use ports **3000**, **3001**, and **3002**, so you can switch between them without touching the proxy!

---

### 🛑 Clean Shutdown

Whenever you are done, press <kbd>Ctrl</kbd> + <kbd>C</kbd> in the proxy terminal.  
It will automatically run `docker compose down`, stopping both Ngrok and Nginx cleanly.

---

## 🛠️ Management Commands

| Command | Action |
| :--- | :--- |
| `npm start` / `pnpm start` | Start reverse proxy + Ngrok and display URLs |
| `npm run stop` | Stop all Docker proxy containers |
| `npm run logs` | Stream logs from all proxy containers |
| `npm run logs:ngrok` | Stream live logs specifically from the Docker Ngrok container |
| `npm run logs:proxy` | Stream live logs specifically from the Nginx container |
