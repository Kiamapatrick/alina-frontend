// Store token if backend redirects with it
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token");

if (token) {
  localStorage.setItem("authToken", token);
  console.log("Token stored after KYC rejection page load");
}

// Optional: You can auto redirect or trigger UI updates later
console.log("User is on rejected page");