import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

let isCleaningUp = false;

// Parse .env file
function loadEnv() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx !== -1) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return env;
}

const envVars = loadEnv();
const webPort = envVars.WEB_PORT || "3000";
const apiPort = envVars.API_PORT || "3001";
const superadminPort = envVars.SUPERADMIN_PORT || "3002";
const proxyPort = envVars.PROXY_PORT || "80";

// Generate Nginx default.conf before starting Docker
function generateNginxConfig() {
  const confDir = path.resolve("conf.d");
  if (!fs.existsSync(confDir)) {
    fs.mkdirSync(confDir, { recursive: true });
  }

  const confContent = `# Upstream backend targets pointing to host machine services
upstream web_backend {
    server host.docker.internal:${webPort};
}

upstream api_backend {
    server host.docker.internal:${apiPort};
}

upstream superadmin_backend {
    server host.docker.internal:${superadminPort};
}

# 1. Default Server: Handles single Ngrok tunnel and path-based routing
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 50M;

    # Common Proxy Headers
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Port \$server_port;

    # WebSocket Support (Next.js Fast Refresh / HMR & Socket.io)
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;

    # Route: /superadmin -> Superadmin App (Port ${superadminPort})
    location /superadmin {
        proxy_pass http://superadmin_backend;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Route: /api -> API Backend (Port ${apiPort})
    location /api {
        proxy_pass http://api_backend;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Route: / -> User Web App (Port ${webPort})
    location / {
        proxy_pass http://web_backend;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}

# 2. Subdomain: superadmin.* (e.g. superadmin.localhost or custom domain)
server {
    listen 80;
    server_name ~^(superadmin|admin)\\..+$;

    client_max_body_size 50M;

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;

    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;

    location / {
        proxy_pass http://superadmin_backend;
    }
}

# 3. Subdomain: api.* (e.g. api.localhost or custom domain)
server {
    listen 80;
    server_name ~^api\\..+$;

    client_max_body_size 50M;

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;

    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;

    location / {
        proxy_pass http://api_backend;
    }
}
`;

  fs.writeFileSync(path.join(confDir, "default.conf"), confContent, "utf8");
}

// Ensure clean exit on Ctrl+C
async function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log("\n\n🛑 Stopping Docker reverse proxy and Ngrok containers...");
  try {
    execSync("docker compose down", { stdio: "inherit" });
    console.log("✅ All Docker services stopped cleanly.");
  } catch (e) {}
  console.log("✨ Goodbye!\n");
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
if (process.platform === "win32") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on("SIGINT", () => {
    cleanup();
  });
}

// Fetch active tunnel URL from the Dockerized Ngrok Web API on localhost:4040
async function fetchNgrokUrl(retries = 25, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch("http://127.0.0.1:4040/api/tunnels");
      if (res.ok) {
        const data = await res.json();
        const tunnels = data.tunnels || [];
        const httpsTunnel = tunnels.find((t) => t.proto === "https") || tunnels[0];
        if (httpsTunnel && httpsTunnel.public_url) {
          return httpsTunnel.public_url;
        }
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

async function main() {
  console.clear?.();
  console.log("====================================================================");
  console.log("🚀 STARTING UNIVERSAL DOCKER REVERSE PROXY & DOCKER NGROK");
  console.log("====================================================================\n");

  if (!envVars.NGROK_AUTHTOKEN) {
    console.log("⚠️  NOTE: NGROK_AUTHTOKEN is empty in .env.");
    console.log("   If you haven't yet, add your token in C:\\workspace\\dev-proxy\\.env\n");
  }

  // 1. Generate Nginx configuration from .env variables
  console.log("📝 Generating Nginx configuration for ports (Web: " + webPort + ", API: " + apiPort + ", Superadmin: " + superadminPort + ")...");
  generateNginxConfig();

  // 2. Start Docker containers
  console.log("🐳 Starting Docker containers (universal-dev-proxy + dev-proxy-ngrok)...");
  execSync("docker compose up -d", { stdio: "inherit" });
  console.log("✅ Docker containers started.\n");

  console.log("⏳ Retrieving Ngrok public tunnel URL from Docker container (port 4040)...");
  const publicUrl = await fetchNgrokUrl(20, 1000);

  console.log("\n====================================================================");
  if (publicUrl) {
    console.log(`🎉 NGROK TUNNEL IS ACTIVE: ${publicUrl}`);
    console.log("====================================================================");
    console.log(`📱 User Web:        ${publicUrl}/            -> Host Port ${webPort}`);
    console.log(`⚡ Superadmin:      ${publicUrl}/superadmin  -> Host Port ${superadminPort}`);
    console.log(`🔌 API Backend:     ${publicUrl}/api         -> Host Port ${apiPort}`);
    console.log(`💻 Local Proxy:     http://localhost:${proxyPort}`);
    console.log(`📊 Ngrok Dashboard: http://localhost:4040`);
  } else {
    console.log("⚠️  Could not detect active tunnel URL from http://127.0.0.1:4040");
    console.log("   Check container logs with: npm run logs:ngrok");
    console.log(`💻 Local Proxy:     http://localhost:${proxyPort}`);
  }
  console.log("====================================================================");
  console.log("👉 Press Ctrl+C at any time to automatically stop Ngrok & Docker.");
  console.log("====================================================================\n");

  setInterval(() => {}, 1000);
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  cleanup();
});
