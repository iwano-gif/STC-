// ============================================================
// 申請承認ワークフロー - フロントエンドアプリケーション
// PDF見積もり・請求書アップロード対応版
// ============================================================

// State Management
const state = {
  user: null,
  token: localStorage.getItem('wf_token'),
  currentPage: 'dashboard',
  sidebarOpen: false
};

// API Helper
async function api(path, options = {}) {
  const headers = {};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  
  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  let res;
  try {
    res = await fetch(`/api${path}`, { ...options, headers: { ...headers, ...options.headers } });
  } catch (networkErr) {
    throw new Error('ネットワークエラー: サーバーに接続できません');
  }

  try {
    if (res.headers.get('Content-Type')?.includes('text/csv')) return res;
    const contentType = res.headers.get('Content-Type') || '';
    
    // テキストとして読み取り
    const text = await res.text();
    
    // JSONパースを試行
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      // JSONでないレスポンスの場合
      if (!res.ok) {
        throw new Error(`サーバーエラー (${res.status}): ${text.substring(0, 200)}`);
      }
      throw new Error(`レスポンスの解析に失敗しました: ${text.substring(0, 200)}`);
    }
    
    if (!res.ok) throw new Error(data.error || 'エラーが発生しました');
    return data;
  } catch (e) {
    if (e.message?.includes('トークンが無効') || e.message?.includes('認証が必要')) {
      logout();
    }
    throw e;
  }
}

// Toast notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
  toast.className = `toast ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Modal helper
function showModal(title, content, actions = '') {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-overlay fixed inset-0 z-40 flex items-center justify-center p-4" onclick="if(event.target===this)closeModal()">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 class="text-lg font-semibold">${title}</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="px-6 py-4">${content}</div>
        ${actions ? `<div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">${actions}</div>` : ''}
      </div>
    </div>`;
}

function closeModal() {
  document.getElementById('modal-container').innerHTML = '';
}

// Confirm dialog
function showConfirm(message, onConfirm) {
  showModal('確認', `<p class="text-gray-700">${message}</p>`,
    `<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
     <button id="confirm-btn" class="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">実行する</button>`
  );
  document.getElementById('confirm-btn').onclick = () => { closeModal(); onConfirm(); };
}

// Auth
function togglePasswordVisibility() {
  const pw = document.getElementById('login-password');
  const icon = document.getElementById('pw-toggle-icon');
  if (pw.type === 'password') {
    pw.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    pw.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

async function login(email, password) {
  const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('wf_token', data.token);
  navigate('dashboard');
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('wf_token');
  render();
}

function hasRole(role) {
  return state.user?.role?.includes(role);
}

function roleLabel(role) {
  const map = { admin: '管理者', approver: '承認者', clerk: '事務員', applicant: '申請者' };
  return map[role] || role;
}

// Navigation
function navigate(page, params = {}) {
  state.currentPage = page;
  state.pageParams = params;
  window.history.pushState({page, params}, '', getPath(page, params));
  render();
}

function getPath(page, params = {}) {
  const paths = {
    'login': '/login',
    'dashboard': '/',
    'new-request': '/requests/new',
    'requests': '/requests',
    'request-detail': `/requests/${params.id}`,
    'edit-request': `/requests/${params.id}/edit`,
    'admin-users': '/admin/users',
    'admin-approvers': '/admin/approvers',
    'admin-settings': '/admin/settings',
    'admin-audit': '/admin/audit-logs',
    'admin-deals': '/admin/deals',
    'admin-deal-detail': `/admin/deals/${params.id}`,
    'deal-dashboard': '/admin/deal-dashboard',
    'admin-partners': '/admin/partners',
    'leads': '/leads',
    'lead-detail': `/leads/${params.id}`,
    'lead-dashboard': '/leads/dashboard'
  };
  return paths[page] || '/';
}

window.onpopstate = (e) => {
  if (e.state) { state.currentPage = e.state.page; state.pageParams = e.state.params || {}; render(); }
};

// Format helpers
function formatCurrency(n) { return '\u00a5' + Number(n).toLocaleString(); }
function formatDate(d) { 
  if (!d) return '-';
  const dt = new Date(d + 'Z');
  return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}
function typeLabel(t) { return t === 'estimate' ? '見積もり' : '請求書'; }
function statusBadge(s) {
  const map = { pending: ['承認中','badge-pending'], rejected: ['差戻し','badge-rejected'], completed: ['承認完了','badge-completed'], processed: ['処理済み','badge-processed'], withdrawn: ['取下げ','badge-withdrawn'] };
  const [label, cls] = map[s] || [s, 'badge-processed'];
  return `<span class="badge ${cls}">${label}</span>`;
}
function stepStatusIcon(s) {
  if (s === 'approved') return '<span class="text-green-600 font-bold">&#x2705;</span>';
  if (s === 'rejected') return '<span class="text-red-600 font-bold">&#x274C;</span>';
  if (s === 'skipped') return '<span class="text-gray-400">&#x23ED;&#xFE0F;</span>';
  if (s === 'waiting') return '<span class="text-blue-600">&#x23F3;</span>';
  return '<span class="text-gray-400">&#x25CB;</span>';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================
// RENDER
// ============================================================
async function render() {
  const app = document.getElementById('app');
  
  if (!state.token || !state.user) {
    if (state.token) {
      try {
        const data = await api('/auth/me');
        state.user = data.user;
      } catch {
        state.token = null;
        localStorage.removeItem('wf_token');
      }
    }
    if (!state.user) {
      renderLogin(app);
      return;
    }
  }
  
  renderApp(app);
}

// ============================================================
// LOGIN PAGE
// ============================================================
function renderLogin(app) {
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <div class="text-center mb-6">
          <img src="/static/logo.png" alt="STC" class="w-16 h-16 mx-auto mb-3 rounded-full object-cover shadow-sm">
          <h1 class="text-xl font-bold text-gray-900">STC 申請承認ワークフロー</h1>
          <p class="text-sm text-gray-500 mt-1">ログインしてください</p>
        </div>
        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ログインID（メールアドレス）</label>
            <input type="text" id="login-email" required autocomplete="off"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
              placeholder="user@example.com または ログインID">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <div class="relative">
              <input type="password" id="login-password" required autocomplete="off"
                class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="パスワード">
              <button type="button" onclick="togglePasswordVisibility()" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1">
                <i id="pw-toggle-icon" class="fas fa-eye text-sm"></i>
              </button>
            </div>
          </div>
          <div id="login-error" class="text-red-600 text-sm hidden"></div>
          <button type="submit" class="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors">
            ログイン
          </button>
        </form>
      </div>
    </div>`;
  
  // パスワード欄を空にしてブラウザ自動入力を防止
  document.getElementById('login-password').value = '';

  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    try {
      await login(document.getElementById('login-email').value, document.getElementById('login-password').value);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  };
}

// ============================================================
// MAIN APP LAYOUT
// ============================================================
function renderApp(app) {
  const isAdmin = hasRole('admin');
  const isApprover = hasRole('approver');
  const canSeeDeal = isAdmin || isApprover;
  const userName = state.user?.displayName || state.user?.email;
  
  app.innerHTML = `
    <div class="min-h-screen flex flex-col">
      <!-- Header -->
      <header class="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div class="flex items-center justify-between px-4 h-14">
          <div class="flex items-center gap-3">
            <button id="menu-toggle" class="lg:hidden p-2 rounded-lg hover:bg-gray-100">
              <i class="fas fa-bars text-gray-600"></i>
            </button>
            <a href="/" onclick="event.preventDefault();navigate('dashboard')" class="flex items-center gap-2">
              <img src="/static/logo.png" alt="STC" class="w-7 h-7 rounded-full object-cover">
              <span class="font-semibold text-sm hidden sm:inline">STC ワークフロー</span>
            </a>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-600 hidden sm:inline">${userName}</span>
            <div class="flex gap-1">
              ${state.user?.role?.filter(r => r !== 'applicant').map(r => 
                `<span class="text-xs px-2 py-0.5 rounded-full ${r === 'admin' ? 'bg-purple-100 text-purple-700' : r === 'approver' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}">${roleLabel(r)}</span>`
              ).join('') || ''}
            </div>
            <button onclick="logout()" class="text-sm text-gray-500 hover:text-gray-700 ml-2" title="ログアウト">
              <i class="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </div>
      </header>
      
      <div class="flex flex-1">
        <!-- Sidebar -->
        <aside id="sidebar" class="w-56 bg-white border-r border-gray-200 flex-shrink-0 hidden lg:block">
          <nav class="p-3 space-y-1">
            <a href="/" onclick="event.preventDefault();navigate('dashboard')" class="sidebar-link ${state.currentPage==='dashboard'?'active':''}">
              <i class="fas fa-home w-5 text-center"></i><span>ダッシュボード</span>
            </a>
            <a href="/requests/new" onclick="event.preventDefault();navigate('new-request')" class="sidebar-link ${state.currentPage==='new-request'?'active':''}">
              <i class="fas fa-plus-circle w-5 text-center"></i><span>新規申請</span>
            </a>
            <a href="/requests" onclick="event.preventDefault();navigate('requests')" class="sidebar-link ${state.currentPage==='requests'?'active':''}">
              <i class="fas fa-list w-5 text-center"></i><span>申請一覧</span>
            </a>
            ${isAdmin ? `
              <div class="pt-3 mt-3 border-t border-gray-200">
                <p class="px-3 py-1 text-xs font-semibold text-gray-400 uppercase">管理</p>
              </div>
              <a href="/admin/users" onclick="event.preventDefault();navigate('admin-users')" class="sidebar-link ${state.currentPage==='admin-users'?'active':''}">
                <i class="fas fa-users w-5 text-center"></i><span>ユーザー管理</span>
              </a>
              <a href="/admin/approvers" onclick="event.preventDefault();navigate('admin-approvers')" class="sidebar-link ${state.currentPage==='admin-approvers'?'active':''}">
                <i class="fas fa-user-check w-5 text-center"></i><span>承認者設定</span>
              </a>
              <a href="/admin/settings" onclick="event.preventDefault();navigate('admin-settings')" class="sidebar-link ${state.currentPage==='admin-settings'?'active':''}">
                <i class="fas fa-cog w-5 text-center"></i><span>システム設定</span>
              </a>
              <a href="/admin/audit-logs" onclick="event.preventDefault();navigate('admin-audit')" class="sidebar-link ${state.currentPage==='admin-audit'?'active':''}">
                <i class="fas fa-history w-5 text-center"></i><span>監査ログ</span>
              </a>
              <a href="/admin/partners" onclick="event.preventDefault();navigate('admin-partners')" class="sidebar-link ${state.currentPage==='admin-partners'?'active':''}">
                <i class="fas fa-handshake w-5 text-center"></i><span>協力会社管理</span>
              </a>
            ` : ''}
            ${canSeeDeal ? `
              <div class="pt-3 mt-3 border-t border-gray-200">
                <p class="px-3 py-1 text-xs font-semibold text-gray-400 uppercase">リード管理</p>
              </div>
              <a href="/leads/dashboard" onclick="event.preventDefault();navigate('lead-dashboard')" class="sidebar-link ${state.currentPage==='lead-dashboard'?'active':''}">
                <i class="fas fa-chart-pie w-5 text-center"></i><span>売上予測</span>
              </a>
              <a href="/leads" onclick="event.preventDefault();navigate('leads')" class="sidebar-link ${state.currentPage==='leads'||state.currentPage==='lead-detail'?'active':''}">
                <i class="fas fa-funnel-dollar w-5 text-center"></i><span>リード一覧</span>
              </a>
              <div class="pt-3 mt-3 border-t border-gray-200">
                <p class="px-3 py-1 text-xs font-semibold text-gray-400 uppercase">${isAdmin ? '案件管理' : '案件チェック'}</p>
              </div>
              <a href="/admin/deal-dashboard" onclick="event.preventDefault();navigate('deal-dashboard')" class="sidebar-link ${state.currentPage==='deal-dashboard'?'active':''}">
                <i class="fas fa-chart-line w-5 text-center"></i><span>案件ダッシュボード</span>
              </a>
              <a href="/admin/deals" onclick="event.preventDefault();navigate('admin-deals')" class="sidebar-link ${state.currentPage==='admin-deals'||state.currentPage==='admin-deal-detail'?'active':''}">
                <i class="fas ${isAdmin ? 'fa-project-diagram' : 'fa-clipboard-check'} w-5 text-center"></i><span>${isAdmin ? '案件一覧' : '案件一覧'}</span>
              </a>
            ` : ''}
          </nav>
        </aside>
        
        <!-- Main Content -->
        <main id="main-content" class="flex-1 p-4 lg:p-6 overflow-y-auto bg-gray-50 min-h-0" style="max-width:1200px;">
          <div class="skeleton h-8 w-48 rounded mb-4"></div>
          <div class="skeleton h-32 rounded"></div>
        </main>
      </div>
    </div>`;
  
  // Mobile menu toggle
  document.getElementById('menu-toggle').onclick = () => {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('hidden');
    sb.classList.toggle('fixed');
    sb.classList.toggle('inset-y-0');
    sb.classList.toggle('left-0');
    sb.classList.toggle('z-40');
    sb.classList.toggle('mt-14');
  };
  
  renderPageContent();
}

async function renderPageContent() {
  const main = document.getElementById('main-content');
  try {
    switch (state.currentPage) {
      case 'dashboard': await renderDashboard(main); break;
      case 'new-request': renderNewRequest(main); break;
      case 'requests': await renderRequestList(main); break;
      case 'request-detail': await renderRequestDetail(main); break;
      case 'edit-request': await renderEditRequest(main); break;
      case 'admin-users': await renderAdminUsers(main); break;
      case 'admin-approvers': await renderAdminApprovers(main); break;
      case 'admin-settings': await renderAdminSettings(main); break;
      case 'admin-audit': await renderAuditLogs(main); break;
      case 'admin-deals': await renderDealList(main); break;
      case 'admin-deal-detail': await renderDealDetail(main); break;
      case 'deal-dashboard': await renderDealDashboard(main); break;
      case 'admin-partners': await renderPartnerList(main); break;
      case 'leads': await renderLeadList(main); break;
      case 'lead-detail': await renderLeadDetail(main); break;
      case 'lead-dashboard': await renderLeadDashboard(main); break;
      default: await renderDashboard(main);
    }
  } catch (err) {
    main.innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
        <i class="fas fa-exclamation-circle text-red-600"></i>
        <div>
          <p class="text-red-800 font-medium">エラーが発生しました</p>
          <p class="text-red-600 text-sm">${err.message}</p>
        </div>
        <button onclick="renderPageContent()" class="ml-auto text-sm text-red-600 hover:text-red-800 underline">再読み込み</button>
      </div>`;
  }
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard(main) {
  const data = await api('/dashboard');
  const { summary, pendingApprovals, recentRequests } = data;
  
  main.innerHTML = `
    <h1 class="text-xl font-bold text-gray-900 mb-4">こんにちは、${state.user?.displayName || ''}さん</h1>
    
    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">承認待ち</p>
            <p class="text-2xl font-bold text-blue-600">${summary.pending}件</p>
          </div>
          <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
            <i class="fas fa-clock text-blue-600"></i>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">承認済み</p>
            <p class="text-2xl font-bold text-green-600">${summary.completed}件</p>
          </div>
          <div class="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
            <i class="fas fa-check-circle text-green-600"></i>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">差戻し</p>
            <p class="text-2xl font-bold text-red-600">${summary.rejected}件</p>
          </div>
          <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <i class="fas fa-undo text-red-600"></i>
          </div>
        </div>
      </div>
    </div>
    
    ${pendingApprovals.length > 0 ? `
    <!-- Pending Approvals -->
    <div class="mb-6">
      <h2 class="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <i class="fas fa-bell text-blue-600"></i> 承認待ち（あなた宛て）
      </h2>
      <div class="space-y-2">
        ${pendingApprovals.map(a => `
          <div class="bg-white border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-mono text-gray-500">#${String(a.request_number).padStart(4,'0')}</span>
                <span class="badge ${a.type === 'estimate' ? 'badge-pending' : 'badge-completed'} text-xs">${typeLabel(a.type)}</span>
              </div>
              <p class="font-medium text-gray-900 truncate">${a.title}</p>
              <p class="text-sm text-gray-500">${a.client_name} ・ ${formatCurrency(a.amount_with_tax)} ・ 申請者：${a.applicant_name}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button onclick="navigate('request-detail',{id:'${a.request_id}'})" class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">詳細</button>
              <button onclick="quickApprove('${a.step_id}','${a.request_id}')" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">承認</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
    
    <!-- Recent Requests -->
    <div>
      <h2 class="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <i class="fas fa-file-alt text-gray-500"></i> 最近の申請
      </h2>
      ${recentRequests.length === 0 ? `
        <div class="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <i class="fas fa-inbox text-gray-300 text-3xl mb-2"></i>
          <p class="text-gray-500 text-sm">まだ申請がありません</p>
          <button onclick="navigate('new-request')" class="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
            <i class="fas fa-plus mr-1"></i>新規申請を作成
          </button>
        </div>
      ` : `
        <div class="space-y-2">
          ${recentRequests.map(r => `
            <a href="/requests/${r.id}" onclick="event.preventDefault();navigate('request-detail',{id:'${r.id}'})"
               class="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-mono text-gray-500">#${String(r.request_number).padStart(4,'0')}</span>
                  <span class="text-xs text-gray-400">${typeLabel(r.type)}</span>
                  ${statusBadge(r.status)}
                </div>
                <span class="text-sm text-gray-500">${formatDate(r.created_at)}</span>
              </div>
              <p class="font-medium text-gray-900 mt-1">${r.title}</p>
              <p class="text-sm text-gray-500">${r.client_name} ・ ${formatCurrency(r.amount_with_tax)}</p>
              ${r.status === 'pending' && r.current_approver ? `<p class="text-xs text-blue-600 mt-1">● ${r.current_approver} 承認待ち</p>` : ''}
            </a>
          `).join('')}
        </div>
      `}
    </div>`;
}

// Quick approve from dashboard
async function quickApprove(stepId, requestId) {
  showModal('承認確認', `
    <p class="text-gray-700 mb-4">この申請を承認しますか？</p>
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">コメント（任意）</label>
      <textarea id="quick-comment" rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="コメントを入力..."></textarea>
    </div>`,
    `<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
     <button id="quick-approve-btn" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">承認する</button>`
  );
  document.getElementById('quick-approve-btn').onclick = async () => {
    try {
      const comment = document.getElementById('quick-comment').value;
      const res = await api('/approvals/approve', { method: 'POST', body: JSON.stringify({ stepId, comment }) });
      closeModal();
      showToast(res.message);
      navigate('dashboard');
    } catch (err) { showToast(err.message, 'error'); }
  };
}

// ============================================================
// NEW REQUEST FORM (with PDF Upload & Auto-fill)
// ============================================================
async function renderNewRequest(main) {
  // 協力会社一覧を取得（元請け選択用）
  let partners = [];
  try { const pd = await api('/partners'); partners = pd.partners || []; } catch {}

  // リードからの引き継ぎ
  const fromLead = state.pageParams?.from_lead || '';
  const prefillTitle = state.pageParams?.title || '';
  const prefillClient = state.pageParams?.client || '';

  main.innerHTML = `
    <h1 class="text-xl font-bold text-gray-900 mb-4">新規申請</h1>
    ${fromLead ? `<div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 text-sm text-indigo-800"><i class="fas fa-link mr-1"></i>リードからの申請作成</div>` : ''}
    <div class="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl">
      <form id="request-form" class="space-y-5">
        
        <!-- PDF Upload Section (FIRST - triggers auto-fill) -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <label class="block text-sm font-medium text-blue-800 mb-2">
            <i class="fas fa-magic text-blue-600 mr-1"></i>
            PDFをアップロードして自動入力 <span class="text-red-500">*</span>
          </label>
          <p class="text-xs text-blue-600 mb-3">見積書・請求書のPDFをアップロードすると、金額・取引先等が自動で入力されます</p>
          
          <div id="pdf-drop-zone" class="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center hover:border-blue-500 bg-white transition-colors cursor-pointer">
            <i class="fas fa-cloud-upload-alt text-blue-400 text-2xl mb-2"></i>
            <p class="text-sm text-gray-600">ここにPDFをドラッグ＆ドロップ</p>
            <p class="text-xs text-gray-400 mt-1">または</p>
            <button type="button" id="pdf-select-btn" class="mt-2 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <i class="fas fa-file-pdf mr-1"></i>ファイルを選択
            </button>
            <input type="file" id="pdf-file-input" accept=".pdf,application/pdf" multiple class="hidden">
          </div>
          
          <!-- PDF parse status -->
          <div id="pdf-parse-status" class="mt-3 hidden">
            <div class="flex items-center gap-2 text-sm text-blue-700">
              <i class="fas fa-spinner fa-spin"></i>
              <span>PDFを解析中...</span>
            </div>
          </div>
          
          <!-- Auto-fill result banner -->
          <div id="pdf-autofill-result" class="mt-3 hidden"></div>
          
          <!-- Selected files list -->
          <div id="pdf-file-list" class="mt-3 space-y-2"></div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">申請種別 <span class="text-red-500">*</span></label>
          <select id="req-type" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="estimate">見積もり</option>
            <option value="invoice">請求書</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">件名・案件名 <span class="text-red-500">*</span></label>
          <input type="text" id="req-title" required maxlength="100" value="${prefillTitle}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="案件名を入力">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">取引先名 <span class="text-red-500">*</span></label>
          <input type="text" id="req-client" required maxlength="100" value="${prefillClient}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="取引先名を入力">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">元請け会社 <span class="text-xs text-gray-400 font-normal">（STCが下請けの場合）</span></label>
          <select id="req-prime-contractor" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="">なし（STCが元請け）</option>
            ${partners.map(p => '<option value="' + p.id + '">' + p.company_name + (p.trade_type ? ' (' + p.trade_type + ')' : '') + '</option>').join('')}
          </select>
        </div>

        <!-- 下請け会社 -->
        <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <label class="block text-sm font-medium text-orange-800 mb-1">
            <i class="fas fa-hard-hat text-orange-600 mr-1"></i>下請け会社（協力会社）
          </label>
          <p class="text-xs text-orange-600 mb-2">この案件に参加する下請け会社を選択してください（任意・複数可）</p>
          <div id="req-sub-container">
            <div class="flex gap-2 mb-2">
              <select id="req-sub-select" class="flex-1 px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500">
                <option value="">下請け会社を選択...</option>
                ${partners.map(p => '<option value="' + p.id + '" data-name="' + p.company_name + (p.trade_type ? ' (' + p.trade_type + ')' : '') + '">' + p.company_name + (p.trade_type ? ' (' + p.trade_type + ')' : '') + '</option>').join('')}
              </select>
              <button type="button" id="req-sub-add-btn" class="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm">
                <i class="fas fa-plus"></i>
              </button>
            </div>
            <div id="req-sub-list" class="space-y-1"></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">金額（税込）<span class="text-red-500">*</span></label>
            <div class="relative">
              <span class="absolute left-3 top-2 text-gray-500 text-sm">\u00a5</span>
              <input type="number" id="req-amount" required min="1" step="1" class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="0" oninput="calcTaxFromInc()">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">税率 <span class="text-red-500">*</span></label>
            <select id="req-tax" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" onchange="calcTaxFromInc()">
              <option value="0.10">10%</option>
              <option value="0.08">8%（軽減税率）</option>
              <option value="0.0">0%（非課税）</option>
            </select>
          </div>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
          <div class="flex justify-between items-center">
            <div>
              <p class="text-xs text-gray-500">税抜金額</p>
              <p id="req-excl-tax" class="text-sm text-gray-700">\u00a50</p>
            </div>
            <div>
              <p class="text-xs text-gray-500">消費税</p>
              <p id="req-tax-amount" class="text-sm text-gray-700">\u00a50</p>
            </div>
            <div>
              <p class="text-xs text-gray-500">税込金額</p>
              <p id="req-total" class="text-lg font-bold text-gray-900">\u00a50</p>
            </div>
          </div>
        </div>

        <!-- 粗利率入力 -->
        <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <label class="block text-sm font-medium text-emerald-800 mb-1">
            <i class="fas fa-percentage text-emerald-600 mr-1"></i>粗利率（税抜ベース）
          </label>
          <p class="text-xs text-emerald-600 mb-2">想定する粗利率を入力してください（任意）</p>
          <div class="flex items-center gap-3">
            <div class="relative flex-1" style="max-width:160px">
              <input type="number" id="req-profit-rate" min="0" max="100" step="0.1" class="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" placeholder="例: 20" oninput="calcProfitPreview()">
              <span class="absolute right-3 top-2 text-gray-500 text-sm">%</span>
            </div>
            <div id="req-profit-preview" class="text-sm text-emerald-700"></div>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">備考</label>
          <textarea id="req-remarks" rows="3" maxlength="1000" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="備考があれば入力してください"></textarea>
        </div>

        <div id="req-error" class="text-red-600 text-sm hidden"></div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick="navigate('dashboard')" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
          <button type="submit" id="req-submit" class="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            <i class="fas fa-paper-plane mr-1"></i>申請する
          </button>
        </div>
      </form>
    </div>`;
  
  // PDF upload state
  const pendingFiles = [];
  _currentPendingFiles = pendingFiles;
  _currentFileListId = 'pdf-file-list';
  
  setupPdfDropZoneWithAutofill('pdf-drop-zone', 'pdf-file-input', 'pdf-select-btn', 'pdf-file-list', pendingFiles, 'new');
  
  // 下請け会社マルチセレクト
  const selectedSubs = [];
  setupSubcontractorPicker('req-sub-select', 'req-sub-add-btn', 'req-sub-list', selectedSubs);
  
  document.getElementById('request-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('req-error');
    errEl.classList.add('hidden');
    
    // Validate at least one PDF is selected
    if (pendingFiles.length === 0) {
      errEl.textContent = '見積書・請求書のPDFファイルを1つ以上添付してください';
      errEl.classList.remove('hidden');
      return;
    }
    
    const btn = document.getElementById('req-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>送信中...';
    
    try {
      // 1. Create the request (send tax-inclusive amount)
      const profitRateInput = document.getElementById('req-profit-rate').value;
      const body = {
        type: document.getElementById('req-type').value,
        title: document.getElementById('req-title').value,
        client_name: document.getElementById('req-client').value,
        amount_with_tax: parseFloat(document.getElementById('req-amount').value),
        tax_rate: parseFloat(document.getElementById('req-tax').value),
        remarks: document.getElementById('req-remarks').value,
        gross_profit_rate: profitRateInput !== '' ? parseFloat(profitRateInput) : null,
        prime_contractor_id: document.getElementById('req-prime-contractor').value || null,
        subcontractor_ids: selectedSubs.length > 0 ? selectedSubs.map(s => s.id) : null
      };
      const res = await api('/requests', { method: 'POST', body: JSON.stringify(body) });
      
      // 2. Upload PDF files
      let uploadErrors = [];
      for (const file of pendingFiles) {
        try {
          await uploadPdfFile(res.id, file);
        } catch (uploadErr) {
          uploadErrors.push(`${file.name}: ${uploadErr.message}`);
        }
      }
      
      if (uploadErrors.length > 0) {
        showToast(`申請は作成されましたが、一部のファイルのアップロードに失敗しました: ${uploadErrors.join(', ')}`, 'error');
      } else {
        showToast('申請とPDFファイルのアップロードが完了しました');
      }
      
      navigate('request-detail', { id: res.id });
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>申請する';
    }
  };
}

// PDF file upload helper
async function uploadPdfFile(requestId, file) {
  const formData = new FormData();
  formData.append('request_id', requestId);
  formData.append('file', file);
  
  return await api('/files/upload', { method: 'POST', body: formData });
}

// ============================================================
// SUBCONTRACTOR MULTI-SELECT HELPER
// ============================================================
function setupSubcontractorPicker(selectId, addBtnId, listId, selectedArray) {
  const addBtn = document.getElementById(addBtnId);
  if (!addBtn) return;
  addBtn.onclick = () => {
    const sel = document.getElementById(selectId);
    const val = sel.value;
    if (!val) return;
    // 既に追加済みなら無視
    if (selectedArray.find(s => s.id === val)) {
      showToast('既に追加されています', 'error');
      return;
    }
    const name = sel.options[sel.selectedIndex].getAttribute('data-name') || sel.options[sel.selectedIndex].text;
    selectedArray.push({ id: val, name: name });
    renderSubList(listId, selectedArray, selectId);
    sel.value = '';
  };
}

function renderSubList(listId, selectedArray, selectId) {
  const listEl = document.getElementById(listId);
  if (!listEl) return;
  if (selectedArray.length === 0) {
    listEl.innerHTML = '';
    return;
  }
  listEl.innerHTML = selectedArray.map((s, i) => `
    <div class="flex items-center justify-between bg-white border border-orange-200 rounded px-3 py-1.5">
      <span class="text-sm text-gray-800"><i class="fas fa-building text-orange-400 mr-1"></i>${s.name}</span>
      <button type="button" data-idx="${i}" class="sub-remove-btn text-gray-400 hover:text-red-500 text-xs ml-2"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
  listEl.querySelectorAll('.sub-remove-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.getAttribute('data-idx'));
      selectedArray.splice(idx, 1);
      renderSubList(listId, selectedArray, selectId);
    };
  });
}

