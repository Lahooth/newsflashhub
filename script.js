// =========================
// Global Config & Helpers
// =========================

// Google News RSS feeds
const NEWS_FEEDS = {
  top: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en",
  tech: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en",
  sports: "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en",
  business: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en",
  world: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-IN&gl=IN&ceid=IN:en"
};

// How many articles to show per batch for infinite scroll
const PAGE_SIZE = 10;

// Store fetched articles and how many have been rendered
const articlesByCategory = {
  top: [],
  tech: [],
  sports: [],
  business: [],
  world: []
};

const renderIndexByCategory = {
  top: 0,
  tech: 0,
  sports: 0,
  business: 0,
  world: 0
};

let activeCategory = "top";

function $(selector) {
  return document.querySelector(selector);
}

function formatDateTime(date) {
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// =========================
// Image helper (lazy loading)
// =========================

function createNewsImage(article) {
  const img = document.createElement("img");

  if (article.imageUrl) {
    img.src = article.imageUrl;
  } else {
    // If you don't want placeholders, just hide the <img>
    img.style.display = "none";
  }

  img.alt = article.title || "News image";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.classList.add("news-image");

  return img;
}

// =========================
// Fetch & parse RSS using rss2json
// =========================

async function fetchRSS(rssUrl) {
  // rss2json endpoint
  const apiUrl =
    "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(rssUrl);

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("RSS network error");

    const data = await res.json();
    const items = (data.items || []).slice(0, 60);

    return items.map((item) => {
      const title = item.title || "Untitled";
      const link = item.link || "#";
      const description = item.description || item.content || "";
      const pubDate = item.pubDate || "";
      const source = data.feed?.title || "News";

      // Try enclosure thumbnail, then generic thumbnail
      let imageUrl = "";
      if (item.enclosure && item.enclosure.link) {
        imageUrl = item.enclosure.link;
      } else if (item.thumbnail) {
        imageUrl = item.thumbnail;
      }

      return {
        title,
        link,
        description,
        pubDate,
        source,
        imageUrl
      };
    });
  } catch (err) {
    console.error("Failed to fetch RSS:", rssUrl, err);
    return [];
  }
}

// =========================
// Render helpers
// =========================

function createNewsCard(article) {
  const card = document.createElement("article");
  card.className = "news-card";

  const img = createNewsImage(article);
  if (img.style.display !== "none") {
    card.appendChild(img);
  }

  const body = document.createElement("div");
  body.className = "news-body";

  const titleEl = document.createElement("h3");
  titleEl.className = "news-title";
  titleEl.textContent = article.title || "Untitled";

  const descEl = document.createElement("p");
  descEl.className = "news-description";
  if (article.description) {
    const tmp = document.createElement("div");
    tmp.innerHTML = article.description;
    const text = tmp.textContent || tmp.innerText || "";
    descEl.textContent = text.trim().slice(0, 220) + (text.length > 220 ? "…" : "");
  }

  const metaEl = document.createElement("div");
  metaEl.className = "news-meta";
  const dateObj = article.pubDate ? new Date(article.pubDate) : null;
  metaEl.textContent = [
    article.source || "",
    dateObj ? " · " + dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""
  ].join("");

  const linkEl = document.createElement("a");
  linkEl.className = "read-more";
  linkEl.href = article.link || "#";
  linkEl.target = "_blank";
  linkEl.rel = "noopener noreferrer";
  linkEl.textContent = "Read full story";

  body.appendChild(titleEl);
  if (descEl.textContent.trim()) body.appendChild(descEl);
  if (metaEl.textContent.trim()) body.appendChild(metaEl);
  body.appendChild(linkEl);

  card.appendChild(body);

  return card;
}

function renderNextPage(category, container) {
  const allArticles = articlesByCategory[category];
  if (!allArticles || !allArticles.length) return;

  const start = renderIndexByCategory[category];
  const end = Math.min(start + PAGE_SIZE, allArticles.length);
  const slice = allArticles.slice(start, end);

  slice.forEach(article => {
    const card = createNewsCard(article);
    container.appendChild(card);
  });

  renderIndexByCategory[category] = end;
}

// =========================
// Load a category
// =========================

