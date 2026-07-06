"""
deploy_trading_api.py -- deploy trading-keys-api on prod via SFTP + docker compose rebuild
Run: python deploy_trading_api.py
Requires: deploy.env next to this file (gitignored)
"""
import io
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
deploy_env = HERE / "deploy.env"
if not deploy_env.exists():
    print("ERROR: deploy.env not found")
    sys.exit(1)

creds = {}
for line in deploy_env.read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        creds[k.strip()] = v.strip()

try:
    import paramiko
except ImportError:
    print("ERROR: pip install paramiko")
    sys.exit(1)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {creds['DEPLOY_HOST']}...")
ssh.connect(creds["DEPLOY_HOST"], username=creds["DEPLOY_USER"], password=creds["DEPLOY_PASS"])
print("Connected.\n")


def run(cmd, timeout=300, show=True):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    rc = stdout.channel.recv_exit_status()
    combined = (out + err).strip()
    if show and combined:
        print(combined)
    return rc, combined


# Find trading-keys-api directory on server
print("=== locating trading-keys-api ===")
for candidate in ("/root/trading-keys-api", "/opt/trading-keys-api", "/home/trading-keys-api"):
    rc, _ = run(f"test -d {candidate}", show=False)
    if rc == 0:
        REMOTE_DIR = candidate
        break
else:
    print("ERROR: trading-keys-api not found on server. Tried /root, /opt, /home")
    ssh.close()
    sys.exit(1)

print(f"Found at: {REMOTE_DIR}\n")

# Local files to upload (relative to trading-keys-api root)
LOCAL_ROOT = Path(r"C:\Users\legyx\projects\trading-keys-api")
FILES_TO_UPLOAD = [
    "docker-compose.yml",
    "python/api/main.py",
    "python/api/models.py",
    "python/api/db/__init__.py",
    "python/api/db/trades.py",
    "python/api/routers/trades.py",
    "python/api/routers/balances.py",
]

print("=== uploading files via SFTP ===")
sftp = ssh.open_sftp()

for rel_path in FILES_TO_UPLOAD:
    local_path = LOCAL_ROOT / rel_path
    remote_path = f"{REMOTE_DIR}/{rel_path}"

    # Ensure remote directory exists
    remote_dir = remote_path.rsplit("/", 1)[0]
    run(f"mkdir -p {remote_dir}", show=False)

    sftp.put(str(local_path), remote_path)
    print(f"  uploaded: {rel_path}")

sftp.close()
print()

# Ensure data/trades directory exists for the volume mount
print("=== ensuring data/trades directory ===")
run(f"mkdir -p {REMOTE_DIR}/data/trades")

# Rebuild and recreate the api container (picks up new volume + new code)
print("\n=== docker compose up --build -d api ===")
rc, _ = run(f"cd {REMOTE_DIR} && docker compose up --build -d api", timeout=300)
if rc != 0:
    print("WARN: docker compose returned non-zero, checking status anyway...")

time.sleep(5)
print("\n=== container status ===")
run(f"cd {REMOTE_DIR} && docker compose ps")

print("\nDeploy done.")
ssh.close()
