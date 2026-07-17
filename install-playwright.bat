@echo off
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
echo 安装依赖...
call npm install
echo.
echo 安装 Playwright 浏览器...
call npx playwright install chromium
echo.
echo 安装完成！运行测试：
echo   npm test           - 运行所有测试
echo   npm run test:headed - 有头模式运行
pause
