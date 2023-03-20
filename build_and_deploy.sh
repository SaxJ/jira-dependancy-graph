#! /usr/bin/bash
cd static/dep-graph || exit
npm run build
cd ../../ || exit
forge deploy
