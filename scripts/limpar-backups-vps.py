#!/usr/bin/env python3
"""Retencao local; simulacao por padrao. Nunca remove copias sem marcador."""
import fcntl
import os
from pathlib import Path
import re
import shutil
import sys

ROOT = Path('/opt/smartdev/backups-vps')
PATTERN = re.compile(r'backup-\d{8}T\d{6}Z-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}')


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise RuntimeError('Use sem argumentos para simular, ou --apply para aplicar.')
    apply = sys.argv[1:] == ['--apply']
    if ROOT.is_symlink() or ROOT.resolve() != ROOT:
        raise RuntimeError('Diretorio de backups invalido.')
    with (ROOT / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        latest = (ROOT / 'ultimo-verificado.txt').read_text().strip()
        if not PATTERN.fullmatch(latest):
            raise RuntimeError('Identificador do ultimo backup invalido.')
        verified = []
        for path in ROOT.iterdir():
            if not PATTERN.fullmatch(path.name) or path.is_symlink() or not path.is_dir():
                continue
            marker = path / 'verificado.ok'
            if marker.is_symlink() or not marker.is_file():
                continue
            if marker.read_text().strip() == path.name:
                verified.append(path)
        verified.sort(key=lambda path: path.name, reverse=True)
        removed = 0
        for path in verified[7:]:
            if path.name == latest:
                continue
            if path.resolve().parent != ROOT or path.is_symlink():
                raise RuntimeError('Caminho fora do diretorio autorizado.')
            print(('REMOVER: ' if apply else 'SIMULACAO: ') + path.name)
            if apply:
                if not shutil.rmtree.avoids_symlink_attacks:
                    raise RuntimeError('Plataforma sem remocao segura de links.')
                shutil.rmtree(path)
            removed += 1
        print(f'{removed} copia(s) elegivel(is). Preservadas as 7 verificadas mais recentes, a ultima e todas sem marcador.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Limpeza interrompida: ' + str(error), file=sys.stderr)
        sys.exit(1)