// Setup drag & drop zone for PDF
function setupPdfDropZone(dropZoneId, fileInputId, selectBtnId, fileListId, pendingFiles) {
  const dropZone = document.getElementById(dropZoneId);
  const fileInput = document.getElementById(fileInputId);
  const selectBtn = document.getElementById(selectBtnId);
  
  if (!dropZone || !fileInput) return;
  
  // Click to select
  selectBtn.onclick = () => fileInput.click();
  dropZone.onclick = (e) => { if (e.target === dropZone || e.target.tagName === 'I' || e.target.tagName === 'P') fileInput.click(); };
  
  // File input change
  fileInput.onchange = () => {
    addPdfFiles(fileInput.files, pendingFiles, fileListId);
    fileInput.value = '';
  };
  
  // Drag & Drop
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-blue-400', 'bg-blue-50'); };
  dropZone.ondragleave = (e) => { e.preventDefault(); dropZone.classList.remove('border-blue-400', 'bg-blue-50'); };
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-400', 'bg-blue-50');
    addPdfFiles(e.dataTransfer.files, pendingFiles, fileListId);
  };
}

function addPdfFiles(fileList, pendingFiles, fileListId) {
  const MAX_SIZE = 10 * 1024 * 1024;
  const MAX_FILES = 10;
  
  for (const file of fileList) {
    // Validate
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast(`${file.name}: PDFファイルのみアップロードできます`, 'error');
      continue;
    }
    if (file.type && file.type !== 'application/pdf') {
      showToast(`${file.name}: PDFファイルのみアップロードできます`, 'error');
      continue;
    }
    if (file.size > MAX_SIZE) {
      showToast(`${file.name}: ファイルサイズは10MB以下にしてください`, 'error');
      continue;
    }
    if (pendingFiles.length >= MAX_FILES) {
      showToast('1つの申請につき最大10ファイルまでです', 'error');
      break;
    }
    // Check duplicate
    if (pendingFiles.some(f => f.name === file.name && f.size === file.size)) {
      showToast(`${file.name}: 同名のファイルは既に追加されています`, 'error');
      continue;
    }
    pendingFiles.push(file);
  }
  
  renderPdfFileList(pendingFiles, fileListId);
}

function renderPdfFileList(pendingFiles, fileListId) {
  const listEl = document.getElementById(fileListId);
  if (!listEl) return;
  
  if (pendingFiles.length === 0) {
    listEl.innerHTML = '';
    return;
  }
  
  listEl.innerHTML = pendingFiles.map((file, idx) => `
    <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <i class="fas fa-file-pdf text-red-500 text-lg"></i>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-900 truncate">${file.name}</p>
        <p class="text-xs text-gray-500">${formatFileSize(file.size)}</p>
      </div>
      <button type="button" onclick="removePendingFile(${idx})" class="text-gray-400 hover:text-red-500 p-1">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

// Global reference for pending files (for remove button)
let _currentPendingFiles = null;
let _currentFileListId = null;

function removePendingFile(idx) {
  if (_currentPendingFiles) {
    _currentPendingFiles.splice(idx, 1);
    renderPdfFileList(_currentPendingFiles, _currentFileListId);
  }
}

// Override setupPdfDropZone to store reference
const _origSetupPdfDropZone = setupPdfDropZone;
// Note: we use a wrapper approach below instead

// Tax calculation from tax-inclusive amount (reverse calculation)
function calcTaxFromInc() {
  const amountWithTax = parseFloat(document.getElementById('req-amount')?.value || '0');
  const rate = parseFloat(document.getElementById('req-tax')?.value || '0.10');
  const amountExclTax = rate > 0 ? Math.round(amountWithTax / (1 + rate)) : amountWithTax;
  const taxAmount = amountWithTax - amountExclTax;
  const elTotal = document.getElementById('req-total');
  const elExcl = document.getElementById('req-excl-tax');
  const elTaxAmt = document.getElementById('req-tax-amount');
  if (elTotal) elTotal.textContent = formatCurrency(amountWithTax);
  if (elExcl) elExcl.textContent = formatCurrency(amountExclTax);
  if (elTaxAmt) elTaxAmt.textContent = formatCurrency(taxAmount);
  calcProfitPreview();
}

// 粗利プレビュー計算（新規申請）
function calcProfitPreview() {
  const amountWithTax = parseFloat(document.getElementById('req-amount')?.value || '0');
  const rate = parseFloat(document.getElementById('req-tax')?.value || '0.10');
  const amountExclTax = rate > 0 ? Math.round(amountWithTax / (1 + rate)) : amountWithTax;
  const profitRateVal = parseFloat(document.getElementById('req-profit-rate')?.value || '');
  const previewEl = document.getElementById('req-profit-preview');
  if (!previewEl) return;
  if (isNaN(profitRateVal) || profitRateVal <= 0 || amountExclTax <= 0) {
    previewEl.textContent = '';
    return;
  }
  const profitAmount = Math.round(amountExclTax * profitRateVal / 100);
  const costAmount = amountExclTax - profitAmount;
  previewEl.innerHTML = '<span class="text-emerald-600">粗利 ' + formatCurrency(profitAmount) + '</span><span class="text-gray-400 mx-1">|</span><span class="text-gray-600">原価 ' + formatCurrency(costAmount) + '</span>';
}

// PDF auto-fill: parse PDF and populate form fields
async function parsePdfAndAutofill(file, mode) {
  const statusEl = document.getElementById('pdf-parse-status');
  const resultEl = document.getElementById('pdf-autofill-result');
  if (statusEl) { statusEl.classList.remove('hidden'); }
  if (resultEl) { resultEl.classList.add('hidden'); }
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api('/files/parse-pdf', { method: 'POST', body: formData });
    
    if (statusEl) statusEl.classList.add('hidden');
    
    if (!res.success || !res.parsed_data) {
      if (resultEl) {
        resultEl.innerHTML = `
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <i class="fas fa-exclamation-triangle mr-1"></i>
            PDFから情報を抽出できませんでした。手動で入力してください。
          </div>`;
        resultEl.classList.remove('hidden');
      }
      return;
    }
    
    const data = res.parsed_data;
    let filled = [];
    
    // Determine field prefix based on mode
    const prefix = mode === 'edit' ? 'edit' : 'req';
    
    // Auto-fill type
    if (data.type) {
      const typeEl = document.getElementById(prefix === 'edit' ? 'edit-type' : 'req-type');
      if (typeEl) { typeEl.value = data.type; filled.push('申請種別'); }
    }
    
    // Auto-fill title
    if (data.title) {
      const titleEl = document.getElementById(prefix === 'edit' ? 'edit-title' : 'req-title');
      if (titleEl && !titleEl.value) { titleEl.value = data.title; filled.push('件名'); }
    }
    
    // Auto-fill client
    if (data.client_name) {
      const clientEl = document.getElementById(prefix === 'edit' ? 'edit-client' : 'req-client');
      if (clientEl && !clientEl.value) { clientEl.value = data.client_name; filled.push('取引先'); }
    }
    
    // Auto-fill tax rate
    if (data.tax_rate !== undefined) {
      const taxEl = document.getElementById(prefix === 'edit' ? 'edit-tax' : 'req-tax');
      if (taxEl) { taxEl.value = String(data.tax_rate); filled.push('税率'); }
    }
    
    // Auto-fill amount (tax inclusive)
    if (data.amount_with_tax) {
      const amountEl = document.getElementById(prefix === 'edit' ? 'edit-amount' : 'req-amount');
      if (amountEl) { amountEl.value = String(data.amount_with_tax); filled.push('金額（税込）'); }
    }
    
    // Recalculate tax display
    if (mode === 'edit') {
      calcTaxEditFromInc();
    } else {
      calcTaxFromInc();
    }
    
    // Show result
    if (resultEl) {
      if (filled.length > 0) {
        resultEl.innerHTML = `
          <div class="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            <i class="fas fa-check-circle mr-1"></i>
            PDFから自動入力しました：<strong>${filled.join('、')}</strong>
            ${data.raw_amounts && data.raw_amounts.length > 1 ? `
              <details class="mt-2">
                <summary class="cursor-pointer text-green-600 hover:text-green-800">検出された金額情報（${data.raw_amounts.length}件）</summary>
                <ul class="mt-1 ml-4 space-y-1 text-xs">
                  ${data.raw_amounts.map(a => `<li>\u00a5${Number(a.value).toLocaleString()} ← ${a.label}</li>`).join('')}
                </ul>
              </details>
            ` : ''}
            <p class="mt-1 text-xs text-green-600">※ 内容を確認の上、必要に応じて修正してください</p>
          </div>`;
      } else {
        resultEl.innerHTML = `
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <i class="fas fa-exclamation-triangle mr-1"></i>
            PDFから自動入力できる情報が見つかりませんでした。手動で入力してください。
          </div>`;
      }
      resultEl.classList.remove('hidden');
    }
  } catch (err) {
    if (statusEl) statusEl.classList.add('hidden');
    if (resultEl) {
      resultEl.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          <i class="fas fa-exclamation-triangle mr-1"></i>
          PDF解析に失敗しました。手動で入力してください。
        </div>`;
      resultEl.classList.remove('hidden');
    }
  }
}

// Setup PDF drop zone with auto-fill functionality
function setupPdfDropZoneWithAutofill(dropZoneId, fileInputId, selectBtnId, fileListId, pendingFiles, mode) {
  const dropZone = document.getElementById(dropZoneId);
  const fileInput = document.getElementById(fileInputId);
  const selectBtn = document.getElementById(selectBtnId);
  if (!dropZone || !fileInput) return;
  
  selectBtn.onclick = (e) => { e.stopPropagation(); fileInput.click(); };
  dropZone.onclick = (e) => { 
    if (e.target === dropZone || e.target.closest('#' + dropZoneId) === dropZone) {
      if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) fileInput.click(); 
    }
  };
  
  fileInput.onchange = () => {
    addPdfFilesWithAutofill(fileInput.files, pendingFiles, fileListId, mode);
    fileInput.value = '';
  };
  
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-blue-500', 'bg-blue-50'); };
  dropZone.ondragleave = (e) => { e.preventDefault(); dropZone.classList.remove('border-blue-500', 'bg-blue-50'); };
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    addPdfFilesWithAutofill(e.dataTransfer.files, pendingFiles, fileListId, mode);
  };
}

function addPdfFilesWithAutofill(fileList, pendingFiles, fileListId, mode) {
  const MAX_SIZE = 10 * 1024 * 1024;
  const MAX_FILES = 10;
  let firstNewFile = null;
  
  for (const file of fileList) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { showToast(`${file.name}: PDFファイルのみアップロードできます`, 'error'); continue; }
    if (file.type && file.type !== 'application/pdf') { showToast(`${file.name}: PDFファイルのみアップロードできます`, 'error'); continue; }
    if (file.size > MAX_SIZE) { showToast(`${file.name}: 10MB以下にしてください`, 'error'); continue; }
    if (pendingFiles.length >= MAX_FILES) { showToast('1つの申請につき最大10ファイルまで', 'error'); break; }
    if (pendingFiles.some(f => f.name === file.name && f.size === file.size)) continue;
    if (!firstNewFile && pendingFiles.length === 0) firstNewFile = file;
    pendingFiles.push(file);
  }
  
  _currentPendingFiles = pendingFiles;
  _currentFileListId = fileListId;
  renderPdfFileList(pendingFiles, fileListId);
  
  // Auto-fill from the first PDF file uploaded
  if (firstNewFile) {
    parsePdfAndAutofill(firstNewFile, mode);
  }
}

// ============================================================
// REQUEST LIST
// ============================================================
async function renderRequestList(main) {
  const params = new URLSearchParams();
  params.set('page', state.pageParams?.page || '1');
  if (state.pageParams?.status) params.set('status', state.pageParams.status);
  if (state.pageParams?.type) params.set('type', state.pageParams.type);
  if (state.pageParams?.keyword) params.set('keyword', state.pageParams.keyword);
  
  const data = await api(`/requests?${params}`);
  
  main.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold text-gray-900">申請一覧</h1>
      <div class="flex gap-2">
        ${hasRole('admin') ? `<button onclick="exportCSV()" class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"><i class="fas fa-download mr-1"></i>CSV</button>` : ''}
        <button onclick="navigate('new-request')" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <i class="fas fa-plus mr-1"></i>新規申請
        </button>
      </div>
    </div>
    
    <!-- Filters -->
    <div class="flex flex-wrap gap-2 mb-4">
      <select id="filter-type" class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" onchange="applyFilters()">
        <option value="">種別：すべて</option>
        <option value="estimate" ${state.pageParams?.type==='estimate'?'selected':''}>見積もり</option>
        <option value="invoice" ${state.pageParams?.type==='invoice'?'selected':''}>請求書</option>
      </select>
      <select id="filter-status" class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" onchange="applyFilters()">
        <option value="">ステータス：すべて</option>
        <option value="pending" ${state.pageParams?.status==='pending'?'selected':''}>承認中</option>
        <option value="rejected" ${state.pageParams?.status==='rejected'?'selected':''}>差戻し</option>
        <option value="completed" ${state.pageParams?.status==='completed'?'selected':''}>承認完了</option>
        <option value="processed" ${state.pageParams?.status==='processed'?'selected':''}>処理済み</option>
        <option value="withdrawn" ${state.pageParams?.status==='withdrawn'?'selected':''}>取下げ</option>
      </select>
      <input type="text" id="filter-keyword" placeholder="キーワード検索..." value="${state.pageParams?.keyword||''}"
        class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48" onkeydown="if(event.key==='Enter')applyFilters()">
      <button onclick="applyFilters()" class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
        <i class="fas fa-search"></i>
      </button>
    </div>
    
    <!-- Table -->
    ${data.requests.length === 0 ? `
      <div class="bg-white border border-gray-200 rounded-lg p-12 text-center">
        <i class="fas fa-search text-gray-300 text-3xl mb-3"></i>
        <p class="text-gray-500">該当する申請がありません</p>
      </div>
    ` : `
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-gray-500">#</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">種別</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">件名</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">取引先</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">金額（税込）</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">申請者</th>
                <th class="px-4 py-3 text-center font-medium text-gray-500">状態</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">申請日</th>
                <th class="px-4 py-3 text-center font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${data.requests.map(r => {
                const isMine = r.applicant_id === state.user?.id;
                const amAdmin = hasRole('admin');
                const canWithdraw = isMine && r.status === 'pending';
                const canDeleteApplicant = isMine && ['withdrawn','rejected','completed','processed'].includes(r.status);
                const canDeleteAdmin = amAdmin && !isMine;
                const showActions = canWithdraw || canDeleteApplicant || canDeleteAdmin;
                return `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-mono text-gray-500 cursor-pointer" onclick="navigate('request-detail',{id:'${r.id}'})">${String(r.request_number).padStart(4,'0')}</td>
                  <td class="px-4 py-3 cursor-pointer" onclick="navigate('request-detail',{id:'${r.id}'})">${typeLabel(r.type)}</td>
                  <td class="px-4 py-3 font-medium max-w-[200px] truncate cursor-pointer" onclick="navigate('request-detail',{id:'${r.id}'})">${r.title}</td>
                  <td class="px-4 py-3 text-gray-600 max-w-[150px] truncate cursor-pointer" onclick="navigate('request-detail',{id:'${r.id}'})">${r.client_name}</td>
                  <td class="px-4 py-3 text-right font-medium cursor-pointer" onclick="navigate('request-detail',{id:'${r.id}'})">${formatCurrency(r.amount_with_tax)}</td>
                  <td class="px-4 py-3 text-gray-600 cursor-pointer" onclick="navigate('request-detail',{id:'${r.id}'})">${r.applicant_name}</td>
                  <td class="px-4 py-3 text-center cursor-pointer" onclick="navigate('request-detail',{id:'${r.id}'})">${statusBadge(r.status)}</td>
                  <td class="px-4 py-3 text-gray-500 text-xs cursor-pointer" onclick="navigate('request-detail',{id:'${r.id}'})">${formatDate(r.created_at)}</td>
                  <td class="px-4 py-3 text-center">
                    ${showActions ? `
                      <div class="flex items-center justify-center gap-1">
                        ${canWithdraw ? `<button onclick="event.stopPropagation();doWithdraw('${r.id}')" class="px-2 py-1 text-xs border border-orange-300 text-orange-600 rounded hover:bg-orange-50" title="取り下げ"><i class="fas fa-times"></i></button>` : ''}
                        ${canDeleteApplicant || canDeleteAdmin ? `<button onclick="event.stopPropagation();doDeleteRequest('${r.id}')" class="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50" title="削除"><i class="fas fa-trash"></i></button>` : ''}
                      </div>
                    ` : '<span class="text-gray-300">-</span>'}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- Pagination -->
      ${data.totalPages > 1 ? `
        <div class="flex items-center justify-center gap-2 mt-4">
          ${Array.from({length: data.totalPages}, (_, i) => i + 1).map(p => `
            <button onclick="navigate('requests',{...state.pageParams,page:'${p}'})" 
              class="px-3 py-1.5 text-sm rounded-lg ${p == data.page ? 'bg-blue-600 text-white' : 'border border-gray-300 hover:bg-gray-50'}">${p}</button>
          `).join('')}
        </div>
      ` : ''}
    `}`;
}

function applyFilters() {
  navigate('requests', {
    type: document.getElementById('filter-type').value,
    status: document.getElementById('filter-status').value,
    keyword: document.getElementById('filter-keyword').value,
    page: '1'
  });
}

async function exportCSV() {
  try {
    const res = await api('/admin/export/requests');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'requests_export.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSVをエクスポートしました');
  } catch (err) { showToast(err.message, 'error'); }
}

