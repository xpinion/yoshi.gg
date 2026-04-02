// nav.js

// 1. Define all your pages here
const pages = [
  { name: 'INDEX', url: 'index.html' },
  { name: 'MAIN', url: 'main.html' },
  { name: 'METADATA', url: 'metadata.html' },
  { name: 'MASTER', url: 'master.html' },
  { name: 'GOTY', url: 'goty.html' },
  { name: 'BTY', url: 'bty.html' },
  { name: 'SHMUP', url: 'shmup.html' },
  { name: 'MONTHLY', url: 'monthly.html' },
  { name: 'YEARLY', url: 'yearly.html' },
  { name: 'SERIES', url: 'series.html' },
  { name: 'HISTORY', url: 'history.html' },
  { name: 'DETAILS', url: 'details.html' },
  { name: 'CHART', url: 'chart.html' },
  { name: 'TOP 100', url: 'top100.html' },
  { name: 'TOP 25', url: 'top25.html' },
  { name: 'METRICS', url: 'metrics.html' },
  { name: 'GENRE', url: 'genre.html' },
  { name: 'DEVELOPER', url: 'developer.html' },
  { name: 'PUBLISHER', url: 'publisher.html' },
  { name: 'RELEASE', url: 'release.html' }
];

document.addEventListener("DOMContentLoaded", () => {
  // 2. Figure out which page we are currently on
  // This grabs the very end of the URL (e.g., "goty.html")
  let currentPage = window.location.pathname.split("/").pop();
  
  // If the URL is just "yoshi.gg/" with no file name, default to index.html
  if (currentPage === "") {
    currentPage = "index.html";
  }

  // 3. Build the links
  let navLinksHTML = pages.map(page => {
    // Check if this specific link is the page we are on
    let isActive = (currentPage === page.url);
    
    // If active: Bold, underlined, with a white background pill
    // If inactive: Normal weight, no underline
    let linkStyle = isActive 
      ? "margin: 5px; color: #000; text-decoration: underline; font-weight: 900; font-size: 16px; background-color: #ffffff; padding: 4px 8px; border-radius: 4px;"
      : "margin: 5px; color: #000; text-decoration: none; font-weight: normal; font-size: 16px; padding: 4px 8px;";
      
    return `<a href="${page.url}" style="${linkStyle}">${page.name}</a>`;
  }).join('');

  // 4. Wrap the links in the navigation bar container
  const headerHTML = `
    <nav style="background: #00ffff; padding: 15px; text-align: center; font-family: Courier New, monospace; border-bottom: 2px solid #000; display: flex; flex-wrap: wrap; justify-content: center;">
      ${navLinksHTML}
    </nav>
  `;

  // 5. Inject it into the page
  const headerPlaceholder = document.getElementById("main-header");
  if (headerPlaceholder) {
    headerPlaceholder.innerHTML = headerHTML;
  }
});
