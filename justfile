# lewisthompson.dev: a static personal site, served from the Sydney droplet.
# site/ is the deploy root, exactly as it ships: no build step, nothing generated
# at deploy time. Fonts are the one derived artefact (see `fonts`).

set shell := ["bash", "-euo", "pipefail", "-c"]

DROPLET := "root@170.64.189.221"
PORT    := "4747"

default:
    @just --list --unsorted

# Serve site/ locally at http://127.0.0.1:4747
serve:
    python3 -m http.server {{PORT}} --bind 127.0.0.1 --directory site

# Re-subset the faces into site/fonts. Run after changing a pinned axis or the Latin set.
fonts:
    python3 tools/fonts.py

# Target and convention live in the droplet's /root/REGISTER.md; update its Recent Changes when a deploy changes anything structural.
# --delete mirrors site/ exactly, so anything left in site/ ships.
# Publish site/ to https://lewisthompson.dev
deploy:
    rsync -avz --delete --exclude '.DS_Store' site/ {{DROPLET}}:/var/www/lewisthompson/
    ssh {{DROPLET}} 'chown -R www-data:www-data /var/www/lewisthompson'
    curl -sI https://lewisthompson.dev | head -1
