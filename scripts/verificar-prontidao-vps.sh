#!/usr/bin/env bash
set -u
cd /opt/smartdev || exit 1
compose=(docker compose -f docker-compose.vps.yml)
falhas=0
ok() { printf 'OK   %s\n' "$1"; }
falha() { printf 'FALHA %s\n' "$1" >&2; falhas=$((falhas + 1)); }
for servico in agente mongo postgres redis evolution-api proxy cloudflared; do
  id=$("${compose[@]}" ps -q "$servico" 2>/dev/null)
  if [[ -z "$id" ]]; then falha "container $servico ausente"; continue; fi
  estado=$(docker inspect --format '{{.State.Status}}' "$id" 2>/dev/null)
  [[ "$estado" == running ]] && ok "container $servico em execução" || falha "container $servico: $estado"
done
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/ >/dev/null && ok 'painel local responde' || falha 'painel local não responde'
agente=$("${compose[@]}" ps -q agente 2>/dev/null)
if [[ -n "$agente" ]] && docker exec "$agente" node -e "(async()=>{const r=await fetch(process.env.EVOLUTION_URL.replace(/\/$/,'')+'/instance/connectionState/'+encodeURIComponent(process.env.INSTANCE),{headers:{apikey:process.env.API_KEY},signal:AbortSignal.timeout(8000)});const d=await r.json();if(!r.ok||(d.instance?.state||d.state)!=='open')process.exit(1)})().catch(()=>process.exit(1))"; then ok 'WhatsApp autenticado'; else falha 'WhatsApp não está autenticado'; fi
for timer in smartdev-monitor.timer smartdev-backup.timer; do
  if systemctl is-enabled --quiet "$timer" && systemctl is-active --quiet "$timer"; then ok "$timer habilitado e ativo"; else falha "$timer não está habilitado e ativo"; fi
done
ultimo=/opt/smartdev/backups-vps/ultimo-verificado.txt
if [[ -s "$ultimo" ]]; then
  idade=$(( $(date +%s) - $(stat -c %Y "$ultimo") ))
  if (( idade <= 129600 )); then ok "backup externo verificado há $((idade / 3600))h"; else falha "último backup verificado tem mais de 36h"; fi
else falha 'não há registro do último backup verificado'; fi
uso=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [[ -n "$uso" && "$uso" -lt 85 ]]; then ok "disco em ${uso}%"; else falha "uso de disco crítico: ${uso:-desconhecido}%"; fi
if (( falhas )); then printf '\nResultado: NÃO PRONTO (%d falha(s)).\n' "$falhas" >&2; exit 1; fi
printf '\nResultado: infraestrutura pronta para o teste comercial assistido.\n'