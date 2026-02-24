document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("userToken");
  if (!token) {
    alert("You must be logged in as admin");
    window.location.href = "index.html";
    return;
  }

  // ✅ Backend base URL (adjust if hosted elsewhere)
  const backendURL =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://alina906vibes-backend.onrender.com";

  fetchPendingKycs();

  async function fetchPendingKycs() {
    try {
      const res = await fetch(`${backendURL}/api/admin/kyc/submissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error("Failed to fetch KYC submissions");

      const tbody = document.getElementById("kycBody");
      tbody.innerHTML = "";

      data.submissions.forEach((user) => {
        // ✅ Always prepend backendURL to file paths
        const documentUrl = `${backendURL}${user.kyc.documentUrl}`;
        const selfieUrl = `${backendURL}${user.kyc.selfieUrl}`;

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td><a href="${documentUrl}" target="_blank">View Document</a></td>
          <td><a href="${selfieUrl}" target="_blank">View Selfie</a></td>
          <td>${new Date(user.kyc.uploadedAt).toLocaleString()}</td>
          <td>
            <button class="approve" data-id="${user._id}">Approve</button>
            <button class="reject" data-id="${user._id}">Reject</button>
          </td>
        `;
        tbody.appendChild(row);
      });

      setupActionButtons();
    } catch (err) {
      console.error("Fetch KYC error:", err);
    }
  }

  function setupActionButtons() {
    document.querySelectorAll(".approve").forEach((btn) => {
      btn.onclick = async () => handleAction(btn.dataset.id, "approve");
    });

    document.querySelectorAll(".reject").forEach((btn) => {
      btn.onclick = async () => handleAction(btn.dataset.id, "reject");
    });
  }

  async function handleAction(userId, action) {
    const confirmAction = confirm(`Are you sure you want to ${action} this KYC?`);
    if (!confirmAction) return;

    const res = await fetch(`${backendURL}/api/admin/kyc/${action}/${userId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    alert(data.message || `${action} completed`);
    fetchPendingKycs(); // Refresh table
  }
});
