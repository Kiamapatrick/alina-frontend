// login.js — Premium interactive login
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE =
    window.location.hostname === "localhost"
      ? "http://localhost:5000"
      : "https://alina906vibes-backend.onrender.com";

  const form = document.getElementById("loginForm");
  const btn = document.getElementById("loginBtn");
  const statusMsg = document.getElementById("statusMsg");

  // Password toggle
  const toggle = document.querySelector(".password-toggle");
  const pwField = document.getElementById("loginPassword");
  if (toggle && pwField) {
    toggle.addEventListener("click", () => {
      const isPassword = pwField.type === "password";
      pwField.type = isPassword ? "text" : "password";
      toggle.textContent = isPassword ? "🙈" : "🙊";
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

    const email = document.getElementById("loginEmail").value.trim();
    const password = pwField.value;

    if (!email || !password) {
      showStatus("Please fill in all fields.", "error");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showStatus(data.message || "Invalid email or password.", "error");
        setLoading(false);
        return;
      }

      // Success
      showStatus("Login successful! Redirecting…", "success");
      localStorage.setItem("userToken", data.token);
      localStorage.setItem("token", data.token);
      localStorage.setItem("loggedInUser", JSON.stringify(data));

      // Check for redirect parameter
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get("redirect");

      setTimeout(() => {
        if (redirect) {
          window.location.href = decodeURIComponent(redirect);
        } else if (data.role === "admin") {
          window.location.href = "admin.html";
        } else {
          window.location.href = "index.html";
        }
      }, 600);
    } catch (err) {
      console.error("Login error:", err);
      showStatus("Something went wrong. Please try again.", "error");
      setLoading(false);
    }
  });
});
