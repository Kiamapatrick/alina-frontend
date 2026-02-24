document.addEventListener("DOMContentLoaded", async () => {
  const video = document.getElementById("camera");
  const canvas = document.getElementById("preview");
  let selfieBlob = null;
  const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://alina906vibes-backend.onrender.com";
  // Extract userId from URL
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get("uid");
  const statusMsg = document.getElementById("statusMessage");

  if (!userId) {
    statusMsg.textContent = "⚠️ Missing user ID in URL.";
    document.getElementById("kycForm").style.display = "none";
    return;
  }

  // Access device camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (err) {
    alert("Camera access denied or not available.");
    console.error(err);
  }

  // Capture button
  document.getElementById("captureBtn").addEventListener("click", () => {
    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      selfieBlob = blob; // Save captured selfie for upload
      statusMsg.textContent = "✅ Selfie captured!";
    }, "image/jpeg");
  });

  // Form submission
  const form = document.getElementById("kycForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const documentFile = document.getElementById("document").files[0];
    const documentType = document.getElementById("documentType").value;

    if (!documentFile) {
      statusMsg.textContent = "Please upload your ID or passport.";
      return;
    }
    if (!selfieBlob) {
      statusMsg.textContent = "Please capture your selfie.";
      return;
    }

    const formData = new FormData();
    formData.append("document", documentFile);
    formData.append("selfie", selfieBlob, "selfie.jpg");
    formData.append("documentType", documentType);

    try {
      statusMsg.textContent = "⏳ Uploading, please wait...";

      const res = await fetch(`${API_BASE}/api/auth/kyc-upload/${userId}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

if (res.ok) {
  statusMsg.textContent = "✅ Verification submitted successfully!";
  form.reset();
  selfieBlob = null;

  // Redirect after short delay
  setTimeout(() => {
    window.location.href = "index.html";
  }, 1500); // 1.5 seconds delay so user sees the success message
} else {
  statusMsg.textContent = `❌ Error: ${data.message || data.error || "Upload failed."}`;
}

    } catch (err) {
      console.error(err);
      statusMsg.textContent = "⚠️ Network or server error.";
    }
  });
});
