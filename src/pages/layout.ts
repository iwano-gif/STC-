export function renderPage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>申請承認ワークフロー</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    body { font-family: -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif; }
    .toast { animation: slideIn 0.3s ease; }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    .badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-pending { background: #DBEAFE; color: #2563EB; }
    .badge-rejected { background: #FEE2E2; color: #DC2626; }
    .badge-completed { background: #DCFCE7; color: #16A34A; }
    .badge-processed { background: #F3F4F6; color: #6B7280; }
    .badge-withdrawn { background: #F3F4F6; color: #6B7280; }
    .modal-overlay { background: rgba(0,0,0,0.5); }
    .sidebar-link { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 1rem; border-radius: 0.5rem; color: #374151; transition: all 0.15s; }
    .sidebar-link:hover { background: #F3F4F6; }
    .sidebar-link.active { background: #EFF6FF; color: #2563EB; font-weight: 600; }
  </style>
</head>
<body class="bg-white text-gray-900 min-h-screen">
  <div id="app"></div>
  <div id="toast-container" class="fixed top-4 right-4 z-50 space-y-2"></div>
  <div id="modal-container"></div>
  <script src="/static/app.js"></script>
</body>
</html>`
}
