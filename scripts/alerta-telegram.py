#!/usr/bin/env python3
"""Envia aviso operacional fixo, sem logs nem dados dos clientes."""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    origem = sys.argv[1] if len(sys.argv) == 2 else ""
    mensagens = {
        "smartdev-backup": (
            "SmartDev: o servico de backup FALHOU. Verifique a VPS e o atendimento. "
            "Consulte: journalctl -u smartdev-backup.service -n 50 --no-pager. "
            "A copia externa desta execucao nao esta confirmada."
        ),
        "teste": "SmartDev: TESTE do alerta automatico concluido. Nenhum backup real foi interrompido.",
    }
    if origem not in mensagens:
        print("Origem de alerta invalida.", file=sys.stderr)
        return 1
    try:
        with open("/root/.config/smartdev/telegram.json", encoding="utf-8") as arquivo:
            config = json.load(arquivo)
        corpo = urllib.parse.urlencode({"chat_id": config["chat_id"], "text": mensagens[origem]}).encode()
        url = "https://api.telegram.org/bot" + config["token"] + "/sendMessage"
    except Exception:
        print("Configuracao do Telegram indisponivel; detalhes omitidos.", file=sys.stderr)
        return 1
    for tentativa in range(3):
        try:
            requisicao = urllib.request.Request(url, data=corpo)
            with urllib.request.urlopen(requisicao, timeout=15) as resposta:
                if json.load(resposta).get("ok"):
                    print("Telegram aceitou o alerta.")
                    return 0
        except Exception:
            pass  # Nunca registrar URL/token ou resposta contendo dados pessoais.
        if tentativa < 2:
            time.sleep(3)
    print("Falha ao enviar alerta Telegram apos 3 tentativas.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
