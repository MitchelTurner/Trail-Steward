#!/bin/sh
set -eu
envsubst '${API_UPSTREAM}' < /etc/nginx/templates-src/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
