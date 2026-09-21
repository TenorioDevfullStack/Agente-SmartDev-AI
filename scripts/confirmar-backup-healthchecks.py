#!/usr/bin/env python3
"""Confirma execucao concluida; nunca registra a URL privada."""
import re
import sys
import time
import urllib.request
from pathlib import Path


def main():
    try:
        url = Path('/root/.config/smartdev/healthchecks-backup.url').read_text().strip()
        if not re.fullmatch(r'https://hc-ping\.com/[0-9a-fA-F-]{36}', url):
            raise ValueError()
    except Exception:
        print('Configuracao Healthchecks ausente ou invalida.', file=sys.stderr)
        return 1
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, data=b'', method='POST')
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status == 200 and response.read(100).strip() == b'OK':
                    print('Conclusao do backup confirmada ao Healthchecks.')
                    return 0
        except Exception:
            pass
        if attempt < 2:
            time.sleep(3)
    print('Backup local concluido, mas confirmacao Healthchecks falhou.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
