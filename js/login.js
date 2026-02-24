//login.js
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://alina906vibes-backend.onrender.com";
  const loginForm = document.getElementById("loginForm");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Login failed. Please check your credentials.");
        return;
      }

      // ✅ Save token and user info
      alert("✅ Login successful!");
      localStorage.setItem("userToken", data.token);
      localStorage.setItem("token", data.token);
      localStorage.setItem("loggedInUser", JSON.stringify(data));

      // ✅ Check for redirect parameter
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get("redirect");

      if (redirect) {
        window.location.href = decodeURIComponent(redirect);
        return;
      }

      // ✅ Fallback redirect based on role
      if (data.role === "admin") {
        window.location.href = "admin.html";
      } else {
        window.location.href = "index.html";
      }

    } catch (err) {
      console.error("Login error:", err);
      alert("⚠️ Something went wrong. Please try again.");
    }
  });
});
