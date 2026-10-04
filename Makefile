# Sora: dev, checks, screenshots. The game deploys from GitHub Actions on
# every push to main; infra/ is the analytics pixel host, the one thing
# this Makefile deploys.
#
#   make dev           # vite dev server, reachable on the LAN for a phone
#   make build         # production build -> dist/
#   make preview       # build, then serve it locally
#   make check         # typecheck + build + physics-check + sim-check, what a commit needs green
#   make balance       # bot lap times per car (LAPS ?= 3 TRACK ?=)
#   make shots-setup   # once: install Playwright
#   make shots         # phone screenshots into shots/
#   make shots-en      # the same in English, into shots/en/
#   make icon          # render public/icon.svg to the PNG icons
#   make lineup        # every vehicle in the game on one canvas -> shots/lineup.png
#   make touch-check   # drives the race by touch on an emulated phone
#   make drive-log     # set pieces by touch on a phone, the physics logged (PHYSICS=old for the old model)
#   make stuck-check   # a wedged car frees itself, on the phone layout (PORT=5187 if 5197 is taken)
#   make rotate-check  # turning the phone must not break the view (PORT=5187 if 5197 is taken)
#   make playthrough   # the first hour by thumb on a phone, a video per race (RACES=jm-kiviaho,... for a subset)
#   make pwa-check     # manifest, icons, service worker, offline (URL ?= the live site)
#   make plan          # terraform plan for the pixel infra (no changes)
#   make apply         # terraform apply (creates AWS resources), then make env
#   make outputs       # show terraform outputs (pixel_url etc.)
#   make deploy-pixel  # upload t.gif to the pixel bucket
#
# AWS profile: personal by default; PROFILE=name overrides. Terraform is
# the mise-pinned one (.mise.toml): run `mise install` once.

PROFILE ?= personal
AWS      = AWS_PROFILE=$(PROFILE) aws
TF       = AWS_PROFILE=$(PROFILE) terraform -chdir=infra

.PHONY: dev build preview check balance shots-setup shots shots-en icon lineup touch-check drive-log stuck-check rotate-check playthrough pwa-check plan apply outputs env deploy-pixel

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

check:
	npm run typecheck
	npm run build
	npm run physics-check
	npm run sim-check

LAPS ?= 3
TRACK ?=
balance:
	npm run balance -- $(LAPS) $(TRACK)

shots-setup:
	npm install --no-save playwright && npx playwright install chromium

shots:
	node scripts/shots.mjs

shots-en:
	node scripts/shots.mjs en

icon:
	node scripts/icon.mjs

lineup:
	node scripts/lineup.mjs

touch-check:
	node scripts/touch-check.mjs

PHYSICS ?= new
drive-log:
	node scripts/drive-log.mjs $(PHYSICS)

# the owner's stuck spot, driven on the phone layout: a wedged car must free itself
stuck-check:
	node scripts/stuck-check.mjs

# turning the phone mid-race and in the menus, with iOS's late layout played in
rotate-check:
	node scripts/rotate-check.mjs

# the first hour of the career on an emulated iPhone, every input a touch, a hand that is not the
# bot at the wheel: a video, a result sheet and frame sheets per race into shots/playthrough/,
# summary.md with the places and laps. The proof a handling or balance change is read against
RACES ?=
playthrough:
	RACES=$(RACES) node scripts/playthrough.mjs

URL ?= https://vesahyp.github.io/sora/
pwa-check:
	node scripts/pwa-check.mjs $(URL)

plan:
	$(TF) init -input=false
	$(TF) plan -out=tfplan

apply:
	$(TF) apply tfplan
	$(MAKE) env

outputs:
	@$(TF) output

# The pixel URL for builds on this machine, from the Terraform output.
# Gitignored (*.local): a clone without it builds a game whose tracker is
# off, which is what a fork should get. The Pages deploy reads the same
# value from a GitHub repository variable.
env:
	@printf 'VITE_PIXEL_URL=%s\n' "$$($(TF) output -raw pixel_url)" > .env.local
	@cat .env.local

# The pixel must never cache: every beacon has to reach the origin so the
# request (and its query string) lands in the CloudFront access logs.
deploy-pixel:
	@BUCKET=$$($(TF) output -raw bucket_name); \
	DIST=$$($(TF) output -raw distribution_id); \
	$(AWS) s3 cp public/t.gif "s3://$$BUCKET/t.gif" --cache-control "no-store" --content-type "image/gif"; \
	$(AWS) cloudfront create-invalidation --distribution-id "$$DIST" --paths "/t.gif" >/dev/null; \
	echo "pixel live at $$($(TF) output -raw pixel_url)"
