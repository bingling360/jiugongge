@echo off
cd /d "d:\立方体\mota-js"
echo Running unit tests...
call npm test
echo.
echo Running e2e tests...
call npx playwright test
pause