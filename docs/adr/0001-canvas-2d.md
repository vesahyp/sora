---
adr: 1
title: The Räkkä architecture: Canvas 2D, headless sim, the bot drives the checks
date: 2026-10-03
status: Accepted
deciders: Vesa
---

## Context

Sora is the third game in a row after Räkkä and Höyry. Both run on Vite,
TypeScript, React for menus only, Canvas 2D for the game with sprites
drawn by code, a fixed-step simulation with no DOM in it, and a bot that
drives the real simulation for the checks, the balance tool and the
screenshots. Höyry's reboot (`hoyry/docs/adr/0001`) records why: a 3D
stack cost the tooling and the fun, and the 2D stack reached a game people
replay in about fifty commits.

A top-down racer is a 2D problem: one road, a few cars, dust.

## Decision

Copy the architecture as is. The one addition is the coordinate system: the
track is a smoothed closed polyline, and the sim and the bot read a car's
place as arc length along the lap and offset from the centreline. The bot
is the opponent AI as well as the test driver, so the race is tested from
the first commit.

## Consequences

- `make check` fails when a physics change strands the bot, and `make
  balance` turns a car's numbers into a lap time before a human drives it.
- A track is data. The renderer strokes the centreline at road width, so
  there is no track art to draw.
- The feel of the steering cannot be tested by the bot. That test is a
  phone in a hand, and it is the first item on the roadmap.
