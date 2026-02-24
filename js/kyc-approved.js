// Read token from URL if present
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token");

// If backend redirects with token, store it
if (token) {
  localStorage.setItem("authToken", token);
  console.log("Token stored after KYC approval");
}

// Optional: You can auto redirect after few seconds
setTimeout(() => {
  console.log("Ready to redirect user if needed");
}, 3000);