// signup.js — Premium interactive signup
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE =
    window.location.hostname === "localhost"
      ? "http://localhost:5000"
      : "https://alina906vibes-backend.onrender.com";

  const form = document.getElementById("signupForm");
  const btn = document.getElementById("signupBtn");
  const statusMsg = document.getElementById("statusMsg");

  if (!form) return;

  // Password toggle
  const toggle = document.querySelector(".password-toggle");
  const pwField = document.getElementById("signupPassword");
  if (toggle && pwField) {
    toggle.addEventListener("click", () => {
      const isPassword = pwField.type === "password";
      pwField.type = isPassword ? "text" : "password";
      toggle.textContent = isPassword ? "🙈" : "👁";
    });
  }

  // Status helpers
  function showStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className = `status-msg ${type}`;
  }

  function clearStatus() {
    statusMsg.className = "status-msg";
    statusMsg.textContent = "";
  }

  function setLoading(loading) {
    btn.disabled = loading;
    btn.classList.toggle("loading", loading);
  }

  // Form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus();

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = pwField.value;

    if (!username || !email || !password) {
      showStatus("Please fill in all fields.", "error");
      return;
    }

    if (password.length < 6) {
      showStatus("Password must be at least 6 characters.", "error");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showStatus(data.message || "Signup failed. Please try again.", "error");
        setLoading(false);
        return;
      }

      // Success
      showStatus("Verification email sent! Check your inbox.", "success");
      btn.disabled = true;

      // Redirect to login after a moment
      setTimeout(() => {
        window.location.href = "login.html";
      }, 3000);
    } catch (err) {
      console.error("Signup error:", err);
      showStatus("Something went wrong. Please try again.", "error");
      setLoading(false);
    }
  });
});
