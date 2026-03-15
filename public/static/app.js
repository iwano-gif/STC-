// ============================================================
// 申請承認ワークフロー - フロントエンドアプリケーション
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
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  
  try {
    const res = await fetch(`/api${path}`, { ...options, headers: { ...headers, ...options.headers } });
    if (res.headers.get('Content-Type')?.includes('text/csv')) return res;
    const data = await res.json();
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
    'admin-audit': '/admin/audit-logs'
  };
  return paths[page] || '/';
}

window.onpopstate = (e) => {
  if (e.state) { state.currentPage = e.state.page; state.pageParams = e.state.params || {}; render(); }
};

// Format helpers
function formatCurrency(n) { return '¥' + Number(n).toLocaleString(); }
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
  if (s === 'approved') return '<span class="text-green-600 font-bold">✅</span>';
  if (s === 'rejected') return '<span class="text-red-600 font-bold">❌</span>';
  if (s === 'skipped') return '<span class="text-gray-400">⏭️</span>';
  if (s === 'waiting') return '<span class="text-blue-600">⏳</span>';
  return '<span class="text-gray-400">○</span>';
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
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-3">
            <i class="fas fa-file-invoice text-blue-600 text-xl"></i>
          </div>
          <h1 class="text-xl font-bold text-gray-900">申請承認ワークフロー</h1>
          <p class="text-sm text-gray-500 mt-1">ログインしてください</p>
        </div>
        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
            <input type="email" id="login-email" required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
              placeholder="user@example.com">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <input type="password" id="login-password" required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="パスワード">
          </div>
          <div id="login-error" class="text-red-600 text-sm hidden"></div>
          <button type="submit" class="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors">
            ログイン
          </button>
        </form>
        <div class="mt-6 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
          <p class="font-medium mb-1">デモアカウント：</p>
          <p>管理者: admin@example.com</p>
          <p>申請者: sato@example.com</p>
          <p>承認者: suzuki@example.com</p>
          <p>パスワード: (シードデータのハッシュ)</p>
        </div>
      </div>
    </div>`;
  
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
  const isClerk = hasRole('clerk');
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
              <i class="fas fa-file-invoice text-blue-600"></i>
              <span class="font-semibold text-sm hidden sm:inline">申請承認ワークフロー</span>
            </a>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-600 hidden sm:inline">${userName}</span>
            <div class="flex gap-1">
              ${state.user?.role?.filter(r => r !== 'applicant').map(r => 
                `<span class="text-xs px-2 py-0.5 rounded-full ${r === 'admin' ? 'bg-purple-100 text-purple-700' : r === 'approver' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}">${r}</span>`
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
  
  // Render page content
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
// NEW REQUEST FORM
// ============================================================
function renderNewRequest(main) {
  main.innerHTML = `
    <h1 class="text-xl font-bold text-gray-900 mb-4">新規申請</h1>
    <div class="bg-white border border-gray-200 rounded-lg p-6 max-w-xl">
      <form id="request-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">申請種別 <span class="text-red-500">*</span></label>
          <select id="req-type" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="estimate">見積もり</option>
            <option value="invoice">請求書</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">件名・案件名 <span class="text-red-500">*</span></label>
          <input type="text" id="req-title" required maxlength="100" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="案件名を入力">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">取引先名 <span class="text-red-500">*</span></label>
          <input type="text" id="req-client" required maxlength="100" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="取引先名を入力">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">金額（税抜）<span class="text-red-500">*</span></label>
            <div class="relative">
              <span class="absolute left-3 top-2 text-gray-500 text-sm">¥</span>
              <input type="number" id="req-amount" required min="1" step="1" class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" placeholder="0" oninput="calcTax()">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">税率 <span class="text-red-500">*</span></label>
            <select id="req-tax" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" onchange="calcTax()">
              <option value="0.10">10%</option>
              <option value="0.08">8%（軽減税率）</option>
              <option value="0.0">0%（非課税）</option>
            </select>
          </div>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
          <p class="text-sm text-gray-500">税込金額</p>
          <p id="req-total" class="text-lg font-bold text-gray-900">¥0</p>
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
  
  document.getElementById('request-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('req-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('req-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';
    
    try {
      const body = {
        type: document.getElementById('req-type').value,
        title: document.getElementById('req-title').value,
        client_name: document.getElementById('req-client').value,
        amount: parseFloat(document.getElementById('req-amount').value),
        tax_rate: parseFloat(document.getElementById('req-tax').value),
        remarks: document.getElementById('req-remarks').value
      };
      const res = await api('/requests', { method: 'POST', body: JSON.stringify(body) });
      showToast('申請が完了しました');
      navigate('request-detail', { id: res.id });
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>申請する';
    }
  };
}

