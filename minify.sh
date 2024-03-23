#!/bin/bash

terser public/jss/progress.js -o public/jss/progress.min.js -c drop_console=true -m
terser public/jss/send.js -o public/jss/send.min.js -c drop_console=true -m
terser public/jss/receive.js -o public/jss/receive.min.js -c drop_console=true -m

