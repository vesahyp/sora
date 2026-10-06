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
#   make car-shots     # every player car from the race camera, a crop each -> shots/cars/
#   make frame-check   # the 3D view's frame rate on the phone layout, CPU slowed (THROTTLE ?= 2)
#   make tuning-check  # the tuning mode by touch on the phone: open, slide, copy JSON, reset -> shots/tuning/
#   make readout-shot  # the physics readout on the phone in a race -> shots/readout/
#   make touch-check   # drives the race by touch on an emulated phone
#   make newcareer-check # New career on the title: confirm defaults to No, Yes wipes only the career (iPhone landscape)
#   make drive-log     # set pieces by touch on a phone, the physics logged
#   make stuck-check   # a wedged car frees itself, on the phone layout (PORT=5187 if 5197 is taken)
#   make rotate-check  # turning the phone must not break the view (PORT=5187 if 5197 is taken)
#   make playthrough   # the first hour by thumb on a phone, a video per race (RACES=jm-kiviaho,... for a subset,
#                      #   SPEED=0.5 on a loaded machine: the sim in slow motion so the thumb keeps its rate)
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

.PHONY: dev build preview check balance shots-setup shots shots-en readout-shot tuning-check frame-check icon lineup car-shots touch-check newcareer-check drive-log stuck-check rotate-check playthrough pwa-check plan apply outputs env deploy-pixel

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

# every player car cropped out of the race on the phone layout: four wheels on each, the front pair turned
car-shots:
	node scripts/car-shots.mjs

# the physics readout switched on in the title screen and shown in the first folk race, the bot driving
# the tuning mode by touch on an emulated phone: the panel opens, the sliders reach the running car
# the chase view's frames on an emulated iPhone in landscape with the CPU slowed to a phone's: needs a build
frame-check: build
	THROTTLE=$(THROTTLE) node scripts/frame-check.mjs

tuning-check:
	node scripts/tuning-check.mjs

readout-shot:
	node scripts/readout-shot.mjs

touch-check:
	node scripts/touch-check.mjs

newcareer-check:
	node scripts/newcareer-check.mjs

drive-log:
	node scripts/drive-log.mjs

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
SPEED ?= 1
THROTTLE ?= 2
playthrough:
	RACES=$(RACES) SPEED=$(SPEED) node scripts/playthrough.mjs

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