function calcTax() {
  const amount = parseFloat(document.getElementById('req-amount')?.value || '0');
  const rate = parseFloat(document.getElementById('req-tax')?.value || '0.10');
  const total = Math.round(amount * (1 + rate));
  const el = document.getElementById('req-total');
  if (el) el.textContent = formatCurrency(total);
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
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${data.requests.map(r => `
                <tr class="hover:bg-gray-50 cursor-pointer" onclick="navigate('request-detail',{id:'${r.id}'})">
                  <td class="px-4 py-3 font-mono text-gray-500">${String(r.request_number).padStart(4,'0')}</td>
                  <td class="px-4 py-3">${typeLabel(r.type)}</td>
                  <td class="px-4 py-3 font-medium max-w-[200px] truncate">${r.title}</td>
                  <td class="px-4 py-3 text-gray-600 max-w-[150px] truncate">${r.client_name}</td>
                  <td class="px-4 py-3 text-right font-medium">${formatCurrency(r.amount_with_tax)}</td>
                  <td class="px-4 py-3 text-gray-600">${r.applicant_name}</td>
                  <td class="px-4 py-3 text-center">${statusBadge(r.status)}</td>
                  <td class="px-4 py-3 text-gray-500 text-xs">${formatDate(r.created_at)}</td>
                </tr>
              `).join('')}
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
// REQUEST DETAIL
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
        <div><span class="text-gray-500">金額（税抜）</span><p class="font-medium">${formatCurrency(req.amount)}</p></div>
        <div><span class="text-gray-500">税率</span><p class="font-medium">${req.tax_rate * 100}%</p></div>
        <div><span class="text-gray-500">金額（税込）</span><p class="font-medium text-lg">${formatCurrency(req.amount_with_tax)}</p></div>
        <div><span class="text-gray-500">申請日</span><p class="font-medium">${formatDate(req.created_at)}</p></div>
        ${req.remarks ? `<div class="sm:col-span-2"><span class="text-gray-500">備考</span><p class="font-medium whitespace-pre-wrap">${req.remarks}</p></div>` : ''}
      </div>
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
                  ${isCurrent ? '<span class="text-xs text-blue-600 font-medium">← 現在</span>' : ''}
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
      <button onclick="doWithdraw('${req.id}')" class="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
        <i class="fas fa-times mr-1"></i>この申請を取り下げる
      </button>
    </div>` : ''}
    
    ${isApplicant && req.status === 'rejected' ? `
    <div class="bg-white border border-orange-200 rounded-lg p-5 mb-4">
      <button onclick="navigate('edit-request',{id:'${req.id}'})" class="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600">
        <i class="fas fa-edit mr-1"></i>修正して再申請
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
  showConfirm('この申請を取り下げますか？取下げ後は再申請できません。', async () => {
    try {
      await api(`/requests/${requestId}/withdraw`, { method: 'POST' });
      showToast('申請を取り下げました');
      renderPageContent();
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
// EDIT / RESUBMIT REQUEST
// ============================================================
async function renderEditRequest(main) {
  const id = state.pageParams?.id;
  if (!id) { navigate('requests'); return; }
  
  const data = await api(`/requests/${id}`);
  const req = data.request;
  
  // Find rejection comment
  const rejectedStep = data.steps.find(s => s.status === 'rejected');
  
  main.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <button onclick="navigate('request-detail',{id:'${id}'})" class="text-gray-500 hover:text-gray-700"><i class="fas fa-arrow-left"></i></button>
      <h1 class="text-xl font-bold text-gray-900">申請 #${String(req.request_number).padStart(4,'0')}（修正）</h1>
    </div>
    
    ${rejectedStep ? `
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <p class="text-sm font-medium text-red-800 mb-1">差戻し理由（${rejectedStep.approver_label}：${rejectedStep.approver_name}）</p>
      <p class="text-sm text-red-700">${rejectedStep.comment}</p>
    </div>` : ''}
    
    <div class="bg-white border border-gray-200 rounded-lg p-6 max-w-xl">
      <form id="edit-form" class="space-y-4">
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
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">金額（税抜）<span class="text-red-500">*</span></label>
            <div class="relative">
              <span class="absolute left-3 top-2 text-gray-500 text-sm">¥</span>
              <input type="number" id="edit-amount" required min="1" value="${req.amount}" class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcTaxEdit()">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">税率 <span class="text-red-500">*</span></label>
            <select id="edit-tax" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" onchange="calcTaxEdit()">
              <option value="0.10" ${req.tax_rate==0.10?'selected':''}>10%</option>
              <option value="0.08" ${req.tax_rate==0.08?'selected':''}>8%</option>
              <option value="0.0" ${req.tax_rate==0?'selected':''}>0%</option>
            </select>
          </div>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
          <p class="text-sm text-gray-500">税込金額</p>
          <p id="edit-total" class="text-lg font-bold">${formatCurrency(req.amount_with_tax)}</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">備考</label>
          <textarea id="edit-remarks" rows="3" maxlength="1000" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">${req.remarks || ''}</textarea>
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
  
  document.getElementById('edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('edit-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('edit-submit');
    btn.disabled = true;
    try {
      const body = {
        type: document.getElementById('edit-type').value,
        title: document.getElementById('edit-title').value,
        client_name: document.getElementById('edit-client').value,
        amount: parseFloat(document.getElementById('edit-amount').value),
        tax_rate: parseFloat(document.getElementById('edit-tax').value),
        remarks: document.getElementById('edit-remarks').value
      };
      await api(`/requests/${id}/resubmit`, { method: 'POST', body: JSON.stringify(body) });
      showToast('再申請しました');
      navigate('request-detail', { id });
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false;
    }
  };
}

function calcTaxEdit() {
  const amount = parseFloat(document.getElementById('edit-amount')?.value || '0');
  const rate = parseFloat(document.getElementById('edit-tax')?.value || '0.10');
  document.getElementById('edit-total').textContent = formatCurrency(Math.round(amount * (1 + rate)));
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
        <i class="fas fa-plus mr-1"></i>ユーザーを招待
      </button>
    </div>
    
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-left font-medium text-gray-500">氏名</th>
              <th class="px-4 py-3 text-left font-medium text-gray-500">メール</th>
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
                      ${roles.map(r => `<span class="text-xs px-2 py-0.5 rounded-full ${r==='admin'?'bg-purple-100 text-purple-700':r==='approver'?'bg-blue-100 text-blue-700':r==='clerk'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600'}">${r}</span>`).join('')}
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
  showModal('ユーザーを招待', `
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">メールアドレス <span class="text-red-500">*</span></label>
        <input type="email" id="invite-email" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">氏名 <span class="text-red-500">*</span></label>
        <input type="text" id="invite-name" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
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
     <button id="invite-btn" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">招待する</button>`
  );
  document.getElementById('invite-btn').onclick = async () => {
    const roles = ['applicant'];
    if (document.getElementById('invite-approver').checked) roles.push('approver');
    if (document.getElementById('invite-clerk').checked) roles.push('clerk');
    if (document.getElementById('invite-admin').checked) roles.push('admin');
    try {
      const res = await api('/admin/users/invite', { method: 'POST', body: JSON.stringify({
        email: document.getElementById('invite-email').value,
        displayName: document.getElementById('invite-name').value,
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
    <p class="text-sm text-gray-500 mb-4">${user.email}</p>
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
    
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="px-4 py-3 text-left font-medium text-gray-500">順序</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500">氏名</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500">役職ラベル</th>
            <th class="px-4 py-3 text-center font-medium text-gray-500">状態</th>
            <th class="px-4 py-3 text-center font-medium text-gray-500">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${data.approvers.map(a => `
            <tr class="${!a.is_active?'opacity-50':''}">
              <td class="px-4 py-3 font-medium">${a.step_order}</td>
              <td class="px-4 py-3">${a.display_name}（${a.email}）</td>
              <td class="px-4 py-3">${a.label}</td>
              <td class="px-4 py-3 text-center">
                <span class="text-xs px-2 py-0.5 rounded-full ${a.is_active?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${a.is_active?'有効':'無効'}</span>
              </td>
              <td class="px-4 py-3 text-center">
                <button onclick="showEditApproverModal('${a.id}','${a.label}',${a.step_order},${a.is_active})" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                <button onclick="deleteApprover('${a.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="text-sm text-gray-500 mt-3">
      <i class="fas fa-info-circle mr-1"></i>変更は次回の新規申請から反映されます
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

function showEditApproverModal(id, label, stepOrder, isActive) {
  showModal('承認者を編集', `
    <div class="space-y-4">
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
    try {
      await api(`/admin/approvers/${id}/update`, { method: 'POST', body: JSON.stringify({
        label: document.getElementById('edit-approver-label').value,
        stepOrder: parseInt(document.getElementById('edit-approver-order').value),
        isActive: document.getElementById('edit-approver-active').value === '1'
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
    request_created: '申請作成', request_resubmitted: '再申請', request_withdrawn: '取下げ',
    step_approved: '承認', step_rejected: '差戻し', step_reassigned: '承認者振替',
    request_processed: '処理済み', user_invited: 'ユーザー招待', user_role_changed: 'ロール変更',
    user_deactivated: 'ユーザー無効化', user_reactivated: 'ユーザー有効化', user_deleted: 'ユーザー削除',
    user_password_reset: 'パスワードリセット', approver_added: '承認者追加', approver_updated: '承認者更新',
    approver_removed: '承認者削除', settings_changed: '設定変更'
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
// INITIALIZATION
// ============================================================
render();
