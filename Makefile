# Sora: dev, checks, screenshots. The game deploys from GitHub Actions on
# every push to main; infra/ (when it exists) is the analytics pixel host,
# the one thing this Makefile deploys.
#
#   make dev           # vite dev server, reachable on the LAN for a phone
#   make build         # production build -> dist/
#   make preview       # build, then serve it locally
#   make check         # typecheck + build + sim-check, what a commit needs green
#   make balance       # bot lap times per car (LAPS ?= 3 TRACK ?=)
#   make shots-setup   # once: install Playwright
#   make shots         # phone screenshots into shots/
#   make shots-en      # the same in English, into shots/en/
#   make icon          # render public/icon.svg to the PNG icons

.PHONY: dev build preview check balance shots-setup shots shots-en icon

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

check:
	npm run typecheck
	npm run build
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
