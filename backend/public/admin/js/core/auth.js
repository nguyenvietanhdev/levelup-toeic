// modules/auth.js — Authentication, dark mode, and admin name helpers

// ===================================
// 0. DARK MODE
// ===================================
function initDarkMode() {
    const savedTheme = localStorage.getItem('admin-theme') || 'light';
    const htmlElement = document.documentElement;
    const themeToggle = document.getElementById('theme-toggle');
    const themeText = document.getElementById('theme-text');
    const themeIcon = themeToggle?.querySelector('i');

    // Apply saved theme
    if (savedTheme === 'dark') {
        htmlElement.setAttribute('data-theme', 'dark');
        if (themeIcon) themeIcon.className = 'fas fa-sun';
        if (themeText) themeText.textContent = 'Light';
    }

    // Toggle theme
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = htmlElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            htmlElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('admin-theme', newTheme);

            if (newTheme === 'dark') {
                if (themeIcon) themeIcon.className = 'fas fa-sun';
                if (themeText) themeText.textContent = 'Light';
            } else {
                if (themeIcon) themeIcon.className = 'fas fa-moon';
                if (themeText) themeText.textContent = 'Dark';
            }
        });
    }
}

// ===================================
// 1. AUTHENTICATION
// ===================================

// Check authentication on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize dark mode
    initDarkMode();

    // Check if we have a token
    const token = getToken();
    if (token) {
        // Validate token with server
        const isValid = await validateToken(token);
        if (isValid) {
            // Token valid, show dashboard
            showDashboard();
            await initDashboard();
        } else {
            // Token invalid, show login
            showLoginModal();
        }
    } else {
        // No token, show login
        showLoginModal();
    }

    // Setup login form handler
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Setup logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Toggle dropdown avatar (mở/đóng menu chứa nút Đăng xuất)
    const avatarBtn = document.getElementById('avatar-btn');
    const avatarDropdown = document.getElementById('avatar-dropdown');
    if (avatarBtn && avatarDropdown) {
        avatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            avatarDropdown.classList.toggle('open');
        });
        // Bấm ra ngoài → đóng
        document.addEventListener('click', (e) => {
            if (!avatarDropdown.contains(e.target) && !avatarBtn.contains(e.target)) {
                avatarDropdown.classList.remove('open');
            }
        });
    }
});

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    const errorDiv = document.getElementById('login-error');

    try {
        const response = await fetch(`${API_URL}/auth/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success && data.token) {
            // Check if user is admin (role is in data.user.user.role)
            const userRole = data.user?.user?.role || data.user?.role;
            if (userRole !== 'admin') {
                errorDiv.textContent = 'Access denied: Admin role required';
                errorDiv.style.display = 'block';
                return;
            }

            // Save token (using separate key for admin)
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('adminAuthToken', JSON.stringify({ token: data.token }));

            // Update UI
            const username = data.user?.user?.username || data.user?.username || 'Admin';
            setAdminName(username);

            // Hide login, show dashboard
            showDashboard();
            await initDashboard();
        } else {
            errorDiv.textContent = data.message || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = 'Connection error. Please try again.';
        errorDiv.style.display = 'block';
    }
}

async function validateToken(token) {
    try {
        const response = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        // Check role from correct path (data.data.user.role or data.data.role)
        const userRole = data.data?.user?.role || data.data?.role;
        if (data.success && userRole === 'admin') {
            authToken = token;
            currentUser = data.data;
            const username = data.data?.user?.username || data.data?.username || 'Admin';
            setAdminName(username);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Token validation error:', error);
        return false;
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('adminAuthToken');
    showLoginModal();
}

function showLoginModal() {
    document.getElementById('admin-login-modal').style.display = 'flex';
    document.getElementById('main-dashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('admin-login-modal').style.display = 'none';
    document.getElementById('main-dashboard').style.display = 'flex';
}

function getToken() {
    // Use separate key for admin authentication
    const tokenObj = localStorage.getItem('adminAuthToken');
    if (tokenObj) {
        try {
            const parsed = JSON.parse(tokenObj);
            return parsed.token || '';
        } catch (e) {
            // If not JSON, treat as plain string
            return tokenObj || '';
        }
    }
    return '';
}

/**
 * Set admin name across all UI elements (topbar, sidebar, avatar)
 */
function setAdminName(username) {
    const initials = username.slice(0, 2).toUpperCase();

    const el = document.getElementById('current-admin-name');
    if (el) el.textContent = username;

    const topbarName = document.getElementById('admin-name-topbar');
    if (topbarName) topbarName.textContent = username;

    const dropdownName = document.getElementById('avatar-dropdown-name');
    if (dropdownName) dropdownName.textContent = username;

    const topbarInitials = document.getElementById('topbar-avatar-initials');
    if (topbarInitials) topbarInitials.textContent = initials;

    const sidebarInitials = document.getElementById('sidebar-avatar-initials');
    if (sidebarInitials) sidebarInitials.textContent = initials;
}