async function loadCategory(categoryKey, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<p class="loading-msg">Loading ${categoryKey} news…</p>`;

  const rssUrl = NEWS_FEEDS[categoryKey];
  const items = await fetchRSS(rssUrl);

  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `<p class="error-msg">Unable to load ${categoryKey} news right now.</p>`;
    return;
  }

  articlesByCategory[categoryKey] = items;
  renderIndexByCategory[categoryKey] = 0;
  renderNextPage(categoryKey, container);
}

// =========================
// Infinite scroll
// =========================

function mapSectionIdToCategory(sectionId) {
  switch (sectionId) {
    case "top-headlines":
      return "top";
    case "technology":
      return "tech";
    case "sports":
      return "sports";
    case "business":
      return "business";
    case "world":
      return "world";
    default:
      return null;
  }
}

function setupInfiniteScroll() {
  window.addEventListener("scroll", () => {
    const activeSection = document.querySelector(".news-section.active");
    if (!activeSection) return;

    const containerId = activeSection.id + "-list"; // e.g. top-headlines -> top-headlines-list
    const container = document.getElementById(containerId);
    if (!container) return;

    const rect = activeSection.getBoundingClientRect();
    if (rect.bottom - window.innerHeight < 400) {
      const catKey = mapSectionIdToCategory(activeSection.id);
      if (catKey) {
        renderNextPage(catKey, container);
      }
    }
  });
}

// =========================
// Nav tabs
// =========================

function initNavTabs() {
  const buttons = document.querySelectorAll(".nav-btn");
  const sections = document.querySelectorAll(".news-section");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-section"); // e.g. top-headlines
      activeCategory = mapSectionIdToCategory(target) || "top";

      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      sections.forEach(sec => {
        if (sec.id === target) {
          sec.classList.add("active");
        } else {
          sec.classList.remove("active");
        }
      });
    });
  });
}

// =========================
// Weather (Open-Meteo + geolocation)
// =========================

async function loadWeather(lat, lon) {
  const locEl = $("#weather-location");
  const tempEl = $("#weather-temp");
  const descEl = $("#weather-desc");
  const extraEl = $("#weather-extra");
  const astroEl = $("#weather-astro");
  const forecastContainer = $("#weather-forecast");

  if (locEl) locEl.textContent = "Loading weather…";

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,` +
      `sunrise,sunset,apparent_temperature_max,apparent_temperature_min&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather API error");

    const data = await res.json();
    const current = data.current_weather;
    const daily = data.daily;

    const temp = current.temperature;
    const feelsLike = daily.apparent_temperature_max[0];

    if (locEl) locEl.textContent = `Your location`;
    if (tempEl) tempEl.textContent = `${Math.round(temp)}°C (Feels like ${Math.round(feelsLike)}°C)`;

    if (descEl) {
      descEl.textContent = `Wind ${current.windspeed} km/h`;
    }

    if (extraEl) {
      extraEl.textContent = `Updated at ${formatDateTime(new Date(current.time))}`;
    }

    if (astroEl) {
      const sunrise = new Date(daily.sunrise[0]);
      const sunset = new Date(daily.sunset[0]);
      astroEl.textContent =
        `Sunrise: ${sunrise.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ` +
        `Sunset: ${sunset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      applyAutoDarkMode(sunrise, sunset);
    }

    if (forecastContainer) {
      forecastContainer.innerHTML = "";
      for (let i = 0; i < daily.time.length; i++) {
        const dayEl = document.createElement("div");
        dayEl.className = "forecast-day";

        const date = new Date(daily.time[i]);
        const maxT = daily.temperature_2m_max[i];
        const minT = daily.temperature_2m_min[i];

        dayEl.innerHTML = `
          <div class="forecast-date">${date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>
          <div class="forecast-temp">${Math.round(minT)}° / ${Math.round(maxT)}°C</div>
        `;
        forecastContainer.appendChild(dayEl);
      }
    }
  } catch (err) {
    console.error("Weather error:", err);
    if (locEl) locEl.textContent = "Weather unavailable";
  }
}

function applyAutoDarkMode(sunrise, sunset) {
  const now = new Date();
  const body = document.body;
  if (!body) return;

  const isNight = now < sunrise || now > sunset;
  if (isNight) body.classList.add("dark-mode-auto");
  else body.classList.remove("dark-mode-auto");
}

function initWeather() {
  if (!navigator.geolocation) {
    // fallback (Delhi)
    loadWeather(28.6139, 77.2090);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      loadWeather(latitude, longitude);
    },
    () => {
      loadWeather(28.6139, 77.2090);
    },
    { timeout: 8000 }
  );
}

