#!/usr/bin/env python3
"""Verifica infraestrutura, sessao WhatsApp e painel HTTPS; nao testa entrega."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request
import urllib.parse
import uuid


# Executado no agente: a chave existente permanece dentro do container.
WHATSAPP_CHECK = r"""
(async () => {
  try {
    const {EVOLUTION_URL, INSTANCE, API_KEY} = process.env;
    if (!EVOLUTION_URL || !INSTANCE || !API_KEY) throw new Error();
    const response = await fetch(
      EVOLUTION_URL.replace(/\/$/, '') + '/instance/connectionState/' + encodeURIComponent(INSTANCE),
      {headers: {apikey: API_KEY}, signal: AbortSignal.timeout(8000), redirect: 'error'}
    );
    if (!response.ok) throw new Error();
    const data = await response.json();
    if ((data.instance?.state || data.state) !== 'open') throw new Error();
    process.stdout.write('WHATSAPP_OK');
  } catch (_) { process.exitCode = 1; }
})();
"""


def check_whatsapp(container):
    result = subprocess.run(['docker', 'exec', container, 'node', '-e', WHATSAPP_CHECK],
                            capture_output=True, text=True, timeout=15, check=True)
    if result.stdout.strip() != 'WHATSAPP_OK':
        raise RuntimeError()


def check_public():
    url = os.environ.get('SMARTDEV_PUBLIC_URL', 'https://painel.smartdevai.com.br/painel/')
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or
            parsed.password or parsed.query or parsed.fragment):
        raise ValueError()
    request = urllib.request.Request(url + '?monitor=' + uuid.uuid4().hex,
                                     headers={'Cache-Control': 'no-cache',
                                              'User-Agent': 'SmartDev-Monitor/1.0'})
    with urllib.request.urlopen(request, timeout=15) as response:
        final = urllib.parse.urlsplit(response.geturl())
        if (response.status != 200 or final.scheme != 'https' or
                final.netloc != parsed.netloc or final.path != parsed.path or
                '<title>SmartDev AI | Atendimento</title>' not in
                response.read(131072).decode('utf-8', errors='replace')):
            raise RuntimeError()


def main():
    compose = ['docker', 'compose', '-f', '/opt/smartdev/docker-compose.vps.yml']
    services = ['agente', 'mongo', 'postgres', 'redis', 'evolution-api', 'proxy', 'cloudflared']
    healthy = {'agente', 'mongo', 'postgres', 'redis'}
    stage = 'configuracao'
    try:
        url = Path('/root/.config/smartdev/healthchecks-agente.url').read_text().strip()
        if not re.fullmatch(r'https://hc-ping\.com/[0-9a-fA-F-]{36}', url):
            raise ValueError()
        containers = {}
        for service in services:
            stage = 'container ' + service
            ids = subprocess.run(compose + ['ps', '-q', service], capture_output=True,
                                 text=True, timeout=10, check=True).stdout.split()
            if len(ids) != 1:
                raise RuntimeError()
            containers[service] = ids[0]
            state = subprocess.run(['docker', 'inspect', '--format', '{{json .State}}', ids[0]],
                                   capture_output=True, text=True, timeout=10, check=True)
            state = json.loads(state.stdout)
            if not state.get('Running') or state.get('Restarting'):
                raise RuntimeError()
            if service in healthy and state.get('Health', {}).get('Status') != 'healthy':
                raise RuntimeError()
        stage = 'HTTP local'
        with urllib.request.urlopen('http://127.0.0.1:3000/', timeout=10) as response:
            if response.status != 200:
                raise RuntimeError()
        stage = 'conexao WhatsApp'
        check_whatsapp(containers['agente'])
        stage = 'painel HTTPS publico'
        check_public()
    except Exception:
        print('Falha na verificacao: ' + stage + '; nenhum sinal de sucesso enviado.', file=sys.stderr)
        return 1
    try:
        request = urllib.request.Request(url, data=b'', method='POST')
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status != 200 or response.read(100).strip() != b'OK':
                raise RuntimeError()
        print('Containers, HTTP local, WhatsApp conectado e painel HTTPS publico OK; '
              'sinal recebido pelo Healthchecks.')
        return 0
    except Exception:
        print('Falha ao confirmar sinal externo; detalhes privados omitidos.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
