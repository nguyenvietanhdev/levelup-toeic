// Ghép dashboard.html (shell) với các file partials/ theo marker <!-- @include('partials/x.html') -->.
// Đọc lại mỗi request (admin dashboard ít traffic, không cần cache) để luôn phản ánh file mới nhất.
const fs = require('fs');
const path = require('path');

const ADMIN_DIR = path.join(__dirname, '..', 'public', 'admin');
const SHELL_PATH = path.join(ADMIN_DIR, 'dashboard.html');
// \r? ở cuối: repo bật core.autocrlf nên máy Windows checkout ra CRLF. Thiếu nó
// thì marker không khớp, dashboard render ra vỏ rỗng (không lỗi, chỉ trắng trang).
const INCLUDE_RE = /^(\s*)<!-- @include\('(.+?)'\) -->\r?$/;

// Tách dòng theo cả LF lẫn CRLF để không dính \r vào cuối mỗi dòng.
function splitLines(text) {
  return text.split(/\r?\n/);
}

function renderAdminDashboard() {
  const shell = fs.readFileSync(SHELL_PATH, 'utf8');
  const out = [];

  for (const line of splitLines(shell)) {
    const match = line.match(INCLUDE_RE);
    if (!match) {
      out.push(line);
      continue;
    }
    const relPath = match[2];
    const partialPath = path.join(ADMIN_DIR, relPath);
    if (!partialPath.startsWith(ADMIN_DIR)) {
      throw new Error(`Invalid partial path: ${relPath}`);
    }
    const content = fs.readFileSync(partialPath, 'utf8').replace(/\r?\n$/, '');
    out.push(...splitLines(content));
  }

  return out.join('\n');
}

module.exports = { renderAdminDashboard };
