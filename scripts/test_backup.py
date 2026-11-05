"""Exercise backup failure/retention behavior without any database access."""
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parent.parent


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.backups = self.base / 'archives'
        self.backups.mkdir()
        self.previous = self.backups / 'yu-previous.dump'
        self.previous.write_bytes(b'previous valid archive')
        old = time.time() - 40 * 86400
        os.utime(self.previous, (old, old))
        binary = self.base / 'docker'
        binary.write_text('''#!/usr/bin/env bash
set -eu
case " $* " in
  *pg_dump*) echo archive; [[ "${FAIL_DUMP:-0}" != 1 ]];;
  *'pg_restore --list'*) cat > /dev/null; [[ "${FAIL_LIST:-0}" != 1 ]];;
  *' run '*) echo isolated-container;;
  *'pg_isready'*) exit 0;;
  *'pg_restore '*) cat > /dev/null; [[ "${FAIL_RESTORE:-0}" != 1 ]];;
  *'psql '*) cat > /dev/null;;
  *' rm '*) exit 0;;
  *) exit 91;;
esac
''')
        binary.chmod(0o700)
        self.env = {**os.environ, 'PATH': str(self.base) + os.pathsep + os.environ['PATH'], 'YU_BACKUP_CONFIG': '/dev/null', 'YU_BACKUP_DIR': str(self.backups), 'YU_VERIFY_BACKUP': 'false', 'YU_BACKUP_RETENTION_DAYS': '30'}

    def run_backup(self, **extra):
        return subprocess.run(['bash', str(ROOT / 'scripts/backup.sh')], env={**self.env, **extra}, capture_output=True, text=True)

    def assert_failure_preserves_old(self, **extra):
        result = self.run_backup(**extra)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.previous.exists())
        self.assertEqual(list(self.backups.glob('*.partial')), [])

    def test_failed_dump_never_publishes_or_prunes(self):
        self.assert_failure_preserves_old(FAIL_DUMP='1')
        self.assertEqual(list(self.backups.glob('*.dump')), [self.previous])

    def test_invalid_archive_never_publishes_or_prunes(self):
        self.assert_failure_preserves_old(FAIL_LIST='1')
        self.assertEqual(list(self.backups.glob('*.dump')), [self.previous])

    def test_failed_restore_never_prunes_previous_backups(self):
        self.assert_failure_preserves_old(YU_VERIFY_BACKUP='true', FAIL_RESTORE='1')

    def test_success_is_private_and_prunes_only_expired_archives(self):
        unrelated = self.backups / 'keep.dump'
        unrelated.write_bytes(b'not managed by yu')
        result = self.run_backup(YU_VERIFY_BACKUP='true')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.previous.exists())
        self.assertTrue(unrelated.exists())
        archives = list(self.backups.glob('yu-*.dump'))
        self.assertEqual(len(archives), 1)
        self.assertEqual(archives[0].stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.backups.stat().st_mode & 0o777, 0o700)

    def test_repeated_backups_use_distinct_names(self):
        for _ in range(2):
            result = self.run_backup()
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(list(self.backups.glob('yu-*.dump'))), 2)


if __name__ == '__main__':
    unittest.main()
