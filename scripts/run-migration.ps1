# PowerShell script to run the collaborator status migration
Write-Host "🔄 Running migration: Add status field to collection_collaborators..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/migrations/add-collaborator-status" -Method POST -ContentType "application/json"
    
    if ($response.StatusCode -eq 200) {
        $result = $response.Content | ConvertFrom-Json
        Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
        Write-Host "   $($result.message)" -ForegroundColor Green
        if ($result.changes) {
            foreach ($change in $result.changes) {
                Write-Host "   - $change" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ Migration failed with status: $($response.StatusCode)" -ForegroundColor Red
        Write-Host $response.Content -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error running migration:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure your Next.js server is running on http://localhost:3000" -ForegroundColor Yellow
}

