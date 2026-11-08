#!/bin/bash
# Publica la rama `developer` en demo. Corre en la PC: copia lo versionado, nada más (ni el `.env`
# ni `secretos/`), y lo instala en el VPS.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SSH=(ssh -i "$HOME/.ssh/garageproboard" -o IdentitiesOnly=yes -o BatchMode=yes root@72.62.13.196)

"${SSH[@]}" 'rm -rf /var/www/garageproboard-demo/repo && mkdir -p /var/www/garageproboard-demo/repo'
git archive developer | "${SSH[@]}" 'tar x -C /var/www/garageproboard-demo/repo'
"${SSH[@]}" 'bash /var/www/garageproboard-demo/repo/infra/produccion/actualizar-demo.sh'
