"""
deploy.py -- deploi Life Pilot na prod
Zapusk: python deploy.py
Trebuet: deploy.env ryadom s etim failom (uzhe est', v .gitignore)
"""
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


print("=== git pull ===")
rc, _ = run("cd /opt/life-pilot && git pull")
if rc != 0:
    print("FAILED: git pull")
    ssh.close()
    sys.exit(1)

# Stop Caddy first to free port 80/443 before rebuild
print("\n=== stopping caddy ===")
run("docker stop life-pilot-caddy-1 2>/dev/null || true", show=False)

print("\n=== docker compose up --build ===")
rc, _ = run("cd /opt/life-pilot/infra && docker compose up --build -d", timeout=300)
if rc != 0:
    # Fallback: start caddy separately if port race condition occurs
    print("Caddy start failed, retrying...")
    run("docker start life-pilot-caddy-1", timeout=30)

time.sleep(5)
print("\n=== container status ===")
run("cd /opt/life-pilot/infra && docker compose ps")

print("\nDeploy done.")
ssh.close()