// ============================================================
// REQUEST DETAIL (with PDF files display)
// ============================================================
async function renderRequestDetail(main) {
  const id = state.pageParams?.id;
  if (!id) { navigate('requests'); return; }
  
  const data = await api(`/requests/${id}`);
  const { request: req, steps, files } = data;
  const isApplicant = req.applicant_id === state.user?.id;
  const isAdmin = hasRole('admin');
  const isClerk = hasRole('clerk');
  
  // Find current user's pending step
  const myStep = steps.find(s => s.approver_id === state.user?.id && s.status === 'waiting' && s.step_order == req.current_step);

  // Can upload: applicant on pending/rejected request
  const canUpload = isApplicant && (req.status === 'pending' || req.status === 'rejected');
  const canDelete = isApplicant && (req.status === 'pending' || req.status === 'rejected');
  
  main.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <button onclick="navigate('requests')" class="text-gray-500 hover:text-gray-700"><i class="fas fa-arrow-left"></i></button>
      <h1 class="text-xl font-bold text-gray-900">申請 #${String(req.request_number).padStart(4,'0')}</h1>
      ${statusBadge(req.status)}
      ${req.version > 1 ? `<span class="text-xs text-gray-400">v${req.version}</span>` : ''}
    </div>
    
    <!-- Request Content -->
    <div class="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <h2 class="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">申請内容</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
        <div><span class="text-gray-500">申請種別</span><p class="font-medium">${typeLabel(req.type)}</p></div>
        <div><span class="text-gray-500">申請者</span><p class="font-medium">${req.applicant_name}</p></div>
        <div><span class="text-gray-500">件名</span><p class="font-medium">${req.title}</p></div>
        <div><span class="text-gray-500">取引先</span><p class="font-medium">${req.client_name}</p></div>
        ${req.prime_contractor_name ? `<div><span class="text-gray-500">元請け会社</span><p class="font-medium"><i class="fas fa-building text-indigo-400 mr-1"></i>${req.prime_contractor_name}</p></div>` : ''}
        ${req.subcontractors && req.subcontractors.length > 0 ? `<div class="sm:col-span-2"><span class="text-gray-500">下請け会社</span><div class="flex flex-wrap gap-2 mt-1">${req.subcontractors.map(s => `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800"><i class="fas fa-hard-hat mr-1"></i>${s.company_name}${s.trade_type ? ' (' + s.trade_type + ')' : ''}</span>`).join('')}</div></div>` : ''}
        <div><span class="text-gray-500">金額（税込）</span><p class="font-medium text-lg">${formatCurrency(req.amount_with_tax)}</p></div>
        <div><span class="text-gray-500">税率</span><p class="font-medium">${req.tax_rate * 100}%</p></div>
        <div><span class="text-gray-500">税抜金額</span><p class="font-medium">${formatCurrency(req.amount)}</p></div>
        <div><span class="text-gray-500">申請日</span><p class="font-medium">${formatDate(req.created_at)}</p></div>
        ${req.gross_profit_rate != null ? `<div><span class="text-gray-500">粗利率（税抜ベース）</span><p class="font-medium"><span class="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-emerald-100 text-emerald-800"><i class="fas fa-percentage mr-1 text-xs"></i>${req.gross_profit_rate}%</span></p></div>` : ''}
        ${req.remarks ? `<div class="sm:col-span-2"><span class="text-gray-500">備考</span><p class="font-medium whitespace-pre-wrap">${req.remarks}</p></div>` : ''}
      </div>
    </div>
    
    <!-- Attached PDF Files -->
    <div class="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          <i class="fas fa-file-pdf text-red-500 mr-1"></i>添付PDF（${files.length}件）
        </h2>
        ${canUpload ? `
          <button onclick="showUploadModal('${req.id}')" class="text-sm text-blue-600 hover:text-blue-800">
            <i class="fas fa-plus mr-1"></i>ファイルを追加
          </button>
        ` : ''}
      </div>
      ${files.length === 0 ? `
        <div class="text-center py-6 text-gray-400">
          <i class="fas fa-file-pdf text-3xl mb-2"></i>
          <p class="text-sm">添付ファイルはありません</p>
        </div>
      ` : `
        <div class="space-y-2">
          ${files.map(f => `
            <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
              <i class="fas fa-file-pdf text-red-500 text-lg flex-shrink-0"></i>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate">${f.file_name}</p>
                <p class="text-xs text-gray-500">${formatFileSize(f.file_size)} ・ ${formatDate(f.uploaded_at)}</p>
              </div>
              <div class="flex gap-2 flex-shrink-0">
                <button onclick="previewPdf('${f.id}', '${f.file_name.replace(/'/g, "\\'")}')" 
                  class="px-2.5 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700" title="プレビュー">
                  <i class="fas fa-eye"></i>
                </button>
                <button onclick="downloadPdf('${f.id}', '${f.file_name.replace(/'/g, "\\'")}')" 
                  class="px-2.5 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-700" title="ダウンロード">
                  <i class="fas fa-download"></i>
                </button>
                ${canDelete ? `
                  <button onclick="deletePdfFile('${f.id}', '${f.file_name.replace(/'/g, "\\'")}')" 
                    class="px-2.5 py-1 text-xs bg-white border border-red-300 rounded hover:bg-red-50 text-red-600" title="削除">
                    <i class="fas fa-trash"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
    
    <!-- Approval Timeline -->
    <div class="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <h2 class="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">承認進捗</h2>
      <div class="space-y-0">
        ${steps.map((s, i) => {
          const isCurrent = s.step_order == req.current_step && req.status === 'pending';
          return `
            <div class="flex gap-3 ${i < steps.length - 1 ? 'pb-4' : ''}">
              <div class="flex flex-col items-center">
                <div class="text-lg">${stepStatusIcon(s.status)}</div>
                ${i < steps.length - 1 ? '<div class="w-px flex-1 bg-gray-200 mt-1"></div>' : ''}
              </div>
              <div class="flex-1 pb-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">STEP ${s.step_order} ${s.approver_label}（${s.approver_name}）</span>
                  ${isCurrent ? '<span class="text-xs text-blue-600 font-medium">&#x2190; 現在</span>' : ''}
                </div>
                <p class="text-xs text-gray-500 mt-0.5">
                  ${s.status === 'approved' ? `承認済み　${formatDate(s.decided_at)}` : 
                    s.status === 'rejected' ? `差戻し　${formatDate(s.decided_at)}` : 
                    s.status === 'skipped' ? '自動スキップ（申請者本人）' : '承認待ち'}
                </p>
                ${s.comment ? `<div class="mt-1 p-2 bg-gray-50 rounded text-xs text-gray-700">${s.comment}</div>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
    
    <!-- Approval Actions (for current approver) -->
    ${myStep ? `
    <div class="bg-white border border-blue-200 rounded-lg p-5 mb-4">
      <h2 class="text-sm font-semibold text-blue-600 mb-3">承認操作</h2>
      <p class="text-xs text-gray-500 mb-3">添付PDFを確認の上、承認または差戻しを行ってください。</p>
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">コメント（差戻し時は必須）</label>
        <textarea id="approval-comment" rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="コメントを入力..."></textarea>
      </div>
      <div class="flex gap-3">
        <button onclick="doReject('${myStep.id}')" class="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
          <i class="fas fa-undo mr-1"></i>差戻し
        </button>
        <button onclick="doApprove('${myStep.id}')" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <i class="fas fa-check mr-1"></i>承認する
        </button>
      </div>
    </div>` : ''}
    
    <!-- Applicant Actions -->
    ${isApplicant && req.status === 'pending' ? `
    <div class="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <div class="flex gap-3">
        <button onclick="doWithdraw('${req.id}')" class="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
          <i class="fas fa-times mr-1"></i>この申請を取り下げる
        </button>
      </div>
    </div>` : ''}
    
    ${isApplicant && req.status === 'rejected' ? `
    <div class="bg-white border border-orange-200 rounded-lg p-5 mb-4">
      <div class="flex gap-3 flex-wrap">
        <button onclick="navigate('edit-request',{id:'${req.id}'})" class="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600">
          <i class="fas fa-edit mr-1"></i>修正して再申請
        </button>
        <button onclick="doDeleteRequest('${req.id}')" class="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
          <i class="fas fa-trash mr-1"></i>この申請を削除
        </button>
      </div>
    </div>` : ''}

    ${isApplicant && ['withdrawn', 'completed', 'processed'].includes(req.status) ? `
    <div class="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <button onclick="doDeleteRequest('${req.id}')" class="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
        <i class="fas fa-trash mr-1"></i>この申請を削除
      </button>
    </div>` : ''}

    ${isAdmin && !isApplicant ? `
    <div class="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <button onclick="doDeleteRequest('${req.id}')" class="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
        <i class="fas fa-trash mr-1"></i>この申請を削除（管理者）
      </button>
    </div>` : ''}
    
    <!-- Clerk Actions -->
    ${(isClerk || isAdmin) && req.status === 'completed' ? `
    <div class="bg-white border border-green-200 rounded-lg p-5 mb-4">
      <button onclick="doProcess('${req.id}')" class="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
        <i class="fas fa-check-double mr-1"></i>処理済みにする
      </button>
    </div>` : ''}
    
    <!-- Admin: Reassign -->
    ${isAdmin && req.status === 'pending' ? `
    <div class="bg-white border border-purple-200 rounded-lg p-5 mb-4">
      <button onclick="showReassignModal('${req.id}', ${req.current_step}, ${req.version})" class="px-4 py-2 text-sm border border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50">
        <i class="fas fa-exchange-alt mr-1"></i>承認者を変更（振替）
      </button>
    </div>` : ''}`;
}

// PDF Preview in modal
function previewPdf(fileId, fileName) {
  const previewUrl = `/api/files/${fileId}/preview?token=${encodeURIComponent(state.token)}`;
  
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-overlay fixed inset-0 z-40 flex items-center justify-center p-4" onclick="if(event.target===this)closeModal()">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl" style="height:85vh;">
        <div class="px-6 py-3 border-b border-gray-200 flex justify-between items-center">
          <h3 class="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <i class="fas fa-file-pdf text-red-500"></i> ${fileName}
          </h3>
          <div class="flex items-center gap-2">
            <button onclick="downloadPdf('${fileId}', '${fileName.replace(/'/g, "\\'")}')" class="text-sm text-blue-600 hover:text-blue-800">
              <i class="fas fa-download mr-1"></i>ダウンロード
            </button>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 ml-2"><i class="fas fa-times text-lg"></i></button>
          </div>
        </div>
        <div class="p-0" style="height:calc(85vh - 52px);">
          <iframe src="${previewUrl}" class="w-full h-full border-0 rounded-b-lg" title="PDF Preview"></iframe>
        </div>
      </div>
    </div>`;
}

// PDF Download
async function downloadPdf(fileId, fileName) {
  try {
    const response = await fetch(`/api/files/${fileId}/download`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'ダウンロードに失敗しました');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Delete PDF file
async function deletePdfFile(fileId, fileName) {
  showConfirm(`「${fileName}」を削除しますか？`, async () => {
    try {
      await api(`/files/${fileId}/delete`, { method: 'POST' });
      showToast('ファイルを削除しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// Upload modal (from detail page)
function showUploadModal(requestId) {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-overlay fixed inset-0 z-40 flex items-center justify-center p-4" onclick="if(event.target===this)closeModal()">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 class="text-lg font-semibold">PDFファイルを追加</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="px-6 py-4">
          <p class="text-xs text-gray-500 mb-3">PDF形式のみ / 1ファイル最大10MB</p>
          <div id="modal-drop-zone" class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer">
            <i class="fas fa-cloud-upload-alt text-gray-400 text-2xl mb-2"></i>
            <p class="text-sm text-gray-600">ここにPDFをドラッグ＆ドロップ</p>
            <p class="text-xs text-gray-400 mt-1">または</p>
            <button type="button" id="modal-select-btn" class="mt-2 px-4 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50">ファイルを選択</button>
            <input type="file" id="modal-file-input" accept=".pdf,application/pdf" multiple class="hidden">
          </div>
          <div id="modal-file-list" class="mt-3 space-y-2"></div>
          <div id="modal-upload-progress" class="mt-3 hidden">
            <div class="flex items-center gap-2">
              <i class="fas fa-spinner fa-spin text-blue-600"></i>
              <span class="text-sm text-gray-600">アップロード中...</span>
            </div>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg">キャンセル</button>
          <button id="modal-upload-btn" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700" disabled>
            <i class="fas fa-upload mr-1"></i>アップロード
          </button>
        </div>
      </div>
    </div>`;
  
  const modalPendingFiles = [];
  
  // Setup drop zone
  const dropZone = document.getElementById('modal-drop-zone');
  const fileInput = document.getElementById('modal-file-input');
  const selectBtn = document.getElementById('modal-select-btn');
  const uploadBtn = document.getElementById('modal-upload-btn');
  
  selectBtn.onclick = () => fileInput.click();
  dropZone.onclick = (e) => { if (e.target === dropZone || e.target.tagName === 'I' || e.target.tagName === 'P') fileInput.click(); };
  
  fileInput.onchange = () => {
    addModalFiles(fileInput.files, modalPendingFiles);
    fileInput.value = '';
  };
  
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-blue-400', 'bg-blue-50'); };
  dropZone.ondragleave = (e) => { e.preventDefault(); dropZone.classList.remove('border-blue-400', 'bg-blue-50'); };
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-400', 'bg-blue-50');
    addModalFiles(e.dataTransfer.files, modalPendingFiles);
  };
  
  function addModalFiles(fileList, pending) {
    const MAX_SIZE = 10 * 1024 * 1024;
    for (const file of fileList) {
      if (!file.name.toLowerCase().endsWith('.pdf')) { showToast(`${file.name}: PDFのみ`, 'error'); continue; }
      if (file.size > MAX_SIZE) { showToast(`${file.name}: 10MB超過`, 'error'); continue; }
      if (pending.some(f => f.name === file.name && f.size === file.size)) continue;
      pending.push(file);
    }
    renderModalFileList(pending);
    uploadBtn.disabled = pending.length === 0;
  }
  
  function renderModalFileList(pending) {
    const listEl = document.getElementById('modal-file-list');
    listEl.innerHTML = pending.map((f, i) => `
      <div class="flex items-center gap-3 p-2 bg-gray-50 rounded border border-gray-200">
        <i class="fas fa-file-pdf text-red-500"></i>
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">${f.name}</p>
          <p class="text-xs text-gray-500">${formatFileSize(f.size)}</p>
        </div>
        <button type="button" onclick="this.closest('.flex').remove(); window._modalPending.splice(${i},1); document.getElementById('modal-upload-btn').disabled = window._modalPending.length === 0;" class="text-gray-400 hover:text-red-500">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');
  }
  
  // Store reference for inline remove buttons
  window._modalPending = modalPendingFiles;
  
  uploadBtn.onclick = async () => {
    uploadBtn.disabled = true;
    document.getElementById('modal-upload-progress').classList.remove('hidden');
    
    let errors = [];
    for (const file of modalPendingFiles) {
      try {
        await uploadPdfFile(requestId, file);
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }
    
    closeModal();
    if (errors.length > 0) {
      showToast('一部のファイルのアップロードに失敗しました', 'error');
    } else {
      showToast('ファイルをアップロードしました');
    }
    renderPageContent();
  };
}

async function doApprove(stepId) {
  const comment = document.getElementById('approval-comment')?.value || '';
  try {
    const res = await api('/approvals/approve', { method: 'POST', body: JSON.stringify({ stepId, comment }) });
    showToast(res.message);
    renderPageContent();
  } catch (err) { showToast(err.message, 'error'); }
}

async function doReject(stepId) {
  const comment = document.getElementById('approval-comment')?.value || '';
  if (!comment.trim()) { showToast('差戻し理由を入力してください', 'error'); return; }
  showConfirm('この申請を差戻ししますか？', async () => {
    try {
      const res = await api('/approvals/reject', { method: 'POST', body: JSON.stringify({ stepId, comment }) });
      showToast(res.message);
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function doWithdraw(requestId) {
  showConfirm('この申請を取り下げますか？', async () => {
    try {
      await api(`/requests/${requestId}/withdraw`, { method: 'POST' });
      showToast('申請を取り下げました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function doDeleteRequest(requestId) {
  showConfirm('この申請を完全に削除しますか？\n削除後は復元できません。', async () => {
    try {
      await api(`/requests/${requestId}/delete`, { method: 'POST' });
      showToast('申請を削除しました');
      if (state.currentPage === 'requests') {
        renderPageContent();
      } else {
        navigate('requests');
      }
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function doProcess(requestId) {
  showConfirm('この申請を処理済みにしますか？', async () => {
    try {
      await api('/approvals/process', { method: 'POST', body: JSON.stringify({ requestId }) });
      showToast('処理済みにしました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function showReassignModal(requestId, currentStep, version) {
  const data = await api('/dashboard/active-users');
  const step = await api(`/requests/${requestId}`);
  const currentStepData = step.steps.find(s => s.step_order == currentStep && s.status === 'waiting');
  if (!currentStepData) { showToast('振替可能なステップがありません', 'error'); return; }
  
  showModal('承認者を変更', `
    <p class="text-sm text-gray-600 mb-3">STEP ${currentStep} の承認者を変更します</p>
    <select id="reassign-user" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
      ${data.users.map(u => `<option value="${u.id}">${u.display_name}（${u.email}）</option>`).join('')}
    </select>`,
    `<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg">キャンセル</button>
     <button id="reassign-btn" class="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">変更する</button>`
  );
  document.getElementById('reassign-btn').onclick = async () => {
    try {
      await api('/approvals/reassign', { method: 'POST', body: JSON.stringify({ stepId: currentStepData.id, newApproverId: document.getElementById('reassign-user').value }) });
      closeModal();
      showToast('承認者を振り替えました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

// ============================================================
// EDIT / RESUBMIT REQUEST (with PDF file management)
// ============================================================
async function renderEditRequest(main) {
  const id = state.pageParams?.id;
  if (!id) { navigate('requests'); return; }
  
  const data = await api(`/requests/${id}`);
  const req = data.request;
  const existingFiles = data.files || [];
  let partners = [];
  try { const pd = await api('/partners'); partners = pd.partners || []; } catch {}
  
  // Find rejection comment
  const rejectedStep = data.steps.find(s => s.status === 'rejected');
  
  main.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <button onclick="navigate('request-detail',{id:'${id}'})" class="text-gray-500 hover:text-gray-700"><i class="fas fa-arrow-left"></i></button>
      <h1 class="text-xl font-bold text-gray-900">申請 #${String(req.request_number).padStart(4,'0')}（修正・再申請）</h1>
    </div>
    
    ${rejectedStep ? `
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <p class="text-sm font-medium text-red-800 mb-1">差戻し理由（${rejectedStep.approver_label}：${rejectedStep.approver_name}）</p>
      <p class="text-sm text-red-700">${rejectedStep.comment}</p>
    </div>` : ''}
    
    <div class="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl">
      <form id="edit-form" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">申請種別 <span class="text-red-500">*</span></label>
          <select id="edit-type" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="estimate" ${req.type==='estimate'?'selected':''}>見積もり</option>
            <option value="invoice" ${req.type==='invoice'?'selected':''}>請求書</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">件名 <span class="text-red-500">*</span></label>
          <input type="text" id="edit-title" required maxlength="100" value="${req.title}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">取引先名 <span class="text-red-500">*</span></label>
          <input type="text" id="edit-client" required maxlength="100" value="${req.client_name}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">元請け会社 <span class="text-xs text-gray-400 font-normal">（STCが下請けの場合）</span></label>
          <select id="edit-prime-contractor" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">なし（STCが元請け）</option>
            ${partners.map(p => '<option value="' + p.id + '"' + (req.prime_contractor_id === p.id ? ' selected' : '') + '>' + p.company_name + (p.trade_type ? ' (' + p.trade_type + ')' : '') + '</option>').join('')}
          </select>
        </div>

        <!-- 下請け会社 -->
        <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <label class="block text-sm font-medium text-orange-800 mb-1">
            <i class="fas fa-hard-hat text-orange-600 mr-1"></i>下請け会社（協力会社）
          </label>
          <p class="text-xs text-orange-600 mb-2">この案件に参加する下請け会社を選択してください（任意・複数可）</p>
          <div id="edit-sub-container">
            <div class="flex gap-2 mb-2">
              <select id="edit-sub-select" class="flex-1 px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500">
                <option value="">下請け会社を選択...</option>
                ${partners.map(p => '<option value="' + p.id + '" data-name="' + p.company_name + (p.trade_type ? ' (' + p.trade_type + ')' : '') + '">' + p.company_name + (p.trade_type ? ' (' + p.trade_type + ')' : '') + '</option>').join('')}
              </select>
              <button type="button" id="edit-sub-add-btn" class="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm">
                <i class="fas fa-plus"></i>
              </button>
            </div>
            <div id="edit-sub-list" class="space-y-1"></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">金額（税込）<span class="text-red-500">*</span></label>
            <div class="relative">
              <span class="absolute left-3 top-2 text-gray-500 text-sm">\u00a5</span>
              <input type="number" id="edit-amount" required min="1" value="${req.amount_with_tax}" class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcTaxEditFromInc()">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">税率 <span class="text-red-500">*</span></label>
            <select id="edit-tax" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" onchange="calcTaxEditFromInc()">
              <option value="0.10" ${req.tax_rate==0.10?'selected':''}>10%</option>
              <option value="0.08" ${req.tax_rate==0.08?'selected':''}>8%</option>
              <option value="0.0" ${req.tax_rate==0?'selected':''}>0%</option>
            </select>
          </div>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
          <div class="flex justify-between items-center">
            <div>
              <p class="text-xs text-gray-500">税抜金額</p>
              <p id="edit-excl-tax" class="text-sm text-gray-700">${formatCurrency(req.amount)}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500">消費税</p>
              <p id="edit-tax-amount" class="text-sm text-gray-700">${formatCurrency(req.amount_with_tax - req.amount)}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500">税込金額</p>
              <p id="edit-total" class="text-lg font-bold">${formatCurrency(req.amount_with_tax)}</p>
            </div>
          </div>
        </div>

        <!-- 粗利率入力 -->
        <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <label class="block text-sm font-medium text-emerald-800 mb-1">
            <i class="fas fa-percentage text-emerald-600 mr-1"></i>粗利率（税抜ベース）
          </label>
          <p class="text-xs text-emerald-600 mb-2">想定する粗利率を入力してください（任意）</p>
          <div class="flex items-center gap-3">
            <div class="relative flex-1" style="max-width:160px">
              <input type="number" id="edit-profit-rate" min="0" max="100" step="0.1" value="${req.gross_profit_rate != null ? req.gross_profit_rate : ''}" class="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" placeholder="例: 20" oninput="calcProfitPreviewEdit()">
              <span class="absolute right-3 top-2 text-gray-500 text-sm">%</span>
            </div>
            <div id="edit-profit-preview" class="text-sm text-emerald-700"></div>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">備考</label>
          <textarea id="edit-remarks" rows="3" maxlength="1000" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">${req.remarks || ''}</textarea>
        </div>
        
        <!-- Existing PDF files -->
        <div class="border-t border-gray-200 pt-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            <i class="fas fa-file-pdf text-red-500 mr-1"></i>
            添付済みPDFファイル
          </label>
          ${existingFiles.length > 0 ? `
            <div id="existing-files" class="space-y-2 mb-3">
              ${existingFiles.map(f => `
                <div class="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200" data-file-id="${f.id}">
                  <i class="fas fa-file-pdf text-red-500"></i>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">${f.file_name}</p>
                    <p class="text-xs text-gray-500">${formatFileSize(f.file_size)} ・ 既存ファイル</p>
                  </div>
                  <button type="button" onclick="markFileForDeletion(this, '${f.id}', '${f.file_name.replace(/'/g, "\\'")}')" class="text-gray-400 hover:text-red-500 p-1" title="削除">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              `).join('')}
            </div>
          ` : '<p class="text-xs text-gray-400 mb-3">添付ファイルはありません</p>'}
          
          <label class="block text-sm font-medium text-gray-700 mb-2">
            <i class="fas fa-magic text-blue-600 mr-1"></i>新しいPDFを追加（自動入力対応）
          </label>
          <div id="edit-pdf-drop-zone" class="border-2 border-dashed border-blue-300 rounded-lg p-4 text-center hover:border-blue-500 bg-blue-50 transition-colors cursor-pointer">
            <i class="fas fa-cloud-upload-alt text-blue-400 text-xl mb-1"></i>
            <p class="text-sm text-gray-600">PDFをドラッグ＆ドロップまたはクリック</p>
            <button type="button" id="edit-pdf-select-btn" class="mt-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">ファイルを選択</button>
            <input type="file" id="edit-pdf-file-input" accept=".pdf,application/pdf" multiple class="hidden">
          </div>
          <div id="pdf-parse-status" class="mt-2 hidden">
            <div class="flex items-center gap-2 text-sm text-blue-700">
              <i class="fas fa-spinner fa-spin"></i>
              <span>PDFを解析中...</span>
            </div>
          </div>
          <div id="pdf-autofill-result" class="mt-2 hidden"></div>
          <div id="edit-pdf-file-list" class="mt-2 space-y-2"></div>
        </div>

        <div id="edit-error" class="text-red-600 text-sm hidden"></div>
        <div class="flex justify-end gap-3">
          <button type="button" onclick="navigate('request-detail',{id:'${id}'})" class="px-4 py-2 text-sm border border-gray-300 rounded-lg">キャンセル</button>
          <button type="submit" id="edit-submit" class="px-6 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium">
            <i class="fas fa-paper-plane mr-1"></i>再申請する
          </button>
        </div>
      </form>
    </div>`;
  
  // Track files to delete and new files to upload
  const filesToDelete = [];
  const newPendingFiles = [];
  _currentPendingFiles = newPendingFiles;
  _currentFileListId = 'edit-pdf-file-list';
  
  setupPdfDropZoneWithAutofill('edit-pdf-drop-zone', 'edit-pdf-file-input', 'edit-pdf-select-btn', 'edit-pdf-file-list', newPendingFiles, 'edit');
  
  // 下請け会社マルチセレクト（既存データを復元）
  const editSelectedSubs = [];
  setupSubcontractorPicker('edit-sub-select', 'edit-sub-add-btn', 'edit-sub-list', editSelectedSubs);
  // 既存の下請け情報を復元
  if (req.subcontractors && req.subcontractors.length > 0) {
    for (const sub of req.subcontractors) {
      editSelectedSubs.push({ id: sub.id, name: sub.company_name + (sub.trade_type ? ' (' + sub.trade_type + ')' : '') });
      renderSubList('edit-sub-list', editSelectedSubs, 'edit-sub-select');
    }
  }
  
  // Mark file for deletion
  window.markFileForDeletion = function(btn, fileId, fileName) {
    const row = btn.closest('[data-file-id]');
    if (filesToDelete.includes(fileId)) {
      // Unmark
      filesToDelete.splice(filesToDelete.indexOf(fileId), 1);
      row.classList.remove('opacity-50', 'line-through');
      row.classList.add('bg-blue-50', 'border-blue-200');
      row.classList.remove('bg-red-50', 'border-red-200');
      btn.innerHTML = '<i class="fas fa-times"></i>';
      btn.title = '削除';
    } else {
      filesToDelete.push(fileId);
      row.classList.add('opacity-50');
      row.classList.remove('bg-blue-50', 'border-blue-200');
      row.classList.add('bg-red-50', 'border-red-200');
      btn.innerHTML = '<i class="fas fa-undo"></i>';
      btn.title = '元に戻す';
    }
  };
  
  document.getElementById('edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('edit-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('edit-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>送信中...';
    
    try {
      // Check that at least one file will remain after deletion + new uploads
      const remainingExisting = existingFiles.filter(f => !filesToDelete.includes(f.id));
      if (remainingExisting.length === 0 && newPendingFiles.length === 0) {
        throw new Error('PDFファイルを1つ以上添付してください');
      }
      
      // 1. Resubmit the request
      const editProfitRateInput = document.getElementById('edit-profit-rate').value;
      const body = {
        type: document.getElementById('edit-type').value,
        title: document.getElementById('edit-title').value,
        client_name: document.getElementById('edit-client').value,
        amount_with_tax: parseFloat(document.getElementById('edit-amount').value),
        tax_rate: parseFloat(document.getElementById('edit-tax').value),
        remarks: document.getElementById('edit-remarks').value,
        gross_profit_rate: editProfitRateInput !== '' ? parseFloat(editProfitRateInput) : null,
        prime_contractor_id: document.getElementById('edit-prime-contractor').value || null,
        subcontractor_ids: editSelectedSubs.length > 0 ? editSelectedSubs.map(s => s.id) : null
      };
      await api(`/requests/${id}/resubmit`, { method: 'POST', body: JSON.stringify(body) });
      
      // 2. Delete marked files
      for (const fileId of filesToDelete) {
        try { await api(`/files/${fileId}/delete`, { method: 'POST' }); } catch (e) { /* ignore */ }
      }
      
      // 3. Upload new files
      let uploadErrors = [];
      for (const file of newPendingFiles) {
        try {
          await uploadPdfFile(id, file);
        } catch (err) {
          uploadErrors.push(`${file.name}: ${err.message}`);
        }
      }
      
      if (uploadErrors.length > 0) {
        showToast('再申請しましたが一部ファイルのアップロードに失敗しました', 'error');
      } else {
        showToast('再申請とファイル更新が完了しました');
      }
      navigate('request-detail', { id });
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>再申請する';
    }
  };
}

function calcTaxEditFromInc() {
  const amountWithTax = parseFloat(document.getElementById('edit-amount')?.value || '0');
  const rate = parseFloat(document.getElementById('edit-tax')?.value || '0.10');
  const amountExclTax = rate > 0 ? Math.round(amountWithTax / (1 + rate)) : amountWithTax;
  const taxAmount = amountWithTax - amountExclTax;
  const el = document.getElementById('edit-total');
  const elExcl = document.getElementById('edit-excl-tax');
  const elTaxAmt = document.getElementById('edit-tax-amount');
  if (el) el.textContent = formatCurrency(amountWithTax);
  if (elExcl) elExcl.textContent = formatCurrency(amountExclTax);
  if (elTaxAmt) elTaxAmt.textContent = formatCurrency(taxAmount);
  calcProfitPreviewEdit();
}

// 粗利プレビュー計算（編集・再申請）
function calcProfitPreviewEdit() {
  const amountWithTax = parseFloat(document.getElementById('edit-amount')?.value || '0');
  const rate = parseFloat(document.getElementById('edit-tax')?.value || '0.10');
  const amountExclTax = rate > 0 ? Math.round(amountWithTax / (1 + rate)) : amountWithTax;
  const profitRateVal = parseFloat(document.getElementById('edit-profit-rate')?.value || '');
  const previewEl = document.getElementById('edit-profit-preview');
  if (!previewEl) return;
  if (isNaN(profitRateVal) || profitRateVal <= 0 || amountExclTax <= 0) {
    previewEl.textContent = '';
    return;
  }
  const profitAmount = Math.round(amountExclTax * profitRateVal / 100);
  const costAmount = amountExclTax - profitAmount;
  previewEl.innerHTML = '<span class="text-emerald-600">粗利 ' + formatCurrency(profitAmount) + '</span><span class="text-gray-400 mx-1">|</span><span class="text-gray-600">原価 ' + formatCurrency(costAmount) + '</span>';
}

// ============================================================
// ADMIN: USER MANAGEMENT
// ============================================================
async function renderAdminUsers(main) {
  if (!hasRole('admin')) { navigate('dashboard'); return; }
  const data = await api('/admin/users');
  
  main.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold text-gray-900">ユーザー管理</h1>
      <button onclick="showInviteUserModal()" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        <i class="fas fa-plus mr-1"></i>ユーザーを追加
      </button>
    </div>
    
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-left font-medium text-gray-500">氏名</th>
              <th class="px-4 py-3 text-left font-medium text-gray-500">ログインID</th>
              <th class="px-4 py-3 text-left font-medium text-gray-500">ロール</th>
              <th class="px-4 py-3 text-center font-medium text-gray-500">状態</th>
              <th class="px-4 py-3 text-center font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${data.users.map(u => {
              const roles = JSON.parse(u.role);
              return `
                <tr class="${!u.is_active ? 'bg-gray-50 opacity-60' : ''}">
                  <td class="px-4 py-3 font-medium">${u.display_name}</td>
                  <td class="px-4 py-3 text-gray-600">${u.email}</td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-1">
                      ${roles.map(r => `<span class="text-xs px-2 py-0.5 rounded-full ${r==='admin'?'bg-purple-100 text-purple-700':r==='approver'?'bg-blue-100 text-blue-700':r==='clerk'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600'}">${roleLabel(r)}</span>`).join('')}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs px-2 py-0.5 rounded-full ${u.is_active?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${u.is_active?'有効':'無効'}</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <button onclick="showEditUserModal('${u.id}')" class="text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-sm text-gray-500 mt-3">有効：${data.users.filter(u=>u.is_active).length}名　無効：${data.users.filter(u=>!u.is_active).length}名　合計：${data.users.length}名</p>`;
}

function showInviteUserModal() {
  showModal('ユーザーを追加', `
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">氏名 <span class="text-red-500">*</span></label>
        <input type="text" id="invite-name" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="山田 太郎">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">メールアドレス <span class="text-xs text-gray-400 font-normal">（任意）</span></label>
        <input type="email" id="invite-email" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="未入力の場合、ログインIDが自動生成されます">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">ロール</label>
        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked disabled> 申請者（必須）</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="invite-approver"> 承認者</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="invite-clerk"> 事務員</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="invite-admin"> 管理者</label>
        </div>
      </div>
    </div>`,
    `<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg">キャンセル</button>
     <button id="invite-btn" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">追加する</button>`
  );
  document.getElementById('invite-btn').onclick = async () => {
    const name = document.getElementById('invite-name').value.trim();
    if (!name) { showToast('氏名を入力してください', 'error'); return; }
    const roles = ['applicant'];
    if (document.getElementById('invite-approver').checked) roles.push('approver');
    if (document.getElementById('invite-clerk').checked) roles.push('clerk');
    if (document.getElementById('invite-admin').checked) roles.push('admin');
    try {
      const res = await api('/admin/users/invite', { method: 'POST', body: JSON.stringify({
        email: document.getElementById('invite-email').value.trim() || '',
        displayName: name,
        roles
      })});
      closeModal();
      showToast(res.message);
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function showEditUserModal(userId) {
  const data = await api('/admin/users');
  const user = data.users.find(u => u.id === userId);
  if (!user) return;
  const roles = JSON.parse(user.role);
  
  showModal(`ユーザー編集：${user.display_name}`, `
    <p class="text-sm text-gray-500 mb-4">ログインID：${user.email}</p>
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">氏名</label>
        <input type="text" id="edituser-name" value="${user.display_name}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">ロール</label>
        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked disabled> 申請者（必須）</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="edituser-approver" ${roles.includes('approver')?'checked':''}> 承認者</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="edituser-clerk" ${roles.includes('clerk')?'checked':''}> 事務員</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="edituser-admin" ${roles.includes('admin')?'checked':''}> 管理者</label>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">アカウント状態</label>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="edituser-active" value="1" ${user.is_active?'checked':''}> 有効</label>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="edituser-active" value="0" ${!user.is_active?'checked':''}> 無効</label>
        </div>
      </div>
      <div class="border-t border-gray-200 pt-3 space-y-2">
        <button onclick="resetUserPassword('${user.id}')" class="text-sm text-blue-600 hover:text-blue-800 block">
          <i class="fas fa-key mr-1"></i>パスワードリセット
        </button>
        <button onclick="deleteUser('${user.id}')" class="text-sm text-red-600 hover:text-red-800 block">
          <i class="fas fa-trash mr-1"></i>このユーザーを削除
        </button>
      </div>
    </div>`,
    `<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg">キャンセル</button>
     <button id="edituser-save" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存する</button>`
  );
  document.getElementById('edituser-save').onclick = async () => {
    const newRoles = ['applicant'];
    if (document.getElementById('edituser-approver').checked) newRoles.push('approver');
    if (document.getElementById('edituser-clerk').checked) newRoles.push('clerk');
    if (document.getElementById('edituser-admin').checked) newRoles.push('admin');
    const isActive = document.querySelector('input[name="edituser-active"]:checked').value === '1';
    try {
      await api(`/admin/users/${userId}/update`, { method: 'POST', body: JSON.stringify({
        displayName: document.getElementById('edituser-name').value,
        roles: newRoles,
        isActive
      })});
      closeModal();
      showToast('ユーザー情報を更新しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function resetUserPassword(userId) {
  showConfirm('パスワードをリセットしますか？初期パスワードに戻ります。', async () => {
    try {
      const res = await api(`/admin/users/${userId}/reset-password`, { method: 'POST' });
      showToast(res.message);
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function deleteUser(userId) {
  showConfirm('このユーザーを削除しますか？この操作は取り消せません。', async () => {
    try {
      await api(`/admin/users/${userId}/delete`, { method: 'POST' });
      closeModal();
      showToast('ユーザーを削除しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ============================================================
// ADMIN: APPROVER SETTINGS
// ============================================================
async function renderAdminApprovers(main) {
  if (!hasRole('admin')) { navigate('dashboard'); return; }
  const data = await api('/admin/approvers');
  
  main.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold text-gray-900">承認者設定</h1>
      <button onclick="showAddApproverModal()" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        <i class="fas fa-plus mr-1"></i>承認者を追加
      </button>
    </div>
    
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
      <i class="fas fa-info-circle mr-1"></i>
      承認フローは上から順に実行されます。担当者の入れ替え・ラベル変更・順序変更・追加・削除が可能です。
      <br>変更は次回の新規申請から反映されます（処理中の申請には影響しません）。
    </div>
    
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="px-4 py-3 text-center font-medium text-gray-500 w-16">順序</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500">担当者</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500">役職ラベル</th>
            <th class="px-4 py-3 text-center font-medium text-gray-500 w-20">状態</th>
            <th class="px-4 py-3 text-center font-medium text-gray-500 w-32">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${data.approvers.map(a => `
            <tr class="${!a.is_active?'opacity-50 bg-gray-50':''}">
              <td class="px-4 py-3 text-center">
                <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">${a.step_order}</span>
              </td>
              <td class="px-4 py-3">
                <div class="font-medium">${a.display_name}</div>
                <div class="text-xs text-gray-400">${a.email}</div>
              </td>
              <td class="px-4 py-3 text-gray-700">${a.label}</td>
              <td class="px-4 py-3 text-center">
                <span class="text-xs px-2 py-0.5 rounded-full ${a.is_active?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${a.is_active?'有効':'無効'}</span>
              </td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  <button onclick="showEditApproverModal('${a.id}','${a.label}',${a.step_order},${a.is_active},'${a.user_id}')" class="text-blue-600 hover:text-blue-800 p-1" title="編集"><i class="fas fa-edit"></i></button>
                  <button onclick="deleteApprover('${a.id}')" class="text-red-600 hover:text-red-800 p-1" title="削除"><i class="fas fa-trash"></i></button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="text-sm text-gray-500 mt-3">
      有効：${data.approvers.filter(a=>a.is_active).length}名　合計：${data.approvers.length}名
    </p>`;
}

async function showAddApproverModal() {
  const data = await api('/dashboard/approver-candidates');
  if (data.users.length === 0) {
    showToast('承認者ロールを持つユーザーがいません。先にユーザー管理で承認者ロールを付与してください。', 'error');
    return;
  }
  
  showModal('承認者を追加', `
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">ユーザー</label>
        <select id="add-approver-user" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          ${data.users.map(u => `<option value="${u.id}">${u.display_name}（${u.email}）</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">役職ラベル</label>
        <input type="text" id="add-approver-label" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="例：経理担当、事業部長">
      </div>
    </div>`,
    `<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg">キャンセル</button>
     <button id="add-approver-btn" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">追加する</button>`
  );
  document.getElementById('add-approver-btn').onclick = async () => {
    try {
      await api('/admin/approvers', { method: 'POST', body: JSON.stringify({
        userId: document.getElementById('add-approver-user').value,
        label: document.getElementById('add-approver-label').value
      })});
      closeModal();
      showToast('承認者を追加しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function showEditApproverModal(id, label, stepOrder, isActive, currentUserId) {
  // Load approver candidates for user swap
  const candidates = await api('/dashboard/approver-candidates');
  
  showModal('承認者を編集', `
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          <i class="fas fa-user-edit mr-1 text-blue-500"></i>担当者を変更
        </label>
        <select id="edit-approver-user" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          ${candidates.users.map(u => `<option value="${u.id}" ${u.id === currentUserId ? 'selected' : ''}>${u.display_name}（${u.email}）</option>`).join('')}
        </select>
        <p class="text-xs text-gray-400 mt-1">別の人に担当を入れ替えられます</p>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">役職ラベル</label>
        <input type="text" id="edit-approver-label" value="${label}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">承認順序</label>
        <input type="number" id="edit-approver-order" value="${stepOrder}" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">状態</label>
        <select id="edit-approver-active" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="1" ${isActive?'selected':''}>有効</option>
          <option value="0" ${!isActive?'selected':''}>無効</option>
        </select>
      </div>
    </div>`,
    `<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg">キャンセル</button>
     <button id="edit-approver-btn" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存する</button>`
  );
  document.getElementById('edit-approver-btn').onclick = async () => {
    const newUserId = document.getElementById('edit-approver-user').value;
    try {
      await api(`/admin/approvers/${id}/update`, { method: 'POST', body: JSON.stringify({
        label: document.getElementById('edit-approver-label').value,
        stepOrder: parseInt(document.getElementById('edit-approver-order').value),
        isActive: document.getElementById('edit-approver-active').value === '1',
        userId: newUserId !== currentUserId ? newUserId : undefined
      })});
      closeModal();
      showToast('承認者を更新しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

async function deleteApprover(id) {
  showConfirm('この承認者を削除しますか？', async () => {
    try {
      const res = await api(`/admin/approvers/${id}/delete`, { method: 'POST' });
      showToast(res.message);
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ============================================================
// ADMIN: SYSTEM SETTINGS
// ============================================================
async function renderAdminSettings(main) {
  if (!hasRole('admin')) { navigate('dashboard'); return; }
  const data = await api('/admin/settings');
  const settings = data.settings;
  
  main.innerHTML = `
    <h1 class="text-xl font-bold text-gray-900 mb-4">システム設定</h1>
    <div class="bg-white border border-gray-200 rounded-lg p-6 max-w-xl space-y-6">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">通知先事務員メールアドレス</label>
        <p class="text-xs text-gray-500 mb-2">最終承認完了時に通知するメールアドレス（カンマ区切りで複数可）</p>
        <input type="text" id="setting-clerk-emails" 
          value="${(settings.clerk_emails || []).join(', ')}"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" 
          placeholder="jimu@example.com">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">システム名</label>
        <input type="text" id="setting-system-name"
          value="${settings.system_name || '申請承認ワークフロー'}"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">リマインド間隔（時間）</label>
        <input type="number" id="setting-reminder-hours"
          value="${settings.reminder_hours || 48}"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" min="1">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">リマインド最大回数</label>
        <input type="number" id="setting-reminder-max"
          value="${settings.reminder_max_count || 3}"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" min="1">
      </div>
      <button onclick="saveSettings()" class="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
        <i class="fas fa-save mr-1"></i>保存する
      </button>
    </div>`;
}

async function saveSettings() {
  try {
    const clerkEmails = document.getElementById('setting-clerk-emails').value.split(',').map(s => s.trim()).filter(Boolean);
    await api('/admin/settings', { method: 'POST', body: JSON.stringify({ key: 'clerk_emails', value: clerkEmails }) });
    await api('/admin/settings', { method: 'POST', body: JSON.stringify({ key: 'system_name', value: document.getElementById('setting-system-name').value }) });
    await api('/admin/settings', { method: 'POST', body: JSON.stringify({ key: 'reminder_hours', value: parseInt(document.getElementById('setting-reminder-hours').value) }) });
    await api('/admin/settings', { method: 'POST', body: JSON.stringify({ key: 'reminder_max_count', value: parseInt(document.getElementById('setting-reminder-max').value) }) });
    showToast('設定を保存しました');
  } catch (err) { showToast(err.message, 'error'); }
}

// ============================================================
// ADMIN: AUDIT LOGS
// ============================================================
async function renderAuditLogs(main) {
  if (!hasRole('admin')) { navigate('dashboard'); return; }
  
  const page = state.pageParams?.page || '1';
  const action = state.pageParams?.action || '';
  const params = new URLSearchParams({ page });
  if (action) params.set('action', action);
  
  const data = await api(`/admin/audit-logs?${params}`);
  
  const actionLabels = {
    request_created: '申請作成', request_resubmitted: '再申請', request_withdrawn: '取下げ', request_deleted: '申請削除',
    deal_created: '案件登録', deal_updated: '案件更新', deal_deleted: '案件削除',
    payment_added: '入金追加', payment_updated: '入金更新', payment_deleted: '入金削除',
    step_approved: '承認', step_rejected: '差戻し', step_reassigned: '承認者振替',
    request_processed: '処理済み', user_invited: 'ユーザー招待', user_role_changed: 'ロール変更',
    user_deactivated: 'ユーザー無効化', user_reactivated: 'ユーザー有効化', user_deleted: 'ユーザー削除',
    user_password_reset: 'パスワードリセット', approver_added: '承認者追加', approver_updated: '承認者更新',
    approver_removed: '承認者削除', settings_changed: '設定変更',
    file_uploaded: 'ファイルアップロード', file_deleted: 'ファイル削除'
  };
  
  main.innerHTML = `
    <h1 class="text-xl font-bold text-gray-900 mb-4">操作履歴</h1>
    
    <div class="flex gap-2 mb-4">
      <select id="audit-filter-action" class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" onchange="navigate('admin-audit',{action:this.value,page:'1'})">
        <option value="">操作種別：すべて</option>
        ${Object.entries(actionLabels).map(([k, v]) => `<option value="${k}" ${action===k?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    
    ${data.logs.length === 0 ? `
      <div class="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <i class="fas fa-history text-gray-300 text-3xl mb-2"></i>
        <p class="text-gray-500 text-sm">操作履歴がありません</p>
      </div>
    ` : `
      <div class="space-y-2">
        ${data.logs.map(log => `
          <div class="bg-white border border-gray-200 rounded-lg p-4">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-gray-900">${log.user_name || 'System'}</span>
              <span class="text-xs text-gray-500">${formatDate(log.created_at)}</span>
            </div>
            <p class="text-sm text-gray-600">
              <span class="badge badge-pending text-xs mr-1">${actionLabels[log.action] || log.action}</span>
              ${log.target_table ? `<span class="text-gray-400">${log.target_table}</span>` : ''}
            </p>
            ${log.detail ? `<pre class="text-xs text-gray-400 mt-1 overflow-x-auto">${log.detail}</pre>` : ''}
          </div>
        `).join('')}
      </div>
      
      ${data.totalPages > 1 ? `
        <div class="flex items-center justify-center gap-2 mt-4">
          ${Array.from({length: data.totalPages}, (_, i) => i + 1).map(p => `
            <button onclick="navigate('admin-audit',{action:'${action}',page:'${p}'})" 
              class="px-3 py-1.5 text-sm rounded-lg ${p == data.page ? 'bg-blue-600 text-white' : 'border border-gray-300 hover:bg-gray-50'}">${p}</button>
          `).join('')}
        </div>
      ` : ''}
    `}`;
}

// ============================================================
// DEAL TRACKING - 案件管理
// ============================================================

const DEAL_STATUS_MAP = {
  estimate_approved: { label: '見積承認済', color: 'bg-blue-100 text-blue-700', icon: 'fa-file-alt' },
  contracted: { label: '契約済み', color: 'bg-indigo-100 text-indigo-700', icon: 'fa-handshake' },
  construction: { label: '工事中', color: 'bg-yellow-100 text-yellow-700', icon: 'fa-hard-hat' },
  construction_done: { label: '工事完了', color: 'bg-orange-100 text-orange-700', icon: 'fa-check-circle' },
  invoiced: { label: '請求済み', color: 'bg-purple-100 text-purple-700', icon: 'fa-file-invoice-dollar' },
  payment_received: { label: '入金済み', color: 'bg-green-100 text-green-700', icon: 'fa-coins' },
  lost: { label: '失注', color: 'bg-gray-100 text-gray-500', icon: 'fa-times-circle' }
};

function dealStatusBadge(status) {
  const s = DEAL_STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-600', icon: 'fa-question' };
  return `<span class="badge ${s.color}"><i class="fas ${s.icon} mr-1"></i>${s.label}</span>`;
}

function dealStatusOptions(current) {
  return Object.entries(DEAL_STATUS_MAP).map(([k,v]) =>
    `<option value="${k}" ${k===current?'selected':''}>${v.label}</option>`
  ).join('');
}

// ====== 案件一覧 ======
async function renderDealList(main) {
  const isAdmin = hasRole('admin');

  // 承認者向け：シンプルな案件チェック画面
  if (!isAdmin) {
    await renderDealListApprover(main);
    return;
  }

  // 管理者向け：従来の詳細一覧
  const status = state.pageParams?.status || '';
  const keyword = state.pageParams?.keyword || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (keyword) params.set('keyword', keyword);

  const data = await api(`/deals?${params}`);
  const untracked = await api('/deals/untracked/estimates');

  main.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold text-gray-900"><i class="fas fa-project-diagram text-indigo-600 mr-2"></i>案件一覧</h1>
      <button onclick="exportDealsCsv('${status}')" class="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm">
        <i class="fas fa-file-csv text-green-600 mr-1"></i>CSV出力
      </button>
    </div>

    ${untracked.estimates.length > 0 ? `
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-semibold text-blue-800"><i class="fas fa-plus-circle mr-1"></i>トラッキング未登録の承認済み見積もり（${untracked.estimates.length}件）</h2>
      </div>
      <div class="space-y-2">
        ${untracked.estimates.map(e => `
          <div class="flex items-center justify-between bg-white rounded-lg p-3 border border-blue-100">
            <div class="flex-1 min-w-0">
              <span class="text-xs font-mono text-gray-500">#${String(e.request_number).padStart(4,'0')}</span>
              <span class="font-medium text-sm ml-2">${e.title}</span>
              <span class="text-sm text-gray-500 ml-2">${e.client_name}</span>
              <span class="text-sm font-medium ml-2">${formatCurrency(e.amount_with_tax)}<span class="text-[9px] text-gray-400 ml-0.5">税込</span></span>
            </div>
            <button onclick="startTracking('${e.id}')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0">
              <i class="fas fa-play mr-1"></i>追跡開始
            </button>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- Filters -->
    <div class="flex flex-wrap gap-2 mb-4">
      <select id="deal-filter-status" class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" onchange="applyDealFilters()">
        <option value="">ステータス：すべて</option>
        ${dealStatusOptions(status)}
      </select>
      <input type="text" id="deal-filter-keyword" placeholder="キーワード検索..." value="${keyword}"
        class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48" onkeydown="if(event.key==='Enter')applyDealFilters()">
      <button onclick="applyDealFilters()" class="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"><i class="fas fa-search"></i></button>
    </div>

    ${data.deals.length === 0 ? `
      <div class="bg-white border border-gray-200 rounded-lg p-12 text-center">
        <i class="fas fa-project-diagram text-gray-300 text-3xl mb-3"></i>
        <p class="text-gray-500">案件が登録されていません</p>
      </div>
    ` : `
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-gray-500">#</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">件名</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">取引先</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">見積金額<span class="block text-[10px] text-gray-400 font-normal">税込</span></th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">契約金額<span class="block text-[10px] text-gray-400 font-normal">税抜</span></th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">粗利率<span class="block text-[10px] text-gray-400 font-normal">税抜ベース</span></th>
                <th class="px-4 py-3 text-center font-medium text-gray-500">ステータス</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">入金状況</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${data.deals.map(d => {
                // 粗利率は全て税抜ベースで統一
                const revenueExcl = d.contract_amount_excl_tax || d.amount || 0;
                const cost = d.cost_amount || 0;
                const profitRate = (cost && revenueExcl) ? Math.round((revenueExcl - cost) / revenueExcl * 100) : null;
                const pm = data.paymentsMap?.[d.id] || { received: 0, expected: 0 };
                const payPct = pm.expected > 0 ? Math.round(pm.received / pm.expected * 100) : null;
                return `
                <tr class="hover:bg-gray-50 cursor-pointer" onclick="navigate('admin-deal-detail',{id:'${d.id}'})">
                  <td class="px-4 py-3 font-mono text-gray-500">${String(d.request_number).padStart(4,'0')}</td>
                  <td class="px-4 py-3 font-medium max-w-[200px] truncate">${d.title}</td>
                  <td class="px-4 py-3 text-gray-600 max-w-[150px] truncate">${d.client_name}</td>
                  <td class="px-4 py-3 text-right">${formatCurrency(d.amount_with_tax)}</td>
                  <td class="px-4 py-3 text-right">${d.contract_amount_excl_tax ? `<span class="font-medium">${formatCurrency(d.contract_amount_excl_tax)}</span>` : (d.contract_amount ? `<span class="font-medium">${formatCurrency(d.contract_amount)}<sup class="text-[9px] text-gray-400 ml-0.5">税込</sup></span>` : '-')}</td>
                  <td class="px-4 py-3 text-right">${profitRate !== null ? `<span class="${profitRate >= 20 ? 'text-emerald-600' : profitRate >= 10 ? 'text-yellow-600' : 'text-red-600'} font-medium">${profitRate}%</span>` : (d.gross_profit_rate != null ? `<span class="text-emerald-500" title="申請時の想定粗利率">${d.gross_profit_rate}%<sup class="text-[9px] text-gray-400 ml-0.5">申請</sup></span>` : '<span class="text-gray-300">-</span>')}</td>
                  <td class="px-4 py-3 text-center">${dealStatusBadge(d.deal_status)}</td>
                  <td class="px-4 py-3 text-right text-xs">${payPct !== null ? `<div class="flex items-center gap-1 justify-end"><div class="w-12 bg-gray-200 rounded-full h-2"><div class="bg-green-500 rounded-full h-2" style="width:${payPct}%"></div></div><span class="text-gray-600">${payPct}%</span></div>` : '<span class="text-gray-300">-</span>'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `}`;
}

// ====== 承認者向け：シンプル案件チェック画面 ======
async function renderDealListApprover(main) {
  const data = await api('/deals');
  const untracked = await api('/deals/untracked/estimates');
  const deals = data.deals || [];
  const untrackedEstimates = untracked.estimates || [];

  // 工事決定待ち = deal_trackingでestimate_approved + 未トラッキング承認済み見積もり
  const pendingTracked = deals.filter(d => d.deal_status === 'estimate_approved');
  const otherDeals = deals.filter(d => d.deal_status !== 'estimate_approved');

  // 統合リスト: トラッキング済み（type:'tracked'）と未トラッキング（type:'untracked'）
  const pendingAll = [
    ...pendingTracked.map(d => ({ ...d, _type: 'tracked' })),
    ...untrackedEstimates.map(e => ({ ...e, _type: 'untracked' }))
  ];

  main.innerHTML = `
    <div class="mb-6">
      <h1 class="text-xl font-bold text-gray-900"><i class="fas fa-clipboard-check text-indigo-600 mr-2"></i>案件チェック</h1>
      <p class="text-sm text-gray-500 mt-1">工事が決まった案件を確定してください</p>
    </div>

    <!-- 工事決定待ち -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-3">
        <h2 class="text-base font-bold text-orange-700"><i class="fas fa-exclamation-circle mr-1"></i>工事決定待ち</h2>
        ${pendingAll.length > 0 ? `<span class="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">${pendingAll.length}</span>` : ''}
      </div>
      ${pendingAll.length === 0 ? `
        <div class="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <i class="fas fa-check-circle text-green-400 text-2xl mb-2"></i>
          <p class="text-green-700 text-sm font-medium">工事決定待ちの案件はありません</p>
        </div>
      ` : `
        <div class="space-y-3">
          ${pendingAll.map(d => {
            const isUntracked = d._type === 'untracked';
            const confirmAction = isUntracked
              ? `confirmFromEstimate('${d.id}')`
              : `confirmContract('${d.id}')`;
            const dismissAction = isUntracked
              ? `dismissFromEstimate('${d.id}')`
              : `dismissDeal('${d.id}')`;
            const detailAction = isUntracked
              ? ''
              : `<button onclick="navigate('admin-deal-detail',{id:'${d.id}'})" class="px-3 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-center">詳細を見る</button>`;
            return `
            <div class="bg-white border-2 border-orange-200 rounded-lg p-4 hover:border-orange-300 transition-colors">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-mono text-gray-400">#${String(d.request_number).padStart(4,'0')}</span>
                    <span class="badge bg-blue-100 text-blue-700"><i class="fas fa-file-alt mr-1"></i>見積承認済</span>
                  </div>
                  <h3 class="font-bold text-gray-900 text-base mb-1 truncate">${d.title}</h3>
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                    <span><i class="fas fa-building text-gray-400 mr-1"></i>${d.client_name}</span>
                    <span><i class="fas fa-yen-sign text-gray-400 mr-1"></i>${formatCurrency(d.amount_with_tax)}<span class="text-[10px] text-gray-400 ml-0.5">税込</span></span>
                    <span><i class="fas fa-user text-gray-400 mr-1"></i>${d.applicant_name}</span>
                    ${d.gross_profit_rate != null ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs font-medium"><i class="fas fa-percentage mr-0.5 text-[10px]"></i>粗利 ${d.gross_profit_rate}%</span>` : ''}
                  </div>
                </div>
                <div class="flex flex-col gap-2 flex-shrink-0">
                  <button onclick="event.stopPropagation();${confirmAction}" 
                    class="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm shadow-sm whitespace-nowrap">
                    <i class="fas fa-check-circle mr-1"></i>工事決定
                  </button>
                  <button onclick="event.stopPropagation();${dismissAction}" 
                    class="px-5 py-2.5 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 hover:text-red-600 hover:border-red-300 text-sm whitespace-nowrap transition-colors">
                    <i class="fas fa-times-circle mr-1"></i>見送り
                  </button>
                  ${detailAction}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    </div>

    <!-- 処理済み案件 -->
    ${otherDeals.length > 0 ? `
    <div>
      <h2 class="text-base font-bold text-gray-600 mb-3"><i class="fas fa-list mr-1"></i>処理済み・進行中の案件（${otherDeals.length}件）</h2>
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-2 text-left font-medium text-gray-500 text-xs">#</th>
              <th class="px-4 py-2 text-left font-medium text-gray-500 text-xs">件名</th>
              <th class="px-4 py-2 text-left font-medium text-gray-500 text-xs">取引先</th>
              <th class="px-4 py-2 text-right font-medium text-gray-500 text-xs">見積金額（税込）</th>
              <th class="px-4 py-2 text-center font-medium text-gray-500 text-xs">ステータス</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${otherDeals.map(d => `
              <tr class="hover:bg-gray-50 cursor-pointer" onclick="navigate('admin-deal-detail',{id:'${d.id}'})">
                <td class="px-4 py-2.5 font-mono text-gray-400 text-xs">${String(d.request_number).padStart(4,'0')}</td>
                <td class="px-4 py-2.5 font-medium max-w-[200px] truncate">${d.title}</td>
                <td class="px-4 py-2.5 text-gray-600 max-w-[150px] truncate">${d.client_name}</td>
                <td class="px-4 py-2.5 text-right">${formatCurrency(d.amount_with_tax)}</td>
                <td class="px-4 py-2.5 text-center">${dealStatusBadge(d.deal_status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}`
  ;
}

function applyDealFilters() {
  navigate('admin-deals', {
    status: document.getElementById('deal-filter-status').value,
    keyword: document.getElementById('deal-filter-keyword').value
  });
}

async function startTracking(requestId) {
  try {
    await api('/deals/create', { method: 'POST', body: JSON.stringify({ requestId }) });
    showToast('案件トラッキングを開始しました');
    renderPageContent();
  } catch (err) { showToast(err.message, 'error'); }
}

// ====== 案件詳細・編集 ======

function renderPaymentCard(p, dealId) {
  const typeLabels = { advance: '着手金', interim: '中間金', final: '完了金', other: 'その他' };
  const typeColors = { advance: 'bg-blue-100 text-blue-700', interim: 'bg-yellow-100 text-yellow-700', final: 'bg-green-100 text-green-700', other: 'bg-gray-100 text-gray-600' };
  const isPaid = !!p.actual_date;
  const borderClass = isPaid ? 'border-green-200 bg-green-50/50' : 'border-gray-200';
  const paidBadge = isPaid ? '<span class="text-xs text-green-600 font-medium"><i class="fas fa-check-circle mr-0.5"></i>入金済</span>' : '';
  const amtClass = isPaid ? 'text-green-700' : '';
  const invoiceLine = p.invoice_date ? '<div class="text-xs text-gray-400 mt-1">請求日: ' + p.invoice_date + '</div>' : '';
  const notesLine = p.notes ? '<div class="text-xs text-gray-500 mt-1 italic">' + p.notes + '</div>' : '';

  return '<div class="border ' + borderClass + ' rounded-lg p-4">'
    + '<div class="flex items-center justify-between mb-2">'
    + '<div class="flex items-center gap-2">'
    + '<span class="badge ' + (typeColors[p.payment_type] || 'bg-gray-100 text-gray-600') + ' text-xs">' + (typeLabels[p.payment_type] || p.payment_type) + '</span>'
    + '<span class="font-medium text-sm">' + p.label + '</span>'
    + paidBadge
    + '</div>'
    + '<div class="flex items-center gap-1">'
    + '<button type="button" onclick="showEditPaymentModal(\'' + dealId + '\', \'' + p.id + '\')" class="px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="編集"><i class="fas fa-pen"></i></button>'
    + '<button type="button" onclick="deletePayment(\'' + dealId + '\', \'' + p.id + '\', \'' + p.label + '\')" class="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="削除"><i class="fas fa-trash"></i></button>'
    + '</div></div>'
    + '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">'
    + '<div><span class="text-gray-400">請求予定額</span><p class="font-medium">' + (p.expected_amount ? formatCurrency(p.expected_amount) : '-') + '</p></div>'
    + '<div><span class="text-gray-400">入金予定日</span><p class="font-medium">' + (p.expected_date || '-') + '</p></div>'
    + '<div><span class="text-gray-400">入金額</span><p class="font-medium ' + amtClass + '">' + (p.actual_amount ? formatCurrency(p.actual_amount) : '-') + '</p></div>'
    + '<div><span class="text-gray-400">入金日</span><p class="font-medium ' + amtClass + '">' + (p.actual_date || '-') + '</p></div>'
    + '</div>'
    + invoiceLine + notesLine
    + '</div>';
}

function renderPaymentsSection(payments, dealId) {
  if (!payments || payments.length === 0) {
    return '<div class="text-center py-8 text-gray-400">'
      + '<i class="fas fa-coins text-3xl mb-2"></i>'
      + '<p class="text-sm">入金情報が登録されていません</p>'
      + '<p class="text-xs mt-1">「入金追加」ボタンで着手金・中間金・完了金を登録してください</p>'
      + '</div>';
  }

  const totalExpected = payments.reduce((s,p) => s + (p.expected_amount || 0), 0);
  const totalReceived = payments.reduce((s,p) => s + (p.actual_amount || 0), 0);
  const remaining = totalExpected - totalReceived;
  const pct = totalExpected > 0 ? Math.round(totalReceived / totalExpected * 100) : 0;

  return '<div class="space-y-3" id="payments-list">'
    + payments.map(p => renderPaymentCard(p, dealId)).join('')
    + '</div>'
    + '<div class="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-100">'
    + '<div class="flex items-center justify-between text-sm flex-wrap gap-2">'
    + '<span class="text-purple-700 font-medium">入金サマリー</span>'
    + '<div class="flex gap-4 text-xs flex-wrap">'
    + '<span class="text-gray-500">請求予定計: <strong>' + formatCurrency(totalExpected) + '</strong></span>'
    + '<span class="text-green-700">入金済計: <strong>' + formatCurrency(totalReceived) + '</strong></span>'
    + '<span class="text-orange-600">残額: <strong>' + formatCurrency(remaining) + '</strong></span>'
    + '</div></div>'
    + '<div class="mt-2 bg-gray-200 rounded-full h-3 overflow-hidden">'
    + '<div class="bg-green-500 h-3 transition-all" style="width:' + pct + '%"></div>'
    + '</div></div>';
}

function renderProfitBar(revenueExcl, cost) {
  if (!cost || !revenueExcl) return '';
  const profitPct = Math.max(0, Math.min(100, Math.round((revenueExcl - cost) / revenueExcl * 100)));
  const costPct = 100 - profitPct;
  return '<div class="text-xs text-gray-500 mb-1">税抜契約額 ' + formatCurrency(revenueExcl) + ' の内訳</div>'
    + '<div class="flex rounded-full h-6 overflow-hidden bg-gray-200">'
    + '<div class="bg-rose-400 flex items-center justify-center text-white text-xs font-medium" style="width:' + costPct + '%">原価 ' + costPct + '%</div>'
    + '<div class="bg-emerald-500 flex items-center justify-center text-white text-xs font-medium" style="width:' + profitPct + '%">粗利 ' + profitPct + '%</div>'
    + '</div>';
}

async function renderDealDetail(main) {
  const id = state.pageParams?.id;
  if (!id) { navigate('admin-deals'); return; }

  const data = await api(`/deals/${id}`);
  const d = data.deal;
  const dealPartners = data.partners || [];
  const isAdmin = hasRole('admin');

  // 承認者向け: シンプルな閲覧ビュー + 工事決定ボタンのみ
  if (!isAdmin) {
    renderDealDetailReadonly(main, d, data.payments);
    return;
  }

  // 税率（見積もりの税率をデフォルトに使用）
  const taxRate = d.contract_tax_rate || d.tax_rate || 0.10;
  const taxRatePct = Math.round(taxRate * 100);
  // 税抜契約額（入力値 or 見積もり税抜額をフォールバック）
  const contractExcl = d.contract_amount_excl_tax || d.amount || 0;
  // 税込契約額
  const contractIncl = d.contract_amount || d.amount_with_tax || 0;
  // 原価（税抜）
  const costAmount = d.cost_amount || 0;
  // 粗利 = 税抜契約額 - 原価（全て税抜同士の比較）
  const profitAmount = contractExcl - costAmount;
  const profitDisplay = costAmount ? formatCurrency(profitAmount) : '-';
  const profitRateDisplay = d.profit_rate != null ? (Math.round(d.profit_rate * 100 * 100) / 100).toString() : '';

  main.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <button onclick="navigate('admin-deals')" class="text-gray-500 hover:text-gray-700"><i class="fas fa-arrow-left"></i></button>
      <h1 class="text-xl font-bold text-gray-900">案件詳細 #${String(d.request_number).padStart(4,'0')}</h1>
      ${dealStatusBadge(d.deal_status)}
    </div>

    <!-- 元の見積もり情報 -->
    <div class="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <h2 class="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">見積もり情報</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-y-3 gap-x-6 text-sm">
        <div><span class="text-gray-500">件名</span><p class="font-medium">${d.title}</p></div>
        <div><span class="text-gray-500">取引先</span><p class="font-medium">${d.client_name}</p></div>
        <div><span class="text-gray-500">申請者</span><p class="font-medium">${d.applicant_name}</p></div>
        ${d.prime_contractor_name ? `<div><span class="text-gray-500">元請け会社</span><p class="font-medium"><i class="fas fa-building text-indigo-400 mr-1"></i>${d.prime_contractor_name}</p></div>` : ''}
        <div>
          <span class="text-gray-500">見積金額（税抜）</span>
          <p class="font-medium text-lg">${formatCurrency(d.amount)}</p>
        </div>
        <div>
          <span class="text-gray-500">税率 / 消費税</span>
          <p class="font-medium">${Math.round(d.tax_rate * 100)}% / ${formatCurrency(d.amount_with_tax - d.amount)}</p>
        </div>
        <div>
          <span class="text-gray-500">見積金額（税込）</span>
          <p class="font-medium text-gray-500">${formatCurrency(d.amount_with_tax)}</p>
        </div>
        <div><span class="text-gray-500">見積日</span><p class="font-medium">${formatDate(d.request_date)}</p></div>
        ${d.gross_profit_rate != null ? `<div><span class="text-gray-500">申請時粗利率</span><p class="font-medium"><span class="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-emerald-100 text-emerald-800"><i class="fas fa-percentage mr-1 text-xs"></i>${d.gross_profit_rate}%</span></p></div>` : ''}
        ${d.remarks ? `<div class="sm:col-span-2"><span class="text-gray-500">備考</span><p class="font-medium">${d.remarks}</p></div>` : ''}
      </div>
    </div>

    <!-- 案件進捗管理フォーム -->
    <form id="deal-form" data-fallback-excl="${d.amount || 0}" data-fallback-rate="${d.tax_rate || 0.10}" class="space-y-4">
      <div class="bg-white border border-gray-200 rounded-lg p-5">
        <h2 class="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">案件進捗</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
            <select id="deal-status" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              ${dealStatusOptions(d.deal_status)}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">メモ</label>
            <input type="text" id="deal-notes" value="${d.notes || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="メモ">
          </div>
        </div>
      </div>

      <!-- 契約情報：税抜・税込をセットで表示 -->
      <div class="bg-white border border-gray-200 rounded-lg p-5">
        <h2 class="text-sm font-semibold text-indigo-600 mb-4"><i class="fas fa-handshake mr-1"></i>契約情報</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">契約日</label>
            <input type="date" id="deal-contract-date" value="${d.contract_date || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">税率</label>
            <select id="deal-contract-tax-rate" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" onchange="recalcContractTax()">
              <option value="0.10" ${taxRate === 0.10 ? 'selected' : ''}>10%</option>
              <option value="0.08" ${taxRate === 0.08 ? 'selected' : ''}>8%（軽減）</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-indigo-700 mb-1">契約金額（税抜）</label>
            <input type="number" id="deal-contract-excl" value="${d.contract_amount_excl_tax || ''}" class="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm font-medium bg-indigo-50" placeholder="0" oninput="recalcContractTax()">
            <p class="text-xs text-gray-400 mt-0.5">← 粗利計算の基準</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500 mb-1">契約金額（税込）</label>
            <div id="deal-contract-incl-display" class="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              ${contractExcl ? formatCurrency(Math.round(contractExcl * (1 + taxRate))) : '-'}
            </div>
            <input type="hidden" id="deal-contract-amount" value="${d.contract_amount || ''}">
          </div>
        </div>
      </div>

      <!-- 原価・粗利（全て税抜ベース） -->
      <div class="bg-white border border-gray-200 rounded-lg p-5">
        <h2 class="text-sm font-semibold text-emerald-600 mb-4"><i class="fas fa-calculator mr-1"></i>原価・粗利 <span class="text-xs font-normal text-gray-400 ml-1">※全て税抜ベース</span></h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">原価（税抜）</label>
            <input type="number" id="deal-cost-amount" value="${d.cost_amount || ''}" 
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0"
              oninput="calcProfit()">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">粗利率（%）</label>
            <input type="number" id="deal-profit-rate" value="${profitRateDisplay}" 
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="例: 30" step="0.01"
              oninput="calcProfitFromRate()">
            <p class="text-xs text-gray-400 mt-0.5">粗利率 = (税抜契約額 - 原価) / 税抜契約額</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">粗利額（税抜）</label>
            <div id="deal-profit-display" class="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-emerald-700">
              ${profitDisplay}
            </div>
          </div>
        </div>
        <div id="profit-summary-bar" class="mt-3">${renderProfitBar(contractExcl, costAmount)}</div>
      </div>

      <div class="bg-white border border-gray-200 rounded-lg p-5">
        <h2 class="text-sm font-semibold text-yellow-600 mb-4"><i class="fas fa-hard-hat mr-1"></i>工事情報</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">工事開始日</label>
            <input type="date" id="deal-construction-start" value="${d.construction_start || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">工事完了日</label>
            <input type="date" id="deal-construction-end" value="${d.construction_end || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          </div>
        </div>
      </div>

      <!-- 協力会社（下請け・元請け） -->
      <div class="bg-white border border-gray-200 rounded-lg p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-orange-600"><i class="fas fa-handshake mr-1"></i>協力会社 <span class="text-xs font-normal text-gray-400 ml-1">下請け・元請け</span></h2>
          <button type="button" onclick="showAddDealPartnerModal('${d.id}')" class="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700">
            <i class="fas fa-plus mr-1"></i>協力会社を追加
          </button>
        </div>
        ${renderDealPartnersSection(dealPartners, d.id)}
      </div>

      <!-- 分割入金管理 -->
      <div class="bg-white border border-gray-200 rounded-lg p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-purple-600"><i class="fas fa-coins mr-1"></i>分割入金管理 <span class="text-xs font-normal text-gray-400 ml-1">※税込金額で入力</span></h2>
          <button type="button" onclick="showAddPaymentModal('${d.id}')" class="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700">
            <i class="fas fa-plus mr-1"></i>入金追加
          </button>
        </div>
        ${renderPaymentsSection(data.payments, d.id)}
      </div>

      <div class="flex gap-3">
        <button type="submit" class="px-6 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          <i class="fas fa-save mr-1"></i>保存
        </button>
        <button type="button" onclick="navigate('admin-deals')" class="px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          キャンセル
        </button>
        <button type="button" onclick="deleteDeal('${d.id}')" class="px-4 py-2.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 ml-auto">
          <i class="fas fa-trash mr-1"></i>削除
        </button>
      </div>
    </form>`;

  // 税込自動計算
  window.recalcContractTax = function() {
    var excl = parseFloat(document.getElementById('deal-contract-excl').value) || 0;
    var rate = parseFloat(document.getElementById('deal-contract-tax-rate').value) || 0.10;
    var incl = Math.round(excl * (1 + rate));
    document.getElementById('deal-contract-incl-display').textContent = excl ? formatCurrency(incl) : '-';
    document.getElementById('deal-contract-amount').value = excl ? incl : '';
    // 粗利も再計算
    calcProfit();
  };

  // 原価→粗利 自動計算（税抜ベース）
  window.calcProfit = function() {
    var fallbackExcl = parseFloat(document.getElementById('deal-form').dataset.fallbackExcl) || 0;
    var revenueExcl = parseFloat(document.getElementById('deal-contract-excl').value) || fallbackExcl;
    var cost = parseFloat(document.getElementById('deal-cost-amount').value) || 0;
    var profit = revenueExcl - cost;
    var rate = revenueExcl > 0 ? (profit / revenueExcl * 100) : 0;
    document.getElementById('deal-profit-display').textContent = cost ? formatCurrency(profit) : '-';
    document.getElementById('deal-profit-rate').value = cost ? rate.toFixed(2) : '';
    updateProfitBar(revenueExcl, cost);
  };

  // 粗利率→原価 自動計算（税抜ベース）
  window.calcProfitFromRate = function() {
    var fallbackExcl = parseFloat(document.getElementById('deal-form').dataset.fallbackExcl) || 0;
    var revenueExcl = parseFloat(document.getElementById('deal-contract-excl').value) || fallbackExcl;
    var rateStr = document.getElementById('deal-profit-rate').value;
    if (!rateStr) { document.getElementById('deal-profit-display').textContent = '-'; return; }
    var rate = parseFloat(rateStr);
    var cost = revenueExcl * (1 - rate / 100);
    var profit = revenueExcl - cost;
    document.getElementById('deal-cost-amount').value = Math.round(cost);
    document.getElementById('deal-profit-display').textContent = formatCurrency(Math.round(profit));
    updateProfitBar(revenueExcl, cost);
  };

  function updateProfitBar(revenueExcl, cost) {
    document.getElementById('profit-summary-bar').innerHTML = renderProfitBar(revenueExcl, cost);
  }

  document.getElementById('deal-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const costVal = document.getElementById('deal-cost-amount').value;
      const rateVal = document.getElementById('deal-profit-rate').value;
      const exclVal = document.getElementById('deal-contract-excl').value;
      const taxRateVal = document.getElementById('deal-contract-tax-rate').value;
      await api(`/deals/${id}/update`, { method: 'POST', body: JSON.stringify({
        deal_status: document.getElementById('deal-status').value,
        contract_date: document.getElementById('deal-contract-date').value || null,
        contract_amount_excl_tax: exclVal ? parseFloat(exclVal) : null,
        contract_tax_rate: taxRateVal ? parseFloat(taxRateVal) : null,
        contract_amount: document.getElementById('deal-contract-amount').value ? parseFloat(document.getElementById('deal-contract-amount').value) : null,
        construction_start: document.getElementById('deal-construction-start').value || null,
        construction_end: document.getElementById('deal-construction-end').value || null,
        cost_amount: costVal !== '' ? parseFloat(costVal) : null,
        profit_rate: rateVal !== '' ? parseFloat(rateVal) / 100 : null,
        notes: document.getElementById('deal-notes').value || null
      })});
      showToast('案件情報を更新しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

// ====== 協力会社セクション ======
const PARTNER_ROLE_MAP = {
  prime_contractor: { label: '元請け', color: 'bg-indigo-100 text-indigo-800', icon: 'fa-building' },
  subcontractor: { label: '下請け', color: 'bg-orange-100 text-orange-800', icon: 'fa-hard-hat' }
};

function renderDealPartnersSection(partners, dealId) {
  if (!partners || partners.length === 0) {
    return '<div class="text-center py-4 text-gray-400"><i class="fas fa-handshake text-2xl mb-2"></i><p class="text-sm">協力会社はまだ登録されていません</p></div>';
  }

  const totalSubCost = partners.filter(p => p.role === 'subcontractor').reduce((s, p) => s + (p.contract_amount || 0), 0);

  let html = '<div class="space-y-2">';
  partners.forEach(p => {
    const r = PARTNER_ROLE_MAP[p.role] || PARTNER_ROLE_MAP.subcontractor;
    html += `
      <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
        <div class="flex-shrink-0">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.color}">
            <i class="fas ${r.icon} mr-1"></i>${r.label}
          </span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900">${p.company_name}</p>
          <p class="text-xs text-gray-500">${p.trade_type || ''} ${p.representative_name ? '・' + p.representative_name : ''}</p>
        </div>
        <div class="text-right flex-shrink-0">
          ${p.contract_amount ? `<p class="text-sm font-bold text-gray-900">${formatCurrency(p.contract_amount)}</p><p class="text-[10px] text-gray-400">税抜</p>` : '<p class="text-xs text-gray-400">金額未設定</p>'}
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button type="button" onclick="showEditDealPartnerModal('${dealId}','${p.id}','${p.partner_id}','${p.role}',${p.contract_amount || 'null'},'${(p.notes || '').replace(/'/g, "\\'")}')" class="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded" title="編集"><i class="fas fa-edit text-xs"></i></button>
          <button type="button" onclick="deleteDealPartner('${p.id}','${p.company_name}')" class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded" title="削除"><i class="fas fa-trash text-xs"></i></button>
        </div>
      </div>`;
  });
  html += '</div>';
  if (totalSubCost > 0) {
    html += `<div class="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg flex justify-between items-center">
      <span class="text-sm text-orange-700 font-medium"><i class="fas fa-calculator mr-1"></i>下請け原価合計（税抜）</span>
      <span class="text-lg font-bold text-orange-800">${formatCurrency(totalSubCost)}</span>
    </div>`;
  }
  return html;
}

async function showAddDealPartnerModal(dealId) {
  // 協力会社マスタ一覧を取得
  let partners = [];
  try { const pd = await api('/partners'); partners = pd.partners || []; } catch {}
  
  if (partners.length === 0) {
    showToast('先に「協力会社管理」で協力会社を登録してください', 'error');
    return;
  }

  const content = `
    <div class="space-y-3">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">協力会社 <span class="text-red-500">*</span></label>
        <select id="dp-partner" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          ${partners.map(p => '<option value="' + p.id + '">' + p.company_name + (p.trade_type ? ' (' + p.trade_type + ')' : '') + '</option>').join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">役割 <span class="text-red-500">*</span></label>
        <select id="dp-role" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="subcontractor">下請け（STCが元請けの場合）</option>
          <option value="prime_contractor">元請け（STCが下請けの場合）</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">契約金額（税抜） <span class="text-xs text-gray-400 font-normal">任意</span></label>
        <div class="relative">
          <span class="absolute left-3 top-2 text-gray-500 text-sm">\u00a5</span>
          <input type="number" id="dp-amount" class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0">
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">備考</label>
        <input type="text" id="dp-notes" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="備考">
      </div>
    </div>`;

  showModal('協力会社を追加', content,
    '<button onclick="submitAddDealPartner(\'' + dealId + '\')" class="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"><i class="fas fa-plus mr-1"></i>追加</button>'
    + '<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>'
  );
}

async function submitAddDealPartner(dealId) {
  try {
    await api('/partners/deal/' + dealId + '/add', { method: 'POST', body: JSON.stringify({
      partner_id: document.getElementById('dp-partner').value,
      role: document.getElementById('dp-role').value,
      contract_amount: parseFloat(document.getElementById('dp-amount').value) || null,
      notes: document.getElementById('dp-notes').value || null
    })});
    closeModal();
    showToast('協力会社を追加しました');
    renderPageContent();
  } catch (err) { showToast(err.message, 'error'); }
}

async function showEditDealPartnerModal(dealId, dpId, partnerId, role, amount, notes) {
  // 協力会社マスタ一覧を取得
  let partners = [];
  try { const pd = await api('/partners'); partners = pd.partners || []; } catch {}

  const content = `
    <div class="space-y-3">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">協力会社</label>
        <select id="edp-partner" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50" disabled>
          ${partners.map(p => '<option value="' + p.id + '"' + (p.id === partnerId ? ' selected' : '') + '>' + p.company_name + (p.trade_type ? ' (' + p.trade_type + ')' : '') + '</option>').join('')}
        </select>
        <p class="text-[10px] text-gray-400 mt-0.5">変更する場合は削除して再追加してください</p>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">役割</label>
        <select id="edp-role" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="subcontractor" ${role === 'subcontractor' ? 'selected' : ''}>下請け</option>
          <option value="prime_contractor" ${role === 'prime_contractor' ? 'selected' : ''}>元請け</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">契約金額（税抜）</label>
        <div class="relative">
          <span class="absolute left-3 top-2 text-gray-500 text-sm">\u00a5</span>
          <input type="number" id="edp-amount" value="${amount !== null && amount !== 'null' ? amount : ''}" class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0">
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">備考</label>
        <input type="text" id="edp-notes" value="${notes || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="備考">
      </div>
    </div>`;

  showModal('協力会社情報を編集', content,
    '<button onclick="submitEditDealPartner(\'' + dpId + '\')" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"><i class="fas fa-save mr-1"></i>更新</button>'
    + '<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>'
  );
}

async function submitEditDealPartner(dpId) {
  try {
    await api('/partners/deal-partner/' + dpId + '/update', { method: 'POST', body: JSON.stringify({
      role: document.getElementById('edp-role').value,
      contract_amount: parseFloat(document.getElementById('edp-amount').value) || null,
      notes: document.getElementById('edp-notes').value || null
    })});
    closeModal();
    showToast('協力会社情報を更新しました');
    renderPageContent();
  } catch (err) { showToast(err.message, 'error'); }
}

function deleteDealPartner(dpId, companyName) {
  showConfirm('「' + companyName + '」をこの案件から削除しますか？', async () => {
    try {
      await api('/partners/deal-partner/' + dpId + '/delete', { method: 'POST' });
      showToast('協力会社を削除しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ====== 分割入金 モーダル・操作 ======
function paymentFormHtml(prefix, p) {
  // p is null for add, or existing payment for edit
  const typeOpts = [
    { value: 'advance', label: '着手金' },
    { value: 'interim', label: '中間金' },
    { value: 'final', label: '完了金（残金）' },
    { value: 'other', label: 'その他' }
  ];
  var selOpts = typeOpts.map(function(o) {
    var sel = (p && o.value === p.payment_type) ? ' selected' : '';
    return '<option value="' + o.value + '"' + sel + '>' + o.label + '</option>';
  }).join('');

  return '<div class="space-y-3">'
    + '<div class="grid grid-cols-2 gap-3">'
    + '<div><label class="block text-xs font-medium text-gray-600 mb-1">入金種別' + (p ? '' : ' <span class="text-red-500">*</span>') + '</label>'
    + '<select id="' + prefix + '-type" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">' + selOpts + '</select></div>'
    + '<div><label class="block text-xs font-medium text-gray-600 mb-1">ラベル' + (p ? '' : ' <span class="text-red-500">*</span>') + '</label>'
    + '<input type="text" id="' + prefix + '-label" value="' + (p ? p.label : '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="例: 着手金 30%"></div>'
    + '</div>'
    + '<div class="grid grid-cols-2 gap-3">'
    + '<div><label class="block text-xs font-medium text-gray-600 mb-1">請求予定額</label>'
    + '<input type="number" id="' + prefix + '-expected-amount" value="' + (p && p.expected_amount ? p.expected_amount : '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0"></div>'
    + '<div><label class="block text-xs font-medium text-gray-600 mb-1">入金予定日</label>'
    + '<input type="date" id="' + prefix + '-expected-date" value="' + (p && p.expected_date ? p.expected_date : '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div>'
    + '</div>'
    + '<div class="grid grid-cols-2 gap-3">'
    + '<div><label class="block text-xs font-medium text-gray-600 mb-1">請求日</label>'
    + '<input type="date" id="' + prefix + '-invoice-date" value="' + (p && p.invoice_date ? p.invoice_date : '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div>'
    + '<div></div>'
    + '</div>'
    + '<div class="grid grid-cols-2 gap-3">'
    + '<div><label class="block text-xs font-medium text-gray-600 mb-1">実入金額</label>'
    + '<input type="number" id="' + prefix + '-actual-amount" value="' + (p && p.actual_amount ? p.actual_amount : '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0"></div>'
    + '<div><label class="block text-xs font-medium text-gray-600 mb-1">実入金日</label>'
    + '<input type="date" id="' + prefix + '-actual-date" value="' + (p && p.actual_date ? p.actual_date : '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></div>'
    + '</div>'
    + '<div><label class="block text-xs font-medium text-gray-600 mb-1">備考</label>'
    + '<input type="text" id="' + prefix + '-notes" value="' + (p && p.notes ? p.notes : '') + '" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="備考"></div>'
    + '</div>';
}

function showAddPaymentModal(dealId) {
  showModal('入金情報を追加',
    paymentFormHtml('pay', null),
    '<button onclick="submitAddPayment(\'' + dealId + '\')" class="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"><i class="fas fa-plus mr-1"></i>追加</button>'
    + '<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>'
  );

  // 入金種別変更時にラベル自動セット
  document.getElementById('pay-type').onchange = function() {
    var labels = { advance: '着手金', interim: '中間金', final: '完了金', other: '' };
    var labelEl = document.getElementById('pay-label');
    if (!labelEl.value || Object.values(labels).includes(labelEl.value)) {
      labelEl.value = labels[this.value] || '';
    }
  };
  document.getElementById('pay-type').dispatchEvent(new Event('change'));
}

async function submitAddPayment(dealId) {
  var label = document.getElementById('pay-label').value;
  var type = document.getElementById('pay-type').value;
  if (!label) { showToast('ラベルは必須です', 'error'); return; }
  try {
    await api('/deals/' + dealId + '/payments', { method: 'POST', body: JSON.stringify({
      payment_type: type,
      label: label,
      expected_amount: parseFloat(document.getElementById('pay-expected-amount').value) || null,
      expected_date: document.getElementById('pay-expected-date').value || null,
      actual_amount: parseFloat(document.getElementById('pay-actual-amount').value) || null,
      actual_date: document.getElementById('pay-actual-date').value || null,
      invoice_date: document.getElementById('pay-invoice-date').value || null,
      notes: document.getElementById('pay-notes').value || null
    })});
    closeModal();
    showToast('入金情報を追加しました');
    renderPageContent();
  } catch (err) { showToast(err.message, 'error'); }
}

async function showEditPaymentModal(dealId, paymentId) {
  var data = await api('/deals/' + dealId);
  var p = data.payments.find(function(x) { return x.id === paymentId; });
  if (!p) { showToast('入金情報が見つかりません', 'error'); return; }

  showModal('入金情報を編集',
    paymentFormHtml('epay', p),
    '<button onclick="submitEditPayment(\'' + dealId + '\', \'' + paymentId + '\')" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"><i class="fas fa-save mr-1"></i>更新</button>'
    + '<button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>'
  );
}

async function submitEditPayment(dealId, paymentId) {
  try {
    await api('/deals/' + dealId + '/payments/' + paymentId + '/update', { method: 'POST', body: JSON.stringify({
      payment_type: document.getElementById('epay-type').value,
      label: document.getElementById('epay-label').value,
      expected_amount: parseFloat(document.getElementById('epay-expected-amount').value) || null,
      expected_date: document.getElementById('epay-expected-date').value || null,
      actual_amount: parseFloat(document.getElementById('epay-actual-amount').value) || null,
      actual_date: document.getElementById('epay-actual-date').value || null,
      invoice_date: document.getElementById('epay-invoice-date').value || null,
      notes: document.getElementById('epay-notes').value || null
    })});
    closeModal();
    showToast('入金情報を更新しました');
    renderPageContent();
  } catch (err) { showToast(err.message, 'error'); }
}

function deletePayment(dealId, paymentId, label) {
  showConfirm('入金「' + label + '」を削除しますか？', async function() {
    try {
      await api('/deals/' + dealId + '/payments/' + paymentId + '/delete', { method: 'POST' });
      showToast('入金情報を削除しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function deleteDeal(dealId) {
  showConfirm('この案件トラッキングを削除しますか？（元の見積もり申請は残ります）', async () => {
    try {
      await api(`/deals/${dealId}/delete`, { method: 'POST' });
      showToast('案件トラッキングを削除しました');
      navigate('admin-deals');
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ====== 承認者向け: 案件詳細（読み取り専用・シンプル） ======
function renderDealDetailReadonly(main, d, payments) {
  const isWaitingDecision = d.deal_status === 'estimate_approved';

  main.innerHTML = '<div class="flex items-center gap-3 mb-4">'
    + '<button onclick="navigate(\'admin-deals\')" class="text-gray-500 hover:text-gray-700"><i class="fas fa-arrow-left"></i></button>'
    + '<h1 class="text-xl font-bold text-gray-900">#' + String(d.request_number).padStart(4,'0') + ' ' + d.title + '</h1>'
    + dealStatusBadge(d.deal_status)
    + '</div>'

    // 工事決定確定ボタン（estimate_approved の場合のみ・大きく目立つ）
    + (isWaitingDecision ? 
      '<div class="bg-indigo-50 border-2 border-indigo-300 rounded-xl p-6 mb-5 text-center">'
      + '<p class="text-indigo-800 font-bold text-base mb-1"><i class="fas fa-handshake mr-2"></i>この案件の工事が決定しましたか？</p>'
      + '<p class="text-sm text-indigo-500 mb-4">確定後、契約や工事の詳細管理は岩野が行います</p>'
      + '<div class="flex justify-center gap-4">'
      + '<button onclick="confirmContract(\'' + d.id + '\')" class="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-base shadow-md">'
      + '<i class="fas fa-check-circle mr-2"></i>工事決定'
      + '</button>'
      + '<button onclick="dismissDeal(\'' + d.id + '\')" class="px-8 py-3 bg-white border-2 border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 hover:text-red-600 hover:border-red-300 font-bold text-base transition-colors">'
      + '<i class="fas fa-times-circle mr-2"></i>見送り'
      + '</button>'
      + '</div>'
      + '</div>'
    : '')

    // 案件情報
    + '<div class="bg-white border border-gray-200 rounded-lg p-5 mb-4">'
    + '<h2 class="text-sm font-semibold text-gray-500 mb-3"><i class="fas fa-info-circle mr-1"></i>案件情報</h2>'
    + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">'
    + '<div><span class="text-gray-400 text-xs">取引先</span><p class="font-medium text-gray-900">' + d.client_name + '</p></div>'
    + '<div><span class="text-gray-400 text-xs">申請者</span><p class="font-medium text-gray-900">' + d.applicant_name + '</p></div>'
    + '<div><span class="text-gray-400 text-xs">見積金額（税込）</span><p class="font-bold text-lg text-gray-900">' + formatCurrency(d.amount_with_tax) + '</p></div>'
    + '<div><span class="text-gray-400 text-xs">見積金額（税抜）</span><p class="font-medium text-gray-500">' + formatCurrency(d.amount) + '</p></div>'
    + (d.gross_profit_rate != null ? '<div><span class="text-gray-400 text-xs">申請時粗利率</span><p class="font-medium"><span class="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-emerald-100 text-emerald-800"><i class="fas fa-percentage mr-1 text-xs"></i>' + d.gross_profit_rate + '%</span></p></div>' : '')
    + (d.remarks ? '<div class="sm:col-span-2"><span class="text-gray-400 text-xs">備考</span><p class="font-medium text-gray-700">' + d.remarks + '</p></div>' : '')
    + '</div></div>'

    // 進捗情報（工事決定済みの場合のみ簡潔に表示）
    + (!isWaitingDecision ? 
      '<div class="bg-white border border-gray-200 rounded-lg p-5 mb-4">'
      + '<h2 class="text-sm font-semibold text-gray-500 mb-3"><i class="fas fa-tasks mr-1"></i>進捗状況</h2>'
      + '<div class="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6 text-sm">'
      + (d.contract_date ? '<div><span class="text-gray-400 text-xs">契約日</span><p class="font-medium">' + d.contract_date + '</p></div>' : '')
      + (d.construction_start ? '<div><span class="text-gray-400 text-xs">工事開始</span><p class="font-medium">' + d.construction_start + '</p></div>' : '')
      + (d.construction_end ? '<div><span class="text-gray-400 text-xs">工事完了</span><p class="font-medium">' + d.construction_end + '</p></div>' : '')
      + (d.notes ? '<div class="sm:col-span-3"><span class="text-gray-400 text-xs">メモ</span><p class="font-medium text-gray-600">' + d.notes + '</p></div>' : '')
      + '</div></div>'
    : '')

    + '<button onclick="navigate(\'admin-deals\')" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"><i class="fas fa-arrow-left mr-1"></i>案件一覧に戻る</button>';
}

async function confirmContract(dealId) {
  showConfirm('この案件の工事決定を確定しますか？', async function() {
    try {
      await api('/deals/' + dealId + '/confirm-contract', { method: 'POST' });
      showToast('工事決定を確定しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// 未トラッキング見積もりから直接工事決定
async function confirmFromEstimate(requestId) {
  showConfirm('この案件の工事決定を確定しますか？', async function() {
    try {
      await api('/deals/confirm-from-estimate/' + requestId, { method: 'POST' });
      showToast('工事決定を確定しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// トラッキング済み案件を見送り
async function dismissDeal(dealId) {
  showConfirm('この案件を見送り（失注）にしますか？', async function() {
    try {
      await api('/deals/' + dealId + '/dismiss', { method: 'POST' });
      showToast('案件を見送りにしました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// 未トラッキング見積もりから直接見送り
async function dismissFromEstimate(requestId) {
  showConfirm('この案件を見送り（失注）にしますか？', async function() {
    try {
      await api('/deals/dismiss-from-estimate/' + requestId, { method: 'POST' });
      showToast('案件を見送りにしました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ====== 協力会社管理 ======
async function renderPartnerList(main) {
  const data = await api('/partners');
  const partners = data.partners || [];

  main.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold text-gray-900"><i class="fas fa-handshake text-indigo-600 mr-2"></i>協力会社管理</h1>
      <button onclick="showPartnerForm()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        <i class="fas fa-plus mr-1"></i>新規登録
      </button>
    </div>

    ${partners.length === 0 ? `
      <div class="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <i class="fas fa-handshake text-gray-300 text-4xl mb-3"></i>
        <p class="text-gray-500">協力会社が登録されていません</p>
      </div>
    ` : `
      <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-left font-medium text-gray-500">会社名</th>
              <th class="px-4 py-3 text-left font-medium text-gray-500">代表者</th>
              <th class="px-4 py-3 text-left font-medium text-gray-500">電話番号</th>
              <th class="px-4 py-3 text-left font-medium text-gray-500">業種/工種</th>
              <th class="px-4 py-3 text-left font-medium text-gray-500">状態</th>
              <th class="px-4 py-3 text-center font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${partners.map(p => `
              <tr class="hover:bg-gray-50 ${!p.is_active ? 'opacity-50' : ''}">
                <td class="px-4 py-3 font-medium">${p.company_name}</td>
                <td class="px-4 py-3 text-gray-600">${p.representative_name || '-'}</td>
                <td class="px-4 py-3 text-gray-600">${p.phone || '-'}</td>
                <td class="px-4 py-3 text-gray-600">${p.trade_type || '-'}</td>
                <td class="px-4 py-3">${p.is_active ? '<span class="badge badge-completed">有効</span>' : '<span class="badge badge-withdrawn">無効</span>'}</td>
                <td class="px-4 py-3 text-center">
                  <button onclick="showPartnerForm('${p.id}')" class="text-blue-600 hover:text-blue-800 mr-2" title="編集"><i class="fas fa-edit"></i></button>
                  <button onclick="deletePartner('${p.id}','${p.company_name}')" class="text-red-500 hover:text-red-700" title="削除"><i class="fas fa-trash"></i></button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}`;
}

async function showPartnerForm(partnerId) {
  let partner = null;
  if (partnerId) {
    const data = await api('/partners/' + partnerId);
    partner = data.partner;
  }

  const title = partner ? '協力会社 編集' : '協力会社 新規登録';
  const content = `
    <form id="partner-form" class="space-y-3">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">会社名 <span class="text-red-500">*</span></label>
        <input type="text" id="pf-name" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value="${partner?.company_name || ''}" placeholder="株式会社○○工業">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">代表者名</label>
        <input type="text" id="pf-rep" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value="${partner?.representative_name || ''}" placeholder="山田 太郎">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
        <input type="text" id="pf-phone" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value="${partner?.phone || ''}" placeholder="0566-XX-XXXX">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">住所</label>
        <input type="text" id="pf-address" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value="${partner?.address || ''}" placeholder="愛知県高浜市...">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">業種/工種</label>
        <input type="text" id="pf-trade" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value="${partner?.trade_type || ''}" placeholder="電気工事、塗装、防水 など">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">備考</label>
        <textarea id="pf-notes" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows="2">${partner?.notes || ''}</textarea>
      </div>
      ${partner ? `
        <div>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" id="pf-active" ${partner.is_active ? 'checked' : ''}>
            <span>有効</span>
          </label>
        </div>
      ` : ''}
    </form>`;

  const actions = `
    <button onclick="closeModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
    <button onclick="submitPartnerForm('${partnerId || ''}')" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">${partner ? '更新' : '登録'}</button>`;

  showModal(title, content, actions);
}

async function submitPartnerForm(partnerId) {
  const body = {
    company_name: document.getElementById('pf-name').value,
    representative_name: document.getElementById('pf-rep').value || null,
    phone: document.getElementById('pf-phone').value || null,
    address: document.getElementById('pf-address').value || null,
    trade_type: document.getElementById('pf-trade').value || null,
    notes: document.getElementById('pf-notes').value || null
  };

  if (partnerId) {
    const activeEl = document.getElementById('pf-active');
    body.is_active = activeEl ? (activeEl.checked ? 1 : 0) : 1;
  }

  try {
    if (partnerId) {
      await api('/partners/' + partnerId + '/update', { method: 'POST', body: JSON.stringify(body) });
      showToast('協力会社を更新しました');
    } else {
      await api('/partners/create', { method: 'POST', body: JSON.stringify(body) });
      showToast('協力会社を登録しました');
    }
    closeModal();
    renderPageContent();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function deletePartner(id, name) {
  showConfirm('「' + name + '」を削除しますか？', async () => {
    try {
      await api('/partners/' + id + '/delete', { method: 'POST' });
      showToast('協力会社を削除/無効化しました');
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ====== 案件ダッシュボード ======
async function renderDealDashboard(main) {
  const data = await api('/deals/dashboard/summary');
  const { pipeline, paymentThisMonth, paymentNextMonth, overdue, receivedThisYear, monthlyPayments, profitSummary, upcomingConstruction } = data;

  // パイプラインデータ整理
  const pipelineOrder = ['estimate_approved','contracted','construction','construction_done','invoiced','payment_received','lost'];
  const pipelineData = {};
  pipelineOrder.forEach(s => { pipelineData[s] = { count: 0, total_excl: 0, total_incl: 0 }; });
  pipeline.forEach(p => { pipelineData[p.deal_status] = { count: p.count, total_excl: p.total_excl || 0, total_incl: p.total_incl || 0 }; });

  const totalDeals = pipeline.reduce((s, p) => s + p.count, 0);
  const activeExcl = pipeline.filter(p => p.deal_status !== 'lost' && p.deal_status !== 'payment_received')
                              .reduce((s, p) => s + (p.total_excl || 0), 0);

  main.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold text-gray-900"><i class="fas fa-chart-line text-indigo-600 mr-2"></i>案件ダッシュボード</h1>
      <button onclick="exportDealsCsv()" class="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm">
        <i class="fas fa-file-csv text-green-600 mr-1"></i>CSV出力
      </button>
    </div>

    <!-- サマリーカード -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <p class="text-xs text-gray-500">進行中案件</p>
        <p class="text-2xl font-bold text-indigo-600">${totalDeals - (pipelineData.payment_received?.count||0) - (pipelineData.lost?.count||0)}件</p>
        <p class="text-xs text-gray-400 mt-1">税抜 ${formatCurrency(activeExcl)}</p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <p class="text-xs text-gray-500">今年の入金済み<span class="text-[10px] text-gray-400 ml-1">税込</span></p>
        <p class="text-2xl font-bold text-green-600">${formatCurrency(receivedThisYear.total)}</p>
        <p class="text-xs text-gray-400 mt-1">${receivedThisYear.count}件</p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <p class="text-xs text-gray-500">今月入金予定<span class="text-[10px] text-gray-400 ml-1">税込</span></p>
        <p class="text-2xl font-bold text-blue-600">${formatCurrency(paymentThisMonth.total)}</p>
        <p class="text-xs text-gray-400 mt-1">${paymentThisMonth.count}件</p>
      </div>
      <div class="bg-white rounded-lg border ${overdue.count > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200'} p-4">
        <p class="text-xs ${overdue.count > 0 ? 'text-red-600' : 'text-gray-500'}">入金遅延</p>
        <p class="text-2xl font-bold ${overdue.count > 0 ? 'text-red-600' : 'text-gray-400'}">${overdue.count}件</p>
        <p class="text-xs ${overdue.count > 0 ? 'text-red-500' : 'text-gray-400'} mt-1">${formatCurrency(overdue.total)}</p>
      </div>
    </div>

    <!-- 粗利サマリー -->
    <div class="bg-white border border-gray-200 rounded-lg p-5 mb-6">
      <h2 class="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider"><i class="fas fa-calculator text-emerald-500 mr-1"></i>粗利サマリー <span class="text-[10px] text-gray-400 font-normal ml-1">※粗利計算は全て税抜ベース</span></h2>
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="bg-gray-50 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-500">対象案件数</p>
          <p class="text-xl font-bold text-gray-900">${profitSummary.total_deals}件</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-500">売上合計<span class="text-[10px] text-gray-400 block">税抜</span></p>
          <p class="text-xl font-bold text-indigo-600">${formatCurrency(profitSummary.total_revenue_excl)}</p>
          <p class="text-[10px] text-gray-400">税込 ${formatCurrency(profitSummary.total_revenue_incl)}</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-500">原価合計<span class="text-[10px] text-gray-400 block">税抜</span></p>
          <p class="text-xl font-bold text-rose-600">${formatCurrency(profitSummary.total_cost)}</p>
        </div>
        <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
          <p class="text-xs text-emerald-600">粗利合計<span class="text-[10px] text-emerald-400 block">税抜</span></p>
          <p class="text-xl font-bold text-emerald-700">${formatCurrency(profitSummary.total_profit)}</p>
        </div>
        <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
          <p class="text-xs text-emerald-600">平均粗利率</p>
          <p class="text-xl font-bold text-emerald-700">${Math.round(profitSummary.avg_profit_rate * 100)}%</p>
        </div>
      </div>
      ${profitSummary.total_revenue_excl > 0 ? `
        <div class="mt-3">
          <div class="flex rounded-full h-5 overflow-hidden bg-gray-200">
            <div class="bg-rose-400 flex items-center justify-center text-white text-xs font-medium" style="width:${Math.round((1 - profitSummary.avg_profit_rate) * 100)}%">
              原価 ${Math.round((1 - profitSummary.avg_profit_rate) * 100)}%
            </div>
            <div class="bg-emerald-500 flex items-center justify-center text-white text-xs font-medium" style="width:${Math.round(profitSummary.avg_profit_rate * 100)}%">
              粗利 ${Math.round(profitSummary.avg_profit_rate * 100)}%
            </div>
          </div>
        </div>
      ` : ''}
    </div>

    <!-- パイプライン -->
    <div class="bg-white border border-gray-200 rounded-lg p-5 mb-6">
      <h2 class="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">パイプライン</h2>
      <div class="flex flex-wrap gap-2 mb-4">
        ${pipelineOrder.filter(s => s !== 'lost').map(s => {
          const info = DEAL_STATUS_MAP[s];
          const d = pipelineData[s];
          const pct = totalDeals > 0 ? Math.round(d.count / totalDeals * 100) : 0;
          return `
            <div class="flex-1 min-w-[120px] bg-gray-50 rounded-lg p-3 text-center border border-gray-100 cursor-pointer hover:shadow-sm"
                 onclick="navigate('admin-deals',{status:'${s}'})">
              <div class="text-lg mb-1"><i class="fas ${info.icon} ${info.color.split(' ')[1]}"></i></div>
              <p class="text-xs text-gray-500">${info.label}</p>
              <p class="text-xl font-bold text-gray-900">${d.count}</p>
              <p class="text-xs text-gray-400">${formatCurrency(d.total_excl)}<span class="text-[9px] text-gray-300 ml-0.5">税抜</span></p>
            </div>`;
        }).join('<div class="flex items-center text-gray-300"><i class="fas fa-chevron-right"></i></div>')}
      </div>
      ${pipelineData.lost?.count > 0 ? `
        <div class="mt-2 text-sm text-gray-500 flex items-center gap-2">
          <i class="fas fa-times-circle text-gray-400"></i> 失注: ${pipelineData.lost.count}件（${formatCurrency(pipelineData.lost.total_excl)} 税抜）
        </div>
      ` : ''}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <!-- 来月入金予定 -->
      <div class="bg-white border border-gray-200 rounded-lg p-5">
        <h2 class="text-sm font-semibold text-gray-500 mb-3"><i class="fas fa-calendar-alt text-blue-500 mr-1"></i>来月入金予定 <span class="text-[10px] text-gray-400 font-normal">税込</span></h2>
        <p class="text-2xl font-bold text-blue-600">${formatCurrency(paymentNextMonth.total)}</p>
        <p class="text-sm text-gray-500">${paymentNextMonth.count}件</p>
      </div>

      <!-- 月別入金実績 -->
      <div class="bg-white border border-gray-200 rounded-lg p-5">
        <h2 class="text-sm font-semibold text-gray-500 mb-3"><i class="fas fa-chart-bar text-green-500 mr-1"></i>月別入金実績 <span class="text-[10px] text-gray-400 font-normal">税込</span></h2>
        ${monthlyPayments.length === 0 ? '<p class="text-gray-400 text-sm">データなし</p>' : `
          <div class="space-y-2">
            ${monthlyPayments.slice(0, 6).map(m => {
              const maxTotal = Math.max(...monthlyPayments.map(x => x.total));
              const barWidth = maxTotal > 0 ? Math.round(m.total / maxTotal * 100) : 0;
              return `
                <div class="flex items-center gap-2 text-sm">
                  <span class="w-16 text-gray-500 text-xs">${m.month}</span>
                  <div class="flex-1 bg-gray-100 rounded-full h-5 relative">
                    <div class="bg-green-500 rounded-full h-5" style="width:${barWidth}%"></div>
                  </div>
                  <span class="w-24 text-right font-medium text-xs">${formatCurrency(m.total)}</span>
                </div>`;
            }).join('')}
          </div>
        `}
      </div>
    </div>

    <!-- 工事予定 -->
    ${upcomingConstruction.length > 0 ? `
    <div class="bg-white border border-gray-200 rounded-lg p-5">
      <h2 class="text-sm font-semibold text-gray-500 mb-3"><i class="fas fa-hard-hat text-yellow-500 mr-1"></i>工事予定</h2>
      <div class="space-y-2">
        ${upcomingConstruction.map(c => `
          <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
               onclick="navigate('admin-deal-detail',{id:'${c.id}'})">
            <div class="flex-1 min-w-0">
              <p class="font-medium text-sm">#${String(c.request_number).padStart(4,'0')} ${c.title}</p>
              <p class="text-xs text-gray-500">${c.client_name} ・ ${formatCurrency(c.contract_amount_excl_tax || c.amount)}<span class="text-[9px] text-gray-400 ml-0.5">税抜</span></p>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="text-sm font-medium">${c.construction_start || '未定'}</p>
              <p class="text-xs text-gray-400">${dealStatusBadge(c.deal_status)}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}`;
}

// ====== CSVエクスポート ======
async function exportDealsCsv(statusFilter) {
  try {
    const params = statusFilter ? `?status=${statusFilter}` : '';
    const res = await fetch(`/api/deals/export/csv${params}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text.substring(0, 200));
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().substring(0, 10);
    a.download = `案件一覧_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('CSVをダウンロードしました');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// LEAD MANAGEMENT (リード管理)
// ============================================================
const LEAD_STAGES = {
  inquiry: { label: '問合せ', color: 'gray', bg: 'bg-gray-100 text-gray-800' },
  survey: { label: '現調・ヒアリング', color: 'blue', bg: 'bg-blue-100 text-blue-800' },
  estimating: { label: '見積作成中', color: 'yellow', bg: 'bg-yellow-100 text-yellow-800' },
  submitted: { label: '見積提出済', color: 'orange', bg: 'bg-orange-100 text-orange-800' },
  negotiation: { label: '交渉中', color: 'purple', bg: 'bg-purple-100 text-purple-800' },
  won: { label: '受注確定', color: 'green', bg: 'bg-green-100 text-green-800' },
  lost: { label: '見送り', color: 'red', bg: 'bg-red-100 text-red-800' }
};

function leadStageBadge(stage) {
  const s = LEAD_STAGES[stage] || { label: stage, bg: 'bg-gray-100 text-gray-800' };
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg}">${s.label}</span>`;
}

// ---- LEAD LIST ----
async function renderLeadList(main) {
  const stageFilter = state.pageParams?.stage || '';
  const keyword = state.pageParams?.keyword || '';
  const data = await api(`/leads?stage=${stageFilter}&keyword=${encodeURIComponent(keyword)}`);
  const leads = data.leads || [];
  const summary = data.summary || [];

  // Active lead stats
  const activeLeads = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost');
  const totalAmount = activeLeads.reduce((s, l) => s + (l.estimated_amount || 0), 0);

  main.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold text-gray-900"><i class="fas fa-funnel-dollar text-indigo-500 mr-2"></i>リード管理</h1>
      <button onclick="showLeadFormModal()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
        <i class="fas fa-plus mr-1"></i>新規リード
      </button>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div class="bg-white border rounded-lg p-3">
        <p class="text-xs text-gray-500">進行中リード</p>
        <p class="text-xl font-bold text-indigo-600">${activeLeads.length}<span class="text-sm font-normal text-gray-400">件</span></p>
      </div>
      <div class="bg-white border rounded-lg p-3">
        <p class="text-xs text-gray-500">見込み総額</p>
        <p class="text-lg font-bold text-gray-900">${formatCurrency(totalAmount)}</p>
      </div>
      <div class="bg-white border rounded-lg p-3">
        <p class="text-xs text-gray-500">受注確定</p>
        <p class="text-xl font-bold text-green-600">${leads.filter(l => l.stage === 'won').length}<span class="text-sm font-normal text-gray-400">件</span></p>
      </div>
      <div class="bg-white border rounded-lg p-3">
        <p class="text-xs text-gray-500">見送り</p>
        <p class="text-xl font-bold text-red-500">${leads.filter(l => l.stage === 'lost').length}<span class="text-sm font-normal text-gray-400">件</span></p>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white border rounded-lg p-3 mb-4 flex flex-wrap gap-3 items-center">
      <select id="lead-filter-stage" class="px-3 py-1.5 border rounded-lg text-sm" onchange="applyLeadFilters()">
        <option value="">全ステージ</option>
        ${Object.entries(LEAD_STAGES).map(([k,v]) => `<option value="${k}" ${stageFilter===k?'selected':''}>${v.label}</option>`).join('')}
      </select>
      <input type="text" id="lead-filter-keyword" value="${keyword}" placeholder="案件名・取引先で検索" class="px-3 py-1.5 border rounded-lg text-sm flex-1 min-w-[180px]" onkeyup="if(event.key==='Enter')applyLeadFilters()">
      <button onclick="applyLeadFilters()" class="px-3 py-1.5 bg-gray-100 border rounded-lg text-sm hover:bg-gray-200"><i class="fas fa-search"></i></button>
    </div>

    <!-- Lead Table -->
    <div class="bg-white border rounded-lg overflow-hidden">
      ${leads.length === 0 ? `
        <div class="text-center py-12 text-gray-400">
          <i class="fas fa-funnel-dollar text-4xl mb-3"></i>
          <p>リードがありません</p>
          <button onclick="showLeadFormModal()" class="mt-3 text-indigo-600 hover:text-indigo-800 text-sm">最初のリードを登録する</button>
        </div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">案件名</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">取引先</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">概算金額</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">ステージ</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">確度</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">担当</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">更新日</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${leads.map(l => `
                <tr class="hover:bg-gray-50 cursor-pointer" onclick="navigate('lead-detail',{id:'${l.id}'})">
                  <td class="px-3 py-2.5 font-medium text-indigo-700">${l.lead_name}</td>
                  <td class="px-3 py-2.5 text-gray-600">${l.client_name || '-'}</td>
                  <td class="px-3 py-2.5 text-gray-900">${l.estimated_amount ? formatCurrency(l.estimated_amount) : '-'}</td>
                  <td class="px-3 py-2.5">
                    <select class="text-xs border rounded px-1.5 py-0.5 ${LEAD_STAGES[l.stage]?.bg || ''}" onchange="changeLeadStage(event,'${l.id}',this.value)" onclick="event.stopPropagation()">
                      ${Object.entries(LEAD_STAGES).map(([k,v]) => `<option value="${k}" ${l.stage===k?'selected':''}>${v.label}</option>`).join('')}
                    </select>
                  </td>
                  <td class="px-3 py-2.5 text-gray-600">${l.probability != null ? l.probability + '%' : '-'}</td>
                  <td class="px-3 py-2.5 text-gray-600 text-xs">${l.owner_name}</td>
                  <td class="px-3 py-2.5 text-gray-400 text-xs">${formatDate(l.updated_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>`;
}

function applyLeadFilters() {
  navigate('leads', {
    stage: document.getElementById('lead-filter-stage').value,
    keyword: document.getElementById('lead-filter-keyword').value
  });
}

async function changeLeadStage(event, leadId, newStage) {
  event.stopPropagation();
  try {
    await api(`/leads/${leadId}/stage`, { method: 'POST', body: JSON.stringify({ stage: newStage }) });
    showToast('ステージを更新しました');
    renderPageContent();
  } catch (err) { showToast(err.message, 'error'); }
}

// ---- LEAD FORM MODAL ----
async function showLeadFormModal(leadData) {
  const isEdit = !!leadData;
  let partners = [];
  try { const pd = await api('/partners'); partners = pd.partners || []; } catch {}

  // Get users for owner dropdown (admin/approver only)
  let owners = [];
  try { const ud = await api('/dashboard/active-users'); owners = ud.users || []; } catch {}

  showModal(isEdit ? 'リード編集' : '新規リード登録', `
    <div class="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">案件名 <span class="text-red-500">*</span></label>
        <input type="text" id="lead-name" value="${isEdit ? (leadData.lead_name || '') : ''}" maxlength="100" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="例: ○○邸外壁塗装">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">取引先・施主名</label>
          <input type="text" id="lead-client" value="${isEdit ? (leadData.client_name || '') : ''}" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="取引先名">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">連絡先</label>
          <input type="text" id="lead-contact" value="${isEdit ? (leadData.contact_info || '') : ''}" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="電話・メール等">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">概算金額（税抜）</label>
          <div class="relative">
            <span class="absolute left-3 top-2 text-gray-500 text-sm">\u00a5</span>
            <input type="number" id="lead-amount" value="${isEdit && leadData.estimated_amount ? leadData.estimated_amount : ''}" min="0" class="w-full pl-7 pr-3 py-2 border rounded-lg text-sm" placeholder="0">
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">想定粗利率</label>
          <div class="relative">
            <input type="number" id="lead-profit-rate" value="${isEdit && leadData.estimated_profit_rate != null ? leadData.estimated_profit_rate : ''}" min="0" max="100" step="0.1" class="w-full pr-8 px-3 py-2 border rounded-lg text-sm" placeholder="20">
            <span class="absolute right-3 top-2 text-gray-500 text-sm">%</span>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">ステージ</label>
          <select id="lead-stage" class="w-full px-3 py-2 border rounded-lg text-sm">
            ${Object.entries(LEAD_STAGES).filter(([k]) => k !== 'won' && k !== 'lost').map(([k,v]) => `<option value="${k}" ${isEdit && leadData.stage===k ? 'selected' : (!isEdit && k==='inquiry' ? 'selected' : '')}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">受注確度</label>
          <div class="relative">
            <input type="number" id="lead-probability" value="${isEdit && leadData.probability != null ? leadData.probability : ''}" min="0" max="100" class="w-full pr-8 px-3 py-2 border rounded-lg text-sm" placeholder="50">
            <span class="absolute right-3 top-2 text-gray-500 text-sm">%</span>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">発生元</label>
          <input type="text" id="lead-source" value="${isEdit ? (leadData.source || '') : ''}" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="紹介/HP/既存顧客等">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">受注見込み時期</label>
          <input type="date" id="lead-expected" value="${isEdit ? (leadData.expected_date || '') : ''}" class="w-full px-3 py-2 border rounded-lg text-sm">
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">元請け会社</label>
        <select id="lead-prime" class="w-full px-3 py-2 border rounded-lg text-sm">
          <option value="">なし</option>
          ${partners.map(p => `<option value="${p.id}" ${isEdit && leadData.prime_contractor_id===p.id ? 'selected' : ''}>${p.company_name}${p.trade_type ? ' (' + p.trade_type + ')' : ''}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">担当者</label>
        <select id="lead-owner" class="w-full px-3 py-2 border rounded-lg text-sm">
          ${owners.map(u => `<option value="${u.id}" ${isEdit ? (leadData.owner_id===u.id ? 'selected' : '') : (u.id===state.user?.id ? 'selected' : '')}>${u.display_name}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">メモ</label>
        <textarea id="lead-notes" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="自由記述">${isEdit ? (leadData.notes || '') : ''}</textarea>
      </div>
    </div>`,
    `<button onclick="closeModal()" class="px-4 py-2 text-sm border rounded-lg">キャンセル</button>
     <button id="lead-save-btn" class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">${isEdit ? '更新する' : '登録する'}</button>`
  );

  document.getElementById('lead-save-btn').onclick = async () => {
    const name = document.getElementById('lead-name').value.trim();
    if (!name) { showToast('案件名は必須です', 'error'); return; }

    const body = {
      lead_name: name,
      client_name: document.getElementById('lead-client').value,
      contact_info: document.getElementById('lead-contact').value,
      estimated_amount: document.getElementById('lead-amount').value ? parseFloat(document.getElementById('lead-amount').value) : null,
      estimated_profit_rate: document.getElementById('lead-profit-rate').value !== '' ? parseFloat(document.getElementById('lead-profit-rate').value) : null,
      stage: document.getElementById('lead-stage').value,
      probability: document.getElementById('lead-probability').value !== '' ? parseInt(document.getElementById('lead-probability').value) : null,
      source: document.getElementById('lead-source').value,
      expected_date: document.getElementById('lead-expected').value || null,
      prime_contractor_id: document.getElementById('lead-prime').value || null,
      owner_id: document.getElementById('lead-owner').value,
      notes: document.getElementById('lead-notes').value
    };

    try {
      if (isEdit) {
        await api(`/leads/${leadData.id}/update`, { method: 'POST', body: JSON.stringify(body) });
        showToast('リードを更新しました');
      } else {
        const res = await api('/leads/create', { method: 'POST', body: JSON.stringify(body) });
        showToast('リードを登録しました');
      }
      closeModal();
      renderPageContent();
    } catch (err) { showToast(err.message, 'error'); }
  };
}

// ---- LEAD DETAIL ----
async function renderLeadDetail(main) {
  const id = state.pageParams?.id;
  if (!id) { navigate('leads'); return; }

  const data = await api(`/leads/${id}`);
  const lead = data.lead;
  const activities = data.activities || [];
  const linked = data.linkedRequest;

  main.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <button onclick="navigate('leads')" class="text-gray-500 hover:text-gray-700"><i class="fas fa-arrow-left"></i></button>
      <h1 class="text-xl font-bold text-gray-900">${lead.lead_name}</h1>
      ${leadStageBadge(lead.stage)}
    </div>

    <!-- Lead Info -->
    <div class="bg-white border rounded-lg p-5 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">リード情報</h2>
        <div class="flex gap-2">
          <button onclick="editLeadFromDetail('${id}')" class="text-sm text-indigo-600 hover:text-indigo-800"><i class="fas fa-edit mr-1"></i>編集</button>
          <button onclick="deleteLeadConfirm('${id}')" class="text-sm text-red-500 hover:text-red-700"><i class="fas fa-trash mr-1"></i>削除</button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
        <div><span class="text-gray-500">取引先・施主</span><p class="font-medium">${lead.client_name || '-'}</p></div>
        <div><span class="text-gray-500">連絡先</span><p class="font-medium">${lead.contact_info || '-'}</p></div>
        <div><span class="text-gray-500">概算金額（税抜）</span><p class="font-medium text-lg">${lead.estimated_amount ? formatCurrency(lead.estimated_amount) : '-'}</p></div>
        <div><span class="text-gray-500">想定粗利率</span><p class="font-medium">${lead.estimated_profit_rate != null ? lead.estimated_profit_rate + '%' : '-'}</p></div>
        ${lead.estimated_amount && lead.estimated_profit_rate != null ? `
        <div><span class="text-gray-500">想定粗利額</span><p class="font-medium text-emerald-700">${formatCurrency(Math.round(lead.estimated_amount * lead.estimated_profit_rate / 100))}</p></div>
        ` : ''}
        <div><span class="text-gray-500">受注確度</span><p class="font-medium">${lead.probability != null ? lead.probability + '%' : '-'}</p></div>
        <div><span class="text-gray-500">発生元</span><p class="font-medium">${lead.source || '-'}</p></div>
        <div><span class="text-gray-500">受注見込み時期</span><p class="font-medium">${lead.expected_date || '-'}</p></div>
        ${lead.prime_contractor_name ? `<div><span class="text-gray-500">元請け会社</span><p class="font-medium"><i class="fas fa-building text-indigo-400 mr-1"></i>${lead.prime_contractor_name}</p></div>` : ''}
        <div><span class="text-gray-500">担当者</span><p class="font-medium">${lead.owner_name}</p></div>
        <div><span class="text-gray-500">作成者</span><p class="font-medium">${lead.created_by_name}</p></div>
        <div><span class="text-gray-500">作成日</span><p class="font-medium">${formatDate(lead.created_at)}</p></div>
        ${lead.notes ? `<div class="sm:col-span-2"><span class="text-gray-500">メモ</span><p class="font-medium whitespace-pre-wrap">${lead.notes}</p></div>` : ''}
      </div>
    </div>

    <!-- Linked Request -->
    ${linked ? `
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <h3 class="text-sm font-semibold text-blue-800 mb-2"><i class="fas fa-link mr-1"></i>紐づき申請</h3>
      <div class="flex items-center gap-3">
        <span class="text-sm">#${String(linked.request_number).padStart(4,'0')} ${linked.title}</span>
        ${statusBadge(linked.status)}
        <span class="text-sm text-gray-500">${formatCurrency(linked.amount_with_tax)}</span>
        <button onclick="navigate('request-detail',{id:'${linked.id}'})" class="text-xs text-blue-600 hover:text-blue-800 ml-auto">詳細を見る →</button>
      </div>
    </div>
    ` : `
    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-500"><i class="fas fa-unlink mr-1"></i>見積申請と紐づけなし</p>
        <button onclick="createRequestFromLead('${id}','${(lead.lead_name || '').replace(/'/g, "\\'")}','${(lead.client_name || '').replace(/'/g, "\\'")}')" class="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          <i class="fas fa-file-alt mr-1"></i>見積申請を作成
        </button>
      </div>
    </div>
    `}

    <!-- Stage Change -->
    <div class="bg-white border rounded-lg p-4 mb-4">
      <h3 class="text-sm font-semibold text-gray-500 mb-2">ステージ変更</h3>
      <div class="flex flex-wrap gap-2">
        ${Object.entries(LEAD_STAGES).map(([k, v]) => `
          <button onclick="changeLeadStageFromDetail('${id}','${k}')" class="px-3 py-1.5 text-xs rounded-lg border ${lead.stage === k ? 'ring-2 ring-indigo-500 font-bold ' + v.bg : 'bg-white text-gray-600 hover:bg-gray-50'}">${v.label}</button>
        `).join('')}
      </div>
    </div>

    <!-- Activity Timeline -->
    <div class="bg-white border rounded-lg p-5 mb-4">
      <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">活動ログ</h2>
      
      <!-- Add Note -->
      <div class="flex gap-2 mb-4">
        <input type="text" id="lead-note-input" class="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="メモを追加...">
        <button onclick="addLeadNote('${id}')" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
          <i class="fas fa-plus mr-1"></i>追加
        </button>
      </div>
      
      ${activities.length === 0 ? `
        <p class="text-center text-gray-400 py-4 text-sm">活動ログはまだありません</p>
      ` : `
        <div class="space-y-3">
          ${activities.map(a => `
            <div class="flex gap-3 ${a.activity_type === 'note' ? '' : 'opacity-80'}">
              <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${a.activity_type === 'note' ? 'bg-indigo-100 text-indigo-600' : a.activity_type === 'stage_change' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}">
                <i class="fas ${a.activity_type === 'note' ? 'fa-sticky-note' : a.activity_type === 'stage_change' ? 'fa-exchange-alt' : 'fa-link'} text-xs"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-gray-800">${a.content}</p>
                <p class="text-xs text-gray-400 mt-0.5">${a.user_name} ・ ${formatDate(a.created_at)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>`;

  // Enter key for note input
  document.getElementById('lead-note-input')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') addLeadNote(id);
  });
}

async function editLeadFromDetail(leadId) {
  const data = await api(`/leads/${leadId}`);
  showLeadFormModal(data.lead);
}

function deleteLeadConfirm(leadId) {
  showConfirm('このリードを削除しますか？活動ログも全て削除されます。', async () => {
    try {
      await api(`/leads/${leadId}/delete`, { method: 'POST' });
      showToast('リードを削除しました');
      navigate('leads');
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function changeLeadStageFromDetail(leadId, newStage) {
  try {
    await api(`/leads/${leadId}/stage`, { method: 'POST', body: JSON.stringify({ stage: newStage }) });
    showToast('ステージを更新しました');
    renderPageContent();
  } catch (err) { showToast(err.message, 'error'); }
}

async function addLeadNote(leadId) {
  const input = document.getElementById('lead-note-input');
  const content = input?.value?.trim();
  if (!content) { showToast('メモ内容を入力してください', 'error'); return; }
  try {
    await api(`/leads/${leadId}/note`, { method: 'POST', body: JSON.stringify({ content }) });
    showToast('メモを追加しました');
    renderPageContent();
  } catch (err) { showToast(err.message, 'error'); }
}

function createRequestFromLead(leadId, leadName, clientName) {
  // Navigate to new request with pre-filled data from lead
  navigate('new-request', { from_lead: leadId, title: leadName, client: clientName });
}

// ---- LEAD DASHBOARD (売上予測) ----
async function renderLeadDashboard(main) {
  const data = await api('/leads/dashboard/summary');
  const { confirmed, leads: leadSummary, total, details, pipeline } = data;

  main.innerHTML = `
    <h1 class="text-xl font-bold text-gray-900 mb-4"><i class="fas fa-chart-pie text-indigo-500 mr-2"></i>売上予測ダッシュボード</h1>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div class="bg-white border rounded-lg p-4">
        <p class="text-xs text-gray-500 mb-1">確定売上</p>
        <p class="text-xl font-bold text-green-700">${formatCurrency(confirmed.revenue)}</p>
        <p class="text-xs text-gray-400">${confirmed.count}件</p>
      </div>
      <div class="bg-white border rounded-lg p-4">
        <p class="text-xs text-gray-500 mb-1">リード見込み</p>
        <p class="text-xl font-bold text-indigo-600">${formatCurrency(leadSummary.revenue)}</p>
        <p class="text-xs text-gray-400">${leadSummary.count}件</p>
      </div>
      <div class="bg-gradient-to-r from-indigo-50 to-green-50 border border-indigo-200 rounded-lg p-4">
        <p class="text-xs text-indigo-700 font-medium mb-1">合算予測売上</p>
        <p class="text-2xl font-bold text-gray-900">${formatCurrency(total.revenue)}</p>
      </div>
      <div class="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-4">
        <p class="text-xs text-emerald-700 font-medium mb-1">予測粗利</p>
        <p class="text-xl font-bold text-emerald-700">${formatCurrency(total.profit)}</p>
        <p class="text-xs text-emerald-600">${total.profit_rate}%</p>
      </div>
    </div>

    <!-- Pipeline Chart -->
    <div class="bg-white border rounded-lg p-5 mb-6">
      <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">ステージ別パイプライン</h2>
      ${pipeline.length === 0 ? `<p class="text-center text-gray-400 py-4 text-sm">進行中のリードはありません</p>` : `
        <div class="space-y-3">
          ${pipeline.map(p => {
            const maxAmount = Math.max(...pipeline.map(pp => pp.total_amount || 1));
            const pct = maxAmount > 0 ? Math.round((p.total_amount / maxAmount) * 100) : 0;
            const stageInfo = LEAD_STAGES[p.stage] || { label: p.stage, color: 'gray' };
            return `
              <div class="flex items-center gap-3">
                <div class="w-28 text-xs font-medium text-gray-700">${stageInfo.label}</div>
                <div class="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                  <div class="h-full rounded-full bg-indigo-${p.stage === 'inquiry' ? '200' : p.stage === 'survey' ? '300' : p.stage === 'estimating' ? '400' : p.stage === 'submitted' ? '500' : '600'}" style="width:${pct}%"></div>
                  <span class="absolute inset-0 flex items-center justify-center text-xs font-medium ${pct > 40 ? 'text-white' : 'text-gray-700'}">${p.count}件 / ${formatCurrency(p.total_amount)}</span>
                </div>
              </div>`;
          }).join('')}
        </div>
      `}
    </div>

    <!-- Detail Table -->
    <div class="bg-white border rounded-lg overflow-hidden">
      <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider p-4 border-b">内訳一覧</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">区分</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">案件名</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">取引先</th>
              <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">金額（税抜）</th>
              <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">粗利率</th>
              <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">粗利額</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">ステータス</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${details.length === 0 ? `<tr><td colspan="7" class="px-3 py-8 text-center text-gray-400">データがありません</td></tr>` : ''}
            ${details.map(d => `
              <tr class="hover:bg-gray-50">
                <td class="px-3 py-2">${d.type === 'confirmed' ? '<span class="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">確定</span>' : '<span class="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">リード</span>'}</td>
                <td class="px-3 py-2 font-medium ${d.type === 'confirmed' ? 'text-gray-900' : 'text-indigo-700 cursor-pointer'}" ${d.type === 'lead' ? `onclick="navigate('lead-detail',{id:'${d.id}'})"` : ''}>${d.name}</td>
                <td class="px-3 py-2 text-gray-600">${d.client || '-'}</td>
                <td class="px-3 py-2 text-right text-gray-900">${d.amount ? formatCurrency(d.amount) : '-'}</td>
                <td class="px-3 py-2 text-right text-gray-600">${d.profit_rate ? d.profit_rate + '%' : '-'}</td>
                <td class="px-3 py-2 text-right font-medium text-emerald-700">${d.profit_amount ? formatCurrency(d.profit_amount) : '-'}</td>
                <td class="px-3 py-2">${d.type === 'confirmed' ? statusBadge(d.status) : leadStageBadge(d.stage)}</td>
              </tr>
            `).join('')}
            ${details.length > 0 ? `
            <tr class="bg-gray-50 font-bold border-t-2">
              <td colspan="3" class="px-3 py-2 text-right text-gray-700">合計</td>
              <td class="px-3 py-2 text-right text-gray-900">${formatCurrency(total.revenue)}</td>
              <td class="px-3 py-2 text-right text-gray-600">${total.profit_rate}%</td>
              <td class="px-3 py-2 text-right text-emerald-700">${formatCurrency(total.profit)}</td>
              <td></td>
            </tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================
// INITIALIZATION
// ============================================================
render();
