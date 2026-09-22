#!/bin/sh
# Wrap dist/artifact.html the way the artifact host does — charset, viewport
# with viewport-fit=cover, and a local three — so mobile testing is honest.
{
  printf '%s\n' '<!doctype html><html><head>'
  printf '%s\n' '<meta charset="utf-8">'
  printf '%s\n' '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  printf '%s\n' '<style>:root{padding-top:env(safe-area-inset-top,0);padding-bottom:env(safe-area-inset-bottom,0)}'
  printf '%s\n' 'body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>'
  printf '%s\n' '</head><body>'
  sed 's|https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js|/.testvendor/three/three.module.js|; s|https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/|/.testvendor/three/|' dist/artifact.html
  printf '%s\n' '</body></html>'
} > testbundle.html
