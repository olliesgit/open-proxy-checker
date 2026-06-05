@echo off
title Open Proxy Checker
echo Starting Open Proxy Checker...
start "" http://localhost:3000
node "%~dp0..\bin\start-server.mjs"