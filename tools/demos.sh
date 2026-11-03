#!/usr/bin/env bash
# Password-gated client demos at https://lewisthompson.dev/for/<slug>/. Run from anywhere on the Air.
#
#   demos.sh publish <slug> <dir> [--name "Business name"] [--password <pw>] [--dry-run]
#                               mirror <dir> to the demo (needs <dir>/index.html). The first publish needs
#                               --name and makes a password, printed once; later ones keep both.
#   demos.sh password <slug> [<pw>]   set a new password (made up if not given), printed once
#   demos.sh name <slug> "<name>"     change the name the gate shows
#   demos.sh list                     what is published, with names, sizes and whether it has a key
#   demos.sh remove <slug>            take a demo down (quarantined on the box, not deleted)
#   demos.sh setup                    install or update the nginx side from tools/nginx/ (idempotent)
#
# How it works: tools/nginx/demos-http.conf. The box keeps only sha256 of each password, so a lost password
# can't be read back: set a new one. Never commit a password; Lewis keeps them in 1Password.
set -euo pipefail

DROPLET=${DROPLET:-root@170.64.189.221}
BASE=${DEMOS_BASE:-https://lewisthompson.dev}
ROOT=/var/www/lewisthompson-demos
MAP=/etc/nginx/lewisthompson-demos.map
VHOST=/etc/nginx/sites-available/lewisthompson
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Plain words a client can read off a message and type on a phone: three of them and a number is ~27 bits,
# and nginx lets an address guess twelve times a minute
WORDS="amber anchor apple arrow aspen autumn badge basil beacon berry birch bloom bridge brook cabin canyon
candle canvas cedar cherry cider clover cobalt comet copper coral cotton crane cricket crystal dawn delta
desert dune ember fable falcon feather fern forest fossil garden garnet ginger glacier granite grove harvest
hazel heron honey island ivory jasmine juniper kettle lagoon lantern lemon linen lotus maple marble meadow
mint mirror moss nectar oasis ocean olive orchid otter paddle palm pebble pepper pine planet plum poppy quartz
quill raven reef ridge river robin saffron sage salt sierra silver sparrow spruce stone summit sunset thistle
thunder tide timber topaz tulip valley velvet violet walnut willow winter"

die() { echo "demos: $*" >&2; exit 1; }
slugok() { [[ $1 =~ ^[a-z0-9][a-z0-9-]{0,47}$ ]] || die "slug must be lowercase letters, digits and dashes: $1"; }
# the gate trims and lowercases what is typed (site/gate/gate.js); so does this, so both hash the same string
norm() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }
keyof() { printf 'lewisthompson.dev/for/%s\n%s' "$1" "$2" | shasum -a 256 | cut -d' ' -f1; }
newpw() { python3 -c 'import secrets, sys; w = sys.argv[1:]; print("-".join(secrets.choice(w) for _ in range(3)) + "-" + str(secrets.randbelow(90) + 10))' $WORDS; }
box() { ssh -o ConnectTimeout=15 "$DROPLET" "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# the box's half of a key change: swap the slug's line, test, reload, or put the old map back
setkey() {
  local slug=$1 hash=$2
  box "set -e; touch $MAP; chmod 600 $MAP; cp $MAP $MAP.bak
       grep -v '^\"$slug:' $MAP.bak > $MAP || true
       echo '\"$slug:$hash\" 1;' >> $MAP
       if nginx -t -q 2>/dev/null; then systemctl reload nginx; else cp $MAP.bak $MAP; nginx -t; exit 1; fi"
}

setname() {
  local slug=$1 name=$2
  python3 -c 'import json, sys; print(json.dumps({"name": sys.argv[1]}))' "$name" \
    | box "mkdir -p $ROOT/for/$slug && cat > $ROOT/for/$slug/_gate.json && chown -R www-data:www-data $ROOT/for/$slug"
}

announce() {
  local slug=$1 pw=$2
  echo
  echo "  $BASE/for/$slug/"
  echo "  password: $pw"
  echo
  echo "  Shown once: the box keeps only its hash. Save it in 1Password as \"lewisthompson.dev · for/$slug\"."
}

# a request without the cookie gets the gate; one with the box's own key gets the demo
verify() {
  local slug=$1 hash
  hash=$(box "grep '^\"$slug:' $MAP | head -1 | sed -E 's/^\"[^:]+:([0-9a-f]+)\".*/\1/'")
  local shut open
  shut=$(code "$BASE/for/$slug/"); open=$(code -b "demo_key=$hash" "$BASE/for/$slug/")
  echo "verify: without the password $shut (want 401), with it $open (want 200)"
  [[ $shut == 401 && $open == 200 ]] || die "verification failed"
}

cmd=${1:-}; shift || true
case $cmd in
  publish)
    slug=${1:-}; dir=${2:-}; shift 2 || die "usage: demos.sh publish <slug> <dir> [--name NAME] [--password PW] [--dry-run]"
    slugok "$slug"; name=; pw=; dry=
    while (($#)); do case $1 in
      --name) name=$2; shift 2 ;;
      --password) pw=$(norm "$2"); shift 2 ;;
      --dry-run) dry=1; shift ;;
      *) die "unknown option $1" ;;
    esac; done
    [[ -d $dir ]] || die "no such directory: $dir"
    [[ -f $dir/index.html ]] || die "$dir has no index.html: the demo's front page is /for/$slug/"
    # internal notes (*.md) and repo furniture never ship: a client reads everything in the folder
    excl=(--exclude .DS_Store --exclude .git --exclude .gitignore --exclude .claude --exclude node_modules --exclude '*.md' --exclude '.env*' --exclude /_gate.json)
    echo "publishing $(du -sh "$dir" | cut -f1) from $dir to $BASE/for/$slug/"
    if [[ -n $dry ]]; then
      # what would go (>f) and what would be deleted from the box (*deleting); nothing is sent
      rsync -rlptzn --delete --itemize-changes "${excl[@]}" "$dir/" "$DROPLET:$ROOT/for/$slug/"
      exit 0
    fi
    state=$(box "test -f $ROOT/for/$slug/_gate.json && echo named; grep -q '^\"$slug:' $MAP 2>/dev/null && echo keyed; true")
    [[ $state == *named* || -n $name ]] || die "first publish of $slug: give --name \"Business name\" for the gate"
    box "mkdir -p $ROOT/for/$slug"
    [[ -n $name ]] && setname "$slug" "$name"
    rsync -rlptz --delete "${excl[@]}" "$dir/" "$DROPLET:$ROOT/for/$slug/"
    box "chown -R www-data:www-data $ROOT/for/$slug && chmod -R u=rwX,go=rX $ROOT/for/$slug"
    if [[ -n $pw || $state != *keyed* ]]; then
      shown=${pw:-$(newpw)}
      setkey "$slug" "$(keyof "$slug" "$shown")"
    fi
    verify "$slug"
    [[ -n ${shown:-} ]] && announce "$slug" "$shown" || echo "  $BASE/for/$slug/ (password unchanged)"
    ;;
  password)
    slug=${1:-}; slugok "$slug"
    box "test -d $ROOT/for/$slug" || die "$slug isn't published"
    shown=$(norm "${2:-$(newpw)}")
    setkey "$slug" "$(keyof "$slug" "$shown")"
    verify "$slug"; announce "$slug" "$shown"
    ;;
  name)
    slug=${1:-}; name=${2:-}; slugok "$slug"; [[ -n $name ]] || die "usage: demos.sh name <slug> \"Business name\""
    box "test -d $ROOT/for/$slug" || die "$slug isn't published"
    setname "$slug" "$name"; echo "$slug: $name"
    ;;
  list)
    box "bash -s -- $ROOT $MAP" <<'EOF'
