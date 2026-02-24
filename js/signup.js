// frontend/js/signup.js
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://alina906vibes-backend.onrender.com";
  const form = document.querySelector("#signupForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.querySelector("#username").value.trim();
    const email = document.querySelector("#signupEmail").value.trim();
    const password = document.querySelector("#signupPassword").value;

    if (!username || !email || !password) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: username, email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Signup failed");

      // ✅ Only notify user — no redirect
      alert("✅ Verification email sent. Please check your inbox to verify your account.");
      // Optionally redirect to login page after a short delay
      setTimeout(() => {
        window.location.href = "login.html";
      }, 2000);

    } catch (err) {
      alert("❌ " + err.message);
    }
  });
});
