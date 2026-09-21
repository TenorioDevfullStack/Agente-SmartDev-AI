# O Caddyfile entra na imagem em vez de vir por bind mount: neste Docker
# Desktop o drive E: não está compartilhado, e montar ./caddy devolveria um
# diretório vazio — o proxy subiria sem allowlist nenhuma. O build context é o
# mesmo mecanismo que o serviço "agente" já usa e que comprovadamente funciona.
# Consequência: mexeu no Caddyfile, suba com "docker compose up -d --build proxy".
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