cd "$1/for" 2>/dev/null || exit 0
for d in */; do
  s=${d%/}; [[ -d $s ]] || continue
  n=$(sed -nE 's/.*"name": *"([^"]*)".*/\1/p' "$s/_gate.json" 2>/dev/null)
  grep -q "^\"$s:" "$2" && k=key || k=NO-KEY
  printf '%-24s %-6s %-7s %s  %s\n' "$s" "$(du -sh "$s" | cut -f1)" "$k" "$(date -r "$s" +%F)" "${n:-?}"
done
EOF
    ;;
  remove)
    slug=${1:-}; slugok "$slug"
    q=/var/www/_quarantine-$(date +%F)
    box "set -e; test -d $ROOT/for/$slug
         mkdir -p $q; mv $ROOT/for/$slug $q/lewisthompson-demos-$slug
         cp $MAP $MAP.bak; grep -v '^\"$slug:' $MAP.bak > $MAP || true
         nginx -t -q && systemctl reload nginx"
    echo "removed $slug: files in $q/lewisthompson-demos-$slug on the box, key dropped"
    echo "now $(code "$BASE/for/$slug/") at $BASE/for/$slug/ (the gate answers 401 for anything without a key)"
    ;;
  setup)
    # staged beside the live files, swapped in together, and all put back if nginx -t refuses the result
    scp -q "$HERE/nginx/demos-http.conf" "$DROPLET:/etc/nginx/snippets/lewisthompson-demos-http.conf.new"
    scp -q "$HERE/nginx/demos-server.conf" "$DROPLET:/etc/nginx/snippets/lewisthompson-demos-server.conf.new"
    scp -q "$HERE/nginx/demos-maphash.conf" "$DROPLET:/etc/nginx/conf.d/lewisthompson-demos-maphash.conf.new"
    box "bash -s -- $ROOT $MAP $VHOST" <<'EOF'
set -e
ROOT=$1 MAP=$2 VHOST=$3
H=/etc/nginx/snippets/lewisthompson-demos-http.conf S=/etc/nginx/snippets/lewisthompson-demos-server.conf C=/etc/nginx/conf.d/lewisthompson-demos-maphash.conf
touch $MAP; chmod 600 $MAP; mkdir -p $ROOT/for; chown -R www-data:www-data $ROOT
cp $VHOST /root/lewisthompson.nginx.bak-$(date +%Y%m%d-%H%M%S)
B=/tmp/demos-setup-prev; rm -rf $B; mkdir $B; cp $VHOST $B/vhost
for f in $H $S $C; do [ -f $f ] && cp $f $B/$(basename $f) || true; done
put_back() { cp $B/vhost $VHOST; for f in $H $S $C; do if [ -f $B/$(basename $f) ]; then cp $B/$(basename $f) $f; else rm -f $f; fi; done; }
for f in $H $S $C; do mv $f.new $f; done
grep -q lewisthompson-demos-http $VHOST || sed -i '0,/^server {/s||include /etc/nginx/snippets/lewisthompson-demos-http.conf;\n\nserver {|' $VHOST
grep -q lewisthompson-demos-server $VHOST || sed -i 's|^    server_name lewisthompson.dev;|&\n\n    include /etc/nginx/snippets/lewisthompson-demos-server.conf;|' $VHOST
grep -q lewisthompson-demos-server $VHOST || { put_back; echo 'apex server block not found'; exit 1; }
if nginx -t -q 2>/dev/null; then systemctl reload nginx; else nginx -t || true; put_back; nginx -t -q && echo 'put the previous config back'; exit 1; fi
diff $B/vhost $VHOST || true
EOF
    echo "setup: nginx reloaded; /for/ now $(code "$BASE/for/") (want 404)"
    ;;
  *) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
