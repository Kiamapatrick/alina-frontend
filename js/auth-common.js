// Shared password visibility toggle for auth pages
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.field-wrap').querySelector('input');
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.textContent = isHidden ? '🙈' : '👁️';
    });
  });
});

