#!/usr/bin/env python3
"""Install/update only this checkout's daily backup cron entry."""
import hashlib
from pathlib import Path
import shlex
import subprocess

root = Path(__file__).resolve().parent.parent
backup_dir = root / '.backups'
backup_dir.mkdir(mode=0o700, exist_ok=True)
backup_dir.chmod(0o700)
log = backup_dir / 'backup.log'
log.touch(mode=0o600, exist_ok=True)
log.chmod(0o600)
marker = '# yu-backup-' + hashlib.sha256(str(root).encode()).hexdigest()[:12]
current = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
if current.returncode and 'no crontab' not in current.stderr.lower():
    raise SystemExit(current.stderr)
lines = [line for line in current.stdout.splitlines() if marker not in line]
command = f'/bin/bash {shlex.quote(str(root / "scripts/backup.sh"))} >> {shlex.quote(str(log))} 2>&1'
# Cron treats % specially even within shell quotes.
lines.append('15 3 * * * ' + command.replace('%', r'\%') + ' ' + marker)
subprocess.run(['crontab', '-'], input='\n'.join(lines) + '\n', text=True, check=True)
print('已安装每日 03:15 备份（调度主机时区），每周日验证恢复。日志：' + str(log))