// =========================
// Sidebar widgets
// =========================

async function loadTrendingSearches() {
  const list = $("#trending-list");
  if (!list) return;

  list.innerHTML = "<li>Loading trending searches…</li>";

  try {
    const rssUrl = "https://trends.google.com/trends/trendingsearches/daily?geo=IN&hl=en-US&ns=15";
    const apiUrl = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(rssUrl);
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Trending RSS error");

    const data = await res.json();
    const items = (data.items || []).slice(0, 10);

    if (!items.length) throw new Error("No trending items");

    list.innerHTML = "";
    items.forEach(item => {
      const li = document.createElement("li");
      li.innerHTML = `<a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>`;
      list.appendChild(li);
    });
  } catch (err) {
    console.error("Trending error:", err);
    list.innerHTML = `
      <li>Unable to load live trending searches.</li>
      <li>Cricket World Cup</li>
      <li>Gold price today</li>
      <li>Tech layoffs</li>
      <li>IPL schedule</li>
    `;
  }
}

async function loadCricketUpdates() {
  const list = $("#cricket-list");
  if (!list) return;

  // Static sample data – can be replaced with real API
  const updates = [
    "Upcoming: India vs South Africa – 1st Test",
    "T20 League: Chennai qualify for playoffs",
    "Player Watch: Gill in top form this series"
  ];

  list.innerHTML = "";
  updates.forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  });
}

async function loadMarketSnapshot() {
  const list = $("#market-list");
  if (!list) return;

  const markets = [
    { name: "NIFTY 50", value: "22,800", change: "+0.45%" },
    { name: "SENSEX", value: "75,100", change: "+0.32%" },
    { name: "NASDAQ", value: "17,900", change: "-0.21%" }
  ];

  list.innerHTML = "";
  markets.forEach(mkt => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${mkt.name}</strong>: ${mkt.value} <span class="${
      mkt.change.startsWith("+") ? "pos" : "neg"
    }">${mkt.change}</span>`;
    list.appendChild(li);
  });
}

async function loadYouTubeTrending() {
  const list = $("#youtube-list");
  if (!list) return;

  list.innerHTML = "<li>Loading video stories…</li>";

  try {
    const rssUrl = "https://www.youtube.com/feeds/videos.xml?chart=mostPopular&regionCode=IN";
    const apiUrl = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(rssUrl);
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("YouTube RSS error");

    const data = await res.json();
    const entries = (data.items || []).slice(0, 8);

    if (!entries.length) throw new Error("No videos");

    list.innerHTML = "";
    entries.forEach(entry => {
      const title = entry.title || "Video";
      const link = entry.link || "#";
      const videoIdMatch = (entry.link || "").match(/v=([^&]+)/);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;
      const thumbUrl = videoId
        ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        : entry.thumbnail || "";

      const li = document.createElement("li");
      li.className = "youtube-item";

      const thumb = document.createElement("img");
      thumb.loading = "lazy";
      thumb.decoding = "async";
      thumb.referrerPolicy = "no-referrer";
      thumb.alt = title;
      if (thumbUrl) thumb.src = thumbUrl;
      else thumb.style.display = "none";

      const a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = title;

      li.appendChild(thumb);
      li.appendChild(a);
      list.appendChild(li);
    });
  } catch (err) {
    console.error("YouTube trending error:", err);
    list.innerHTML = "<li>Unable to load YouTube trending videos right now.</li>";
  }
}

// =========================
// Date and "last updated"
// =========================

function initMetaTimestamps() {
  const dateEl = $("#current-date");
  const updatedEl = $("#last-updated");

  const now = new Date();
  if (dateEl) {
    dateEl.textContent =
      "Today: " +
      now.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "short"
      });
  }
  if (updatedEl) {
    updatedEl.textContent = "Last updated: " + formatDateTime(now);
  }
}

// =========================
// Init
// =========================

document.addEventListener("DOMContentLoaded", async () => {
  initMetaTimestamps();
  initNavTabs();
  setupInfiniteScroll();
  initWeather();

  // Load each news category
  await Promise.all([
    loadCategory("top", "top-headlines-list"),
    loadCategory("tech", "tech-news-list"),
    loadCategory("sports", "sports-news-list"),
    loadCategory("business", "business-news-list"),
    loadCategory("world", "world-news-list")
  ]);

  // Sidebar widgets
  loadTrendingSearches();
  loadCricketUpdates();
  loadMarketSnapshot();
});
