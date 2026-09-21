#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /opt/smartdev
mkdir -p /opt/smartdev/backups-vps
chmod 700 /opt/smartdev/backups-vps
exec 9>/opt/smartdev/backups-vps/.lock
flock -n 9 || { echo 'Outro backup esta em andamento.'; exit 1; }
compose=(docker compose -f /opt/smartdev/docker-compose.vps.yml)
rclone_image=rclone/rclone:1.75.1
if ! docker image inspect "$rclone_image" >/dev/null 2>&1; then
    echo "Imagem de backup ausente; baixando $rclone_image antes da captura..."
    docker pull "$rclone_image" || { echo 'Falha ao baixar imagem de backup; captura nao iniciada.' >&2; exit 1; }
fi
test -s /root/.config/rclone/rclone.conf
for service in agente evolution-api mongo postgres; do
    test -n "$("${compose[@]}" ps --status running -q "$service")" || { echo "Servico indisponivel: $service"; exit 1; }
done
evolution=$("${compose[@]}" ps -q evolution-api)
name="backup-$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid)"
work="/opt/smartdev/backups-vps/$name"
mkdir -m 700 "$work" "$work/dados" "$work/recuperado"
paused=0
finish() {
    result=$?
    trap - EXIT
    if (( paused )); then
        if ! "${compose[@]}" start evolution-api agente; then
            echo 'ERRO: verificar retomada do atendimento imediatamente.' >&2
            result=1
        fi
    fi
    if (( result != 0 )); then
        echo "Backup FALHOU: $name. Arquivos locais preservados." >&2
    fi
    exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
paused=1
echo 'Pausando atendimento para captura consistente...'
"${compose[@]}" stop -t 120 agente
"${compose[@]}" stop -t 30 evolution-api
"${compose[@]}" exec -T mongo mongodump --db=agente --gzip --archive > "$work/dados/mongo.archive.gz"
"${compose[@]}" exec -T postgres pg_dump -U postgres -d evolution --format=custom > "$work/dados/postgres.dump"
docker run --rm --network none --volumes-from "$evolution:ro" --entrypoint tar agente-whatsapp-agente:latest -czf - -C /evolution/instances . > "$work/dados/whatsapp-session.tar.gz"
"${compose[@]}" start evolution-api agente
paused=0
echo 'Atendimento retomado. Preparando envio criptografado...'
tar --exclude=node_modules --exclude='*.log' --exclude=__pycache__ -czf "$work/dados/projeto.tar.gz" .env docker-compose.vps.yml agente caddy scripts
for file in mongo.archive.gz postgres.dump whatsapp-session.tar.gz projeto.tar.gz; do
    test -s "$work/dados/$file"
done
(cd "$work/dados" && sha256sum mongo.archive.gz postgres.dump whatsapp-session.tar.gz projeto.tar.gz > SHA256SUMS)
tar -czf "$work/backup.tar.gz" -C "$work/dados" .
remote="backup-crypt:diarios/$name.tar.gz"
docker run --rm -v /root/.config/rclone:/config/rclone:ro -v "$work:/backup:ro" "$rclone_image" copyto /backup/backup.tar.gz "$remote" --retries 3
docker run --rm -v /root/.config/rclone:/config/rclone:ro -v "$work/recuperado:/recuperado" "$rclone_image" copyto "$remote" /recuperado/backup.tar.gz --retries 3
cmp "$work/backup.tar.gz" "$work/recuperado/backup.tar.gz"
printf '%s\n' "$name" > "$work/verificado.ok"
printf '%s\n' "$name" > /opt/smartdev/backups-vps/ultimo-verificado.txt
echo "BACKUP OK: $name; copia externa baixada, descriptografada e conferida byte a byte."
flock -u 9
python3 /opt/smartdev/scripts/limpar-backups-vps.py --apply
python3 /opt/smartdev/scripts/confirmar-backup-healthchecks.py
