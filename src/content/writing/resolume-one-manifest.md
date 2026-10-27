---
title: "One file for the whole show"
blog: ai2
date: 2026-10-26
summary: "live-set MCP, part 1: Claude, Resolume, and a show manifest."
draft: true
---

<!-- The first version of live-set-mcp, ~Sep 16. Resolume over its REST API. -->

## The problem

<!-- Clips, columns, layers by hand. Every set rebuilt from scratch. -->

## show.yaml

<!-- One file describes the set: songs, BPM, sections, which visuals on which layer. Resolume is built from it. -->
<!-- Question: why describe the show in a file instead of just clicking it together? -->

## Build time vs show time

<!-- The rule from the README: the MCP is for building. During the show it's Launchpad → column → clips. The set works with the server off. -->
<!-- Question: what would go wrong if Claude were live during the show? -->

## The collision bug

<!-- Every show was mapped to columns 1–9, so four songs fought over one column. Fix: a block of 10 columns per show (1–12, 21–29, 31–35, 41–46). -->

## Use it yourself

<!-- Enable Avenue's webserver, uv sync, claude mcp add. First prompt to try. -->
