# Starts the backend (port 8000) and frontend (port 3000) together. Ctrl+C stops both.
# Assumes setup is done: backend/.venv exists and `npm install` has run in frontend/.
$root = $PSScriptRoot
$backend = Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\backend" `
  -FilePath "$root\backend\.venv\Scripts\python.exe" -ArgumentList '-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'
try {
  Set-Location "$root\frontend"
  npm run dev
} finally {
  Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
}
