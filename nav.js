// nav.js
const headerHTML = `
  <nav style="background: #00ffff; padding: 15px; text-align: center; font-family: Courier New, monospace; border-bottom: 2px solid #000;">
    <a href="index.html" style="margin: 0 15px; color: #000; text-decoration: none; font-weight: bold; font-size: 16px;">MASTER</a>
    <a href="goty.html" style="margin: 0 15px; color: #000; text-decoration: none; font-weight: bold; font-size: 16px;">GOTY</a>
    <a href="bty.html" style="margin: 0 15px; color: #000; text-decoration: none; font-weight: bold; font-size: 16px;">BTY</a>
    <a href="monthly.html" style="margin: 0 15px; color: #000; text-decoration: none; font-weight: bold; font-size: 16px;">MONTHLY</a>
  </nav>
`;

// Wait for the page to load, then insert the header
document.addEventListener("DOMContentLoaded", () => {
  const headerPlaceholder = document.getElementById("main-header");
  if (headerPlaceholder) {
    headerPlaceholder.innerHTML = headerHTML;
  }
});
