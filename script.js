/* ========================================================
   CLIMATELENS - GLOBAL CLIMATE EXPLORER & INTELLIGENCE
   Interactive Maps, Real-time Weather, AQI, Carbon Tools &
   10-Question Climate Awareness Survey with Google Forms-Style Analytics
======================================================== */

// DOM Elements
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

const searchForm = document.getElementById("locationSearch");
const locationInput = document.getElementById("locationInput");
const searchButton = document.getElementById("searchButton");
const geoBtn = document.getElementById("geoBtn");
const searchMessage = document.getElementById("searchMessage");
const searchResults = document.getElementById("searchResults");

const dashboardPlaceholder = document.getElementById("dashboardPlaceholder");
const dashboardActiveContent = document.getElementById("dashboardActiveContent");

// Survey DOM Elements
const tabBtnSurvey = document.getElementById("tabBtnSurvey");
const tabBtnAnalytics = document.getElementById("tabBtnAnalytics");
const surveyFormTab = document.getElementById("surveyFormTab");
const surveyAnalyticsTab = document.getElementById("surveyAnalyticsTab");
const climateSurveyForm = document.getElementById("climateSurveyForm");
const surveyQuestionsList = document.getElementById("surveyQuestionsList");
const surveyFeedback = document.getElementById("surveyFeedback");
const surveySubmitBtn = document.getElementById("surveySubmitBtn");
const refreshAnalyticsBtn = document.getElementById("refreshAnalyticsBtn");
const printAnalyticsBtn = document.getElementById("printAnalyticsBtn");

// Global Map & Chart references
let leafletMapInstance = null;
let leafletMarkerInstance = null;
let climateChartInstance = null;
let currentClimateData = null;
let surveyChartInstances = {};


// ---------------- MOBILE MENU ----------------

if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
        const open = navLinks.classList.toggle("open");
        menuToggle.setAttribute("aria-expanded", String(open));
        menuToggle.textContent = open ? "✕" : "☰";
    });

    navLinks.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            navLinks.classList.remove("open");
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.textContent = "☰";
        });
    });
}


// ---------------- HELPER UTILITIES ----------------

function showMessage(message, isError = false) {
    if (searchMessage) {
        searchMessage.textContent = message;
        searchMessage.style.color = isError ? "#ff8c8c" : "#ffffff";
    }
}

function makeElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
}

async function getJSON(url) {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || "Request failed. Please try again.");
    }
    return data;
}

function formatDayName(dateStr) {
    try {
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch {
        return dateStr;
    }
}

function formatTime(isoStr) {
    if (!isoStr) return "--:--";
    try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return isoStr.split("T")[1] || isoStr;
    }
}


// ---------------- LOCATION SEARCH ----------------

async function searchLocations(query) {
    searchResults.replaceChildren();
    showMessage("Searching worldwide meteorological databases...");
    if (searchButton) searchButton.disabled = true;

    try {
        const searchTerm = query.trim();
        const data = await getJSON(`/api/search?q=${encodeURIComponent(searchTerm)}`);

        if (!data.results || data.results.length === 0) {
            showMessage("No locations found. Try entering a nearby major city or country.", true);
            return;
        }

        showMessage(`Found ${data.results.length} locations. Select one below:`);

        data.results.forEach(location => {
            const button = makeElement("button", "search-result");
            button.type = "button";

            const title = makeElement("span", "", location.name);
            const details = [location.admin1, location.country].filter(Boolean).join(", ");
            const subtitle = makeElement("small", "", details || `Lat: ${location.latitude}, Lon: ${location.longitude}`);
            title.appendChild(subtitle);

            const arrow = makeElement("span", "result-badge", "Inspect Climate →");
            button.append(title, arrow);

            button.addEventListener("click", () => {
                const place = [location.name, location.admin1, location.country].filter(Boolean).join(", ");
                loadClimate(location, place);
            });

            searchResults.appendChild(button);
        });

    } catch (error) {
        showMessage(error.message || "Search failed. Please try again.", true);
    } finally {
        if (searchButton) searchButton.disabled = false;
    }
}


// ---------------- GPS GEOLOCATION ----------------

if (geoBtn) {
    geoBtn.addEventListener("click", () => {
        if (!navigator.geolocation) {
            showMessage("Geolocation is not supported by your browser.", true);
            return;
        }

        showMessage("Detecting your location via GPS coordinates...");
        geoBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(
            async position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                try {
                    showMessage("Resolving your city name...");
                    const revData = await getJSON(`/api/reverse?lat=${lat}&lon=${lon}`);
                    loadClimate({ latitude: lat, longitude: lon }, revData.place);
                } catch {
                    loadClimate({ latitude: lat, longitude: lon }, `My Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`);
                } finally {
                    geoBtn.disabled = false;
                }
            },
            error => {
                geoBtn.disabled = false;
                let msg = "Could not access location.";
                if (error.code === 1) msg = "Location permission denied. Please search manually.";
                else if (error.code === 2) msg = "Location unavailable. Please search manually.";
                showMessage(msg, true);
            },
            { timeout: 10000 }
        );
    });
}


// ---------------- LOAD CLIMATE DATA ----------------

async function loadClimate(location, place) {
    showMessage(`Retrieving live climate & air quality data for ${place}...`);
    searchResults.replaceChildren();

    try {
        const params = new URLSearchParams({
            lat: location.latitude,
            lon: location.longitude,
            place: place
        });

        const data = await getJSON(`/api/climate?${params.toString()}`);
        currentClimateData = data;

        showMessage(`Weather & Climate loaded for ${data.place}.`);

        renderClimate(data);
        await loadHistory();

        const dashboard = document.getElementById("dashboard");
        if (dashboard) {
            dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
        }

    } catch (error) {
        showMessage(error.message || "Could not load climate data.", true);
    }
}


// ---------------- RENDER CLIMATE DASHBOARD ----------------

function renderClimate(data) {
    if (dashboardPlaceholder) dashboardPlaceholder.style.display = "none";
    if (dashboardActiveContent) {
        dashboardActiveContent.style.display = "block";
        dashboardActiveContent.replaceChildren();
    }

    const current = data.current || {};
    const forecast = data.forecast || {};
    const aqi = data.air_quality || {};
    const insights = data.climate_insights || {};

    // 1. Dashboard Header
    const header = makeElement("div", "dashboard-header");
    const headerLeft = makeElement("div", "header-left");
    headerLeft.appendChild(makeElement("span", "eyebrow", "GLOBAL CLIMATE OBSERVATION"));
    headerLeft.appendChild(makeElement("h2", "location-title", data.place));
    
    const coordP = makeElement("p", "meta-details", 
        `Coordinates: ${data.latitude.toFixed(2)}°N, ${data.longitude.toFixed(2)}°E | Timezone: ${data.timezone || "Local"}`
    );
    headerLeft.appendChild(coordP);

    const headerRight = makeElement("div", "header-actions");
    const exportBtn = makeElement("button", "btn-outline", "🖨️ Export / Print Report");
    exportBtn.type = "button";
    exportBtn.addEventListener("click", () => window.print());
    headerRight.appendChild(exportBtn);

    header.append(headerLeft, headerRight);
    dashboardActiveContent.appendChild(header);

    // 2. Hero Weather & Climate Summary Card
    const heroCard = makeElement("div", "climate-hero-card");
    const heroMain = makeElement("div", "hero-weather-main");

    const iconSpan = makeElement("div", "hero-weather-icon", current.weather_icon || "🌤️");
    const tempGroup = makeElement("div", "hero-temp-group");
    const tempValue = makeElement("div", "hero-temperature", `${current.temperature_2m ?? "--"}°C`);
    const condText = makeElement("div", "hero-condition", current.weather_description || "Clear");
    const feelsLike = makeElement("div", "hero-feels", `Feels like ${current.apparent_temperature ?? "--"}°C`);
    tempGroup.append(tempValue, condText, feelsLike);

    heroMain.append(iconSpan, tempGroup);

    const badgeRow = makeElement("div", "hero-badges");
    const heatBadge = makeElement("span", "status-badge", `Thermal Comfort: ${insights.heat_stress || "Normal"}`);
    if (insights.heat_stress && insights.heat_stress.includes("Heat")) {
        heatBadge.classList.add("badge-warning");
    } else {
        heatBadge.classList.add("badge-safe");
    }

    const rainRiskBadge = makeElement("span", "status-badge", `Rain Risk: ${insights.rain_risk || "Low"}`);
    if (insights.rain_risk === "Elevated") rainRiskBadge.classList.add("badge-info");
    else rainRiskBadge.classList.add("badge-safe");

    badgeRow.append(heatBadge, rainRiskBadge);

    heroCard.append(heroMain, badgeRow);
    dashboardActiveContent.appendChild(heroCard);

    // 3. Key Metrics Grid
    const metricsGrid = makeElement("div", "weather-grid");
    const metricItems = [
        { label: "Humidity", val: current.relative_humidity_2m != null ? `${current.relative_humidity_2m}%` : "--", icon: "💧", sub: "Atmospheric moisture" },
        { label: "Wind Velocity", val: current.wind_speed_10m != null ? `${current.wind_speed_10m} km/h` : "--", icon: "💨", sub: `Dir: ${current.wind_direction_10m ?? 0}°` },
        { label: "Surface Pressure", val: current.surface_pressure != null ? `${current.surface_pressure} hPa` : "--", icon: "🧭", sub: "Barometric reading" },
        { label: "UV Index Max", val: insights.max_uv != null ? `${insights.max_uv} (${insights.uv_status})` : "--", icon: "☀️", sub: "Solar radiation danger" },
        { label: "Precipitation", val: current.precipitation != null ? `${current.precipitation} mm` : "0 mm", icon: "🌧️", sub: `Today's rainfall sum` },
        { label: "Sunrise / Sunset", val: `${formatTime(forecast.sunrise?.[0])} / ${formatTime(forecast.sunset?.[0])}`, icon: "🌅", sub: "Solar day cycle" }
    ];

    metricItems.forEach(m => {
        const card = makeElement("article", "weather-card");
        const icon = makeElement("span", "weather-icon", m.icon);
        const lbl = makeElement("p", "weather-label", m.label);
        const val = makeElement("h3", "weather-value", m.val);
        const sub = makeElement("span", "weather-sub", m.sub);
        card.append(icon, lbl, val, sub);
        metricsGrid.appendChild(card);
    });
    dashboardActiveContent.appendChild(metricsGrid);

    // 4. AIR QUALITY INDEX (AQI)
    const aqiCard = makeElement("div", "aqi-card");
    aqiCard.id = "aqiSection";

    const aqiHeader = makeElement("div", "aqi-header");
    aqiHeader.appendChild(makeElement("h3", "", "Atmospheric Air Quality & Environmental Impact"));
    aqiHeader.appendChild(makeElement("p", "chart-note", "Real-time measurements from Open-Meteo Air Quality & CAMS models."));
    aqiCard.appendChild(aqiHeader);

    const aqiRow = makeElement("div", "aqi-row");
    
    const aqiBadgeBox = makeElement("div", "aqi-badge-box");
    const aqiScore = makeElement("div", "aqi-score", aqi.us_aqi != null ? String(aqi.us_aqi) : "N/A");
    aqiScore.style.backgroundColor = aqi.color || "#2b9348";

    const aqiLevel = makeElement("h4", "aqi-level-text", aqi.label || "Data Unavailable");
    aqiLevel.style.color = aqi.color || "#073d35";

    const aqiAdvisory = makeElement("p", "aqi-advisory", getAqiAdvisory(aqi.us_aqi));
    aqiBadgeBox.append(aqiScore, aqiLevel, aqiAdvisory);
    aqiRow.appendChild(aqiBadgeBox);

    const aqMetrics = aqi.metrics || {};
    const pollGrid = makeElement("div", "pollutants-grid");
    const pollutants = [
        { name: "PM2.5", val: aqMetrics.pm2_5 != null ? `${aqMetrics.pm2_5} µg/m³` : "--", desc: "Fine inhalable particles" },
        { name: "PM10", val: aqMetrics.pm10 != null ? `${aqMetrics.pm10} µg/m³` : "--", desc: "Coarse dust & smoke" },
        { name: "Ozone (O₃)", val: aqMetrics.ozone != null ? `${aqMetrics.ozone} µg/m³` : "--", desc: "Ground-level oxidant" },
        { name: "NO₂", val: aqMetrics.nitrogen_dioxide != null ? `${aqMetrics.nitrogen_dioxide} µg/m³` : "--", desc: "Vehicle exhaust emissions" },
        { name: "SO₂", val: aqMetrics.sulphur_dioxide != null ? `${aqMetrics.sulphur_dioxide} µg/m³` : "--", desc: "Industrial sulfur release" },
        { name: "CO", val: aqMetrics.carbon_monoxide != null ? `${aqMetrics.carbon_monoxide} µg/m³` : "--", desc: "Combustion byproduct" }
    ];

    pollutants.forEach(p => {
        const item = makeElement("div", "pollutant-item");
        item.appendChild(makeElement("span", "pollutant-name", p.name));
        item.appendChild(makeElement("strong", "pollutant-val", p.val));
        item.appendChild(makeElement("small", "pollutant-desc", p.desc));
        pollGrid.appendChild(item);
    });

    aqiRow.appendChild(pollGrid);
    aqiCard.appendChild(aqiRow);
    dashboardActiveContent.appendChild(aqiCard);

    // 5. INTERACTIVE LEAFLET MAP
    const mapCard = makeElement("div", "map-card");
    mapCard.id = "mapSection";
    
    const mapHeader = makeElement("div", "map-header");
    mapHeader.appendChild(makeElement("h3", "", "Interactive World Climate Map"));
    mapHeader.appendChild(makeElement("p", "chart-note", "💡 Tip: Click anywhere on the map to inspect weather & climate at that exact point!"));
    mapCard.appendChild(mapHeader);

    const mapContainer = makeElement("div", "leaflet-map-container");
    mapContainer.id = "climateMap";
    mapCard.appendChild(mapContainer);

    dashboardActiveContent.appendChild(mapCard);
    renderLeafletMap(data.latitude, data.longitude, data.place, current);

    // 6. HISTORICAL CLIMATE TRENDS (Chart.js)
    const chartCard = makeElement("div", "chart-card");
    chartCard.id = "trendsSection";

    const chartHead = makeElement("div", "chart-card-header");
    chartHead.appendChild(makeElement("h3", "", "30-Day Meteorological Historical Trends"));
    chartHead.appendChild(makeElement("p", "chart-note", "Observed weather trends to analyze daily volatility and anomalies."));

    const chartSelect = document.createElement("select");
    chartSelect.id = "chartMetric";
    chartSelect.setAttribute("aria-label", "Select climate metric");

    [
        ["temperature_2m_mean", "Mean Temperature (°C)"],
        ["temperature_2m_max", "Maximum Temperature (°C)"],
        ["temperature_2m_min", "Minimum Temperature (°C)"],
        ["precipitation_sum", "Precipitation / Rainfall (mm)"]
    ].forEach(([val, label]) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = label;
        chartSelect.appendChild(opt);
    });

    chartHead.appendChild(chartSelect);
    chartCard.appendChild(chartHead);

    const chartWrapper = makeElement("div", "chart-container");
    const canvas = document.createElement("canvas");
    canvas.id = "climateChart";
    chartWrapper.appendChild(canvas);
    chartCard.appendChild(chartWrapper);

    dashboardActiveContent.appendChild(chartCard);
    renderChart(data.history, chartSelect.value);

    chartSelect.addEventListener("change", () => {
        renderChart(data.history, chartSelect.value);
    });

    // 7. 7-DAY WEATHER FORECAST
    const forecastCard = makeElement("div", "forecast-card");
    forecastCard.appendChild(makeElement("h3", "", "7-Day Meteorological Forecast"));
    
    const forecastGrid = makeElement("div", "forecast-cards-grid");
    const times = forecast.time || [];

    times.forEach((dayStr, idx) => {
        const card = makeElement("div", "forecast-day-card");
        const dayLabel = makeElement("span", "forecast-day-title", idx === 0 ? "Today" : formatDayName(dayStr));
        const icon = makeElement("span", "forecast-day-icon", forecast.weather_icons?.[idx] || "🌤️");
        const desc = makeElement("span", "forecast-day-desc", forecast.weather_descriptions?.[idx] || "Variable");
        
        const min = forecast.temperature_2m_min?.[idx];
        const max = forecast.temperature_2m_max?.[idx];
        const tempRange = makeElement("strong", "forecast-day-temp", `${min ?? "--"}° / ${max ?? "--"}°C`);
        
        const rainProb = forecast.precipitation_probability_max?.[idx];
        const rainBadge = makeElement("span", "forecast-day-rain", `💧 ${rainProb != null ? rainProb + '%' : "0%"}`);

        card.append(dayLabel, icon, desc, tempRange, rainBadge);
        forecastGrid.appendChild(card);
    });

    forecastCard.appendChild(forecastGrid);
    dashboardActiveContent.appendChild(forecastCard);

    // 8. Recent Searches Container
    const historySec = makeElement("div", "recent-searches");
    historySec.id = "recentSearches";
    dashboardActiveContent.appendChild(historySec);

    const sources = makeElement("p", "data-source", 
        "Verified Open Data: Open-Meteo Weather Forecast, Historical Archive, Copernicus CAMS & OpenStreetMap."
    );
    dashboardActiveContent.appendChild(sources);
}


// ---------------- ADVISORY TEXT HELPER ----------------

function getAqiAdvisory(aqi) {
    if (aqi == null) return "Air quality data currently not reporting for this station.";
    if (aqi <= 50) return "Air quality is satisfactory; air pollution poses little or no risk to outdoor activities.";
    if (aqi <= 100) return "Air quality is acceptable. Sensitive individuals should monitor respiratory symptoms.";
    if (aqi <= 150) return "Sensitive groups (children, elderly, asthmatics) should limit prolonged outdoor exertion.";
    if (aqi <= 200) return "Everyone may begin to experience health effects. Limit high-intensity outdoor exercises.";
    if (aqi <= 300) return "Health alert: High health risk for everyone. Wear N95 masks outdoors.";
    return "Health warning of emergency conditions. Entire population is affected. Remain indoors.";
}


// ---------------- LEAFLET MAP IMPLEMENTATION ----------------

function renderLeafletMap(lat, lon, placeName, current) {
    if (typeof L === "undefined") {
        const container = document.getElementById("climateMap");
        if (container) container.textContent = "Map library (Leaflet) is loading...";
        return;
    }

    const container = document.getElementById("climateMap");
    if (!container) return;

    if (leafletMapInstance) {
        leafletMapInstance.remove();
        leafletMapInstance = null;
    }

    try {
        leafletMapInstance = L.map("climateMap", {
            scrollWheelZoom: false
        }).setView([lat, lon], 10);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18
        }).addTo(leafletMapInstance);

        leafletMarkerInstance = L.marker([lat, lon]).addTo(leafletMapInstance);
        const popupText = `
            <div style="font-family: inherit; font-size: 13px; text-align: center;">
                <strong style="color: #087f5b; font-size: 14px;">${placeName}</strong><br>
                <span>${current.weather_icon || "🌤️"} ${current.temperature_2m ?? "--"}°C (${current.weather_description || "Clear"})</span><br>
                <small style="color: #657b75;">Lat: ${lat.toFixed(2)}, Lon: ${lon.toFixed(2)}</small>
            </div>
        `;
        leafletMarkerInstance.bindPopup(popupText).openPopup();

        leafletMapInstance.on("click", async (e) => {
            const clickLat = e.latlng.lat;
            const clickLon = e.latlng.lng;
            showMessage(`Querying coordinates (${clickLat.toFixed(2)}, ${clickLon.toFixed(2)})...`);

            try {
                const rev = await getJSON(`/api/reverse?lat=${clickLat}&lon=${clickLon}`);
                loadClimate({ latitude: clickLat, longitude: clickLon }, rev.place);
            } catch {
                loadClimate({ latitude: clickLat, longitude: clickLon }, `Point (${clickLat.toFixed(2)}, ${clickLon.toFixed(2)})`);
            }
        });

        setTimeout(() => {
            if (leafletMapInstance) leafletMapInstance.invalidateSize();
        }, 300);

    } catch (err) {
        console.error("Leaflet initialization error:", err);
    }
}


// ---------------- CHART.JS IMPLEMENTATION ----------------

function renderChart(history, metric) {
    const canvas = document.getElementById("climateChart");
    if (!canvas || !history) return;

    if (typeof Chart === "undefined") {
        canvas.parentElement.textContent = "Chart library is loading...";
        return;
    }

    const labels = (history.time || []).map(formatDayName);
    const values = history[metric] || [];

    if (climateChartInstance) {
        climateChartInstance.destroy();
    }

    const isRain = metric.includes("precipitation");
    const metricLabel = metric.replaceAll("_", " ").toUpperCase();
    const borderColor = isRain ? "#0077b6" : "#087f5b";
    const bgColor = isRain ? "rgba(0, 119, 182, 0.15)" : "rgba(8, 127, 91, 0.15)";

    climateChartInstance = new Chart(canvas, {
        type: isRain ? "bar" : "line",
        data: {
            labels: labels,
            datasets: [{
                label: `${metricLabel} (${isRain ? 'mm' : '°C'})`,
                data: values,
                borderColor: borderColor,
                backgroundColor: bgColor,
                fill: true,
                tension: 0.35,
                borderWidth: 2.5,
                borderRadius: isRain ? 4 : 0,
                pointRadius: isRain ? 0 : 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: "index"
            },
            plugins: {
                legend: {
                    position: "top",
                    labels: {
                        font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' }
                    }
                },
                tooltip: {
                    padding: 10,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 10,
                        font: { size: 11 }
                    },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        font: { size: 11 }
                    },
                    grid: { color: "rgba(0,0,0,0.05)" }
                }
            }
        }
    });
}


// ---------------- RECENT SEARCHES (SQLITE) ----------------

async function loadHistory() {
    let historySection = document.getElementById("recentSearches");
    if (!historySection) return;

    historySection.replaceChildren();

    const headDiv = makeElement("div", "history-header-flex");
    headDiv.appendChild(makeElement("h3", "", "Recent Searched Locations"));

    const clearBtn = makeElement("button", "btn-text-danger", "Clear History");
    clearBtn.type = "button";
    clearBtn.addEventListener("click", async () => {
        try {
            await fetch("/api/history/clear", { method: "POST" });
            loadHistory();
        } catch (e) {
            console.error("Clear history error:", e);
        }
    });
    headDiv.appendChild(clearBtn);
    historySection.appendChild(headDiv);

    try {
        const data = await getJSON("/api/history");

        if (!data.history || data.history.length === 0) {
            historySection.appendChild(makeElement("p", "chart-note", "Searched locations will appear here."));
            return;
        }

        const pillContainer = makeElement("div", "history-pills-wrap");
        data.history.forEach(item => {
            const button = makeElement("button", "history-button", `📍 ${item.place}`);
            button.type = "button";
            button.addEventListener("click", () => {
                loadClimate({ latitude: item.latitude, longitude: item.longitude }, item.place);
            });
            pillContainer.appendChild(button);
        });

        historySection.appendChild(pillContainer);

    } catch (err) {
        console.error("Could not load history:", err);
    }
}


// ---------------- CARBON FOOTPRINT CALCULATOR ----------------

function setupCarbonCalculator() {
    const commuteKm = document.getElementById("commuteKm");
    const commuteVal = document.getElementById("commuteVal");
    const transportMode = document.getElementById("transportMode");
    const electricityTier = document.getElementById("electricityTier");
    const dietType = document.getElementById("dietType");

    const carbonTotal = document.getElementById("carbonTotal");
    const carbonBar = document.getElementById("carbonBar");
    const targetStatus = document.getElementById("targetStatus");
    const tipsList = document.getElementById("tipsList");

    if (!commuteKm || !transportMode || !electricityTier || !dietType) return;

    function calculate() {
        const km = parseFloat(commuteKm.value) || 0;
        if (commuteVal) commuteVal.textContent = `${km} km/day`;

        const transportFactors = {
            petrol: 0.192,
            bike: 0.085,
            transit: 0.040,
            ev: 0.030,
            walk: 0
        };
        const annualTransportCO2 = km * (transportFactors[transportMode.value] ?? 0.04) * 300;

        const electricityFactors = {
            low: 600,
            medium: 1400,
            high: 2800
        };
        const annualElectricityCO2 = electricityFactors[electricityTier.value] ?? 1400;

        const dietFactors = {
            vegan: 900,
            vegetarian: 1200,
            moderate_meat: 2000,
            heavy_meat: 3200
        };
        const annualDietCO2 = dietFactors[dietType.value] ?? 1200;

        const totalCO2 = Math.round(annualTransportCO2 + annualElectricityCO2 + annualDietCO2);
        if (carbonTotal) carbonTotal.textContent = totalCO2.toLocaleString();

        const percentage = Math.min(Math.round((totalCO2 / 4500) * 100), 100);
        if (carbonBar) {
            carbonBar.style.width = `${percentage}%`;
            if (totalCO2 <= 2000) {
                carbonBar.style.backgroundColor = "#2b9348";
                if (targetStatus) {
                    targetStatus.textContent = "Sustainable (Within Paris Goal)";
                    targetStatus.className = "status-badge status-good";
                }
            } else if (totalCO2 <= 3000) {
                carbonBar.style.backgroundColor = "#e0a96d";
                if (targetStatus) {
                    targetStatus.textContent = "Moderate (Above Target)";
                    targetStatus.className = "status-badge status-moderate";
                }
            } else {
                carbonBar.style.backgroundColor = "#d90429";
                if (targetStatus) {
                    targetStatus.textContent = "High Footprint (Action Needed)";
                    targetStatus.className = "status-badge status-danger";
                }
            }
        }

        if (tipsList) {
            tipsList.replaceChildren();
            if (transportMode.value === "petrol") {
                const li = document.createElement("li");
                li.textContent = "🚗 Shifting from petrol car to public transit or cycling can save over 1,500 kg of CO₂ every year.";
                tipsList.appendChild(li);
            }
            if (electricityTier.value === "high") {
                const li = document.createElement("li");
                li.textContent = "⚡ Optimizing AC thermostat to 24°C and adopting solar cuts household emissions by up to 40%.";
                tipsList.appendChild(li);
            }
            if (dietType.value === "heavy_meat") {
                const li = document.createElement("li");
                li.textContent = "🥗 Adopting meatless days or a vegetarian diet spares up to 1,200 kg CO₂ per year.";
                tipsList.appendChild(li);
            }
            const generalLi = document.createElement("li");
            generalLi.textContent = "🌱 Planting native trees and minimizing single-use plastics directly benefits local biodiversity.";
            tipsList.appendChild(generalLi);
        }
    }

    [commuteKm, transportMode, electricityTier, dietType].forEach(el => {
        el.addEventListener("input", calculate);
        el.addEventListener("change", calculate);
    });

    calculate();
}


// ---------------- 10-QUESTION CLIMATE SURVEY LOGIC ----------------

let loadedSurveyQuestions = [];

async function loadSurveyQuestions() {
    if (!surveyQuestionsList) return;

    try {
        const data = await getJSON("/api/survey/questions");
        loadedSurveyQuestions = data.questions || [];
        surveyQuestionsList.replaceChildren();

        loadedSurveyQuestions.forEach((q, index) => {
            const card = makeElement("div", "question-card");
            
            const qHeader = makeElement("div", "question-header");
            const qNumber = makeElement("span", "question-badge", `Q${index + 1} of 10`);
            const qTitle = makeElement("h4", "question-title", q.title);
            qHeader.append(qNumber, qTitle);
            card.appendChild(qHeader);

            const optionsWrap = makeElement("div", "question-options-grid");

            q.options.forEach((opt, optIdx) => {
                const label = makeElement("label", "option-label");
                
                const radio = document.createElement("input");
                radio.type = "radio";
                radio.name = q.id;
                radio.value = opt;
                radio.required = true;
                if (optIdx === 0) radio.checked = true; // default select first option for convenience

                const customRadio = makeElement("span", "custom-radio");
                const textSpan = makeElement("span", "option-text", opt);

                label.append(radio, customRadio, textSpan);
                optionsWrap.appendChild(label);
            });

            card.appendChild(optionsWrap);
            surveyQuestionsList.appendChild(card);
        });

    } catch (err) {
        console.error("Error loading survey questions:", err);
        surveyQuestionsList.textContent = "Could not load survey questions. Please refresh the page.";
    }
}

// Survey Form Submit Handler
if (climateSurveyForm) {
    climateSurveyForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const nameInput = document.getElementById("surveyName");
        const roleSelect = document.getElementById("surveyRole");
        const name = nameInput.value.trim();
        const role = roleSelect.value;

        if (!name) {
            alert("Please enter your name.");
            return;
        }

        const answers = {};
        let missing = false;

        loadedSurveyQuestions.forEach(q => {
            const checked = climateSurveyForm.querySelector(`input[name="${q.id}"]:checked`);
            if (checked) {
                answers[q.id] = checked.value;
            } else {
                missing = true;
            }
        });

        if (missing) {
            alert("Please answer all 10 questions.");
            return;
        }

        if (surveySubmitBtn) surveySubmitBtn.disabled = true;
        if (surveyFeedback) {
            surveyFeedback.textContent = "Submitting your responses to SQLite database...";
            surveyFeedback.className = "survey-feedback feedback-loading";
        }

        try {
            const res = await fetch("/api/survey/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, role, answers })
            });

            const resData = await res.json();
            if (!res.ok) throw new Error(resData.error || "Submission failed.");

            if (surveyFeedback) {
                surveyFeedback.innerHTML = `
                    <span>🎉 <strong>Success!</strong> ${resData.message}</span>
                    <button type="button" class="btn-inline-view-analytics" id="btnSwitchAnalyticsNow">
                        View Live Google Forms-Style Analytics 📊
                    </button>
                `;
                surveyFeedback.className = "survey-feedback feedback-success";

                document.getElementById("btnSwitchAnalyticsNow")?.addEventListener("click", () => {
                    switchToTab("surveyAnalyticsTab");
                });
            }

            // Reset name for next user
            nameInput.value = "";

            // Pre-fetch analytics in background
            loadSurveyAnalytics();

        } catch (err) {
            if (surveyFeedback) {
                surveyFeedback.textContent = err.message || "Failed to submit survey.";
                surveyFeedback.className = "survey-feedback feedback-error";
            }
        } finally {
            if (surveySubmitBtn) surveySubmitBtn.disabled = false;
        }
    });
}


// ---------------- GOOGLE FORMS-STYLE ANALYTICS DASHBOARD ----------------

// Color palettes for Google Forms aesthetic
const chartColorPalettes = [
    ["#087f5b", "#20c997", "#63e6be", "#a9e34b"], // Emerald greens
    ["#1971c2", "#339af0", "#74c0fc", "#a5d8ff"], // Blues
    ["#f08c00", "#ffd43b", "#ffe066", "#d9480f"], // Amber/Orange
    ["#7209b7", "#9d4edd", "#c77dff", "#e0aaff"], // Purples
    ["#2b9348", "#55a630", "#80b918", "#aacc00"]  // Leaf greens
];

async function loadSurveyAnalytics() {
    const chartsGrid = document.getElementById("analyticsChartsGrid");
    const tableBody = document.getElementById("participantsTableBody");
    if (!chartsGrid) return;

    try {
        const data = await getJSON("/api/survey/analytics");
        const total = data.total_responses || 0;

        // 1. Update KPI Cards
        const kpiTotal = document.getElementById("kpiTotalResponses");
        const kpiUrgency = document.getElementById("kpiUrgencyScore");
        const kpiCurriculum = document.getElementById("kpiCurriculumSupport");
        const kpiDaily = document.getElementById("kpiDailyHabits");

        if (kpiTotal) kpiTotal.textContent = total;

        // Extract insightful percentages from question analytics
        const qAnalytics = data.question_analytics || [];

        // Q3: Urgency (Immediate High Priority is idx 0)
        const q3 = qAnalytics.find(q => q.id === "q3");
        if (kpiUrgency && q3) {
            kpiUrgency.textContent = `${q3.percentages[0] ?? 0}%`;
        }

        // Q5: Mandatory Education (Definitely Yes is idx 0)
        const q5 = qAnalytics.find(q => q.id === "q5");
        if (kpiCurriculum && q5) {
            kpiCurriculum.textContent = `${q5.percentages[0] ?? 0}%`;
        }

        // Q4: Daily Habits (Daily is idx 0)
        const q4 = qAnalytics.find(q => q.id === "q4");
        if (kpiDaily && q4) {
            kpiDaily.textContent = `${q4.percentages[0] ?? 0}%`;
        }

        // 2. Render Google Forms Style Charts for all 10 Questions
        chartsGrid.replaceChildren();

        // Destroy any previous chart instances
        Object.values(surveyChartInstances).forEach(chart => {
            if (chart) chart.destroy();
        });
        surveyChartInstances = {};

        qAnalytics.forEach((q, idx) => {
            const chartCard = makeElement("div", "analytics-question-card");
            
            // Header
            const cardHeader = makeElement("div", "analytics-card-header");
            const qNum = makeElement("span", "badge-pill", `Question ${idx + 1}`);
            const qTitle = makeElement("h4", "", q.title);
            const totalText = makeElement("span", "text-sub", `${total} responses`);
            cardHeader.append(qNum, qTitle, totalText);
            chartCard.appendChild(cardHeader);

            // Chart Canvas Container
            const chartWrapper = makeElement("div", "survey-chart-wrapper");
            const canvas = document.createElement("canvas");
            canvas.id = `chart_${q.id}`;
            chartWrapper.appendChild(canvas);
            chartCard.appendChild(chartWrapper);

            // Google Forms Style Percentage Table
            const tableWrap = makeElement("div", "analytics-breakdown-table");
            const palette = chartColorPalettes[idx % chartColorPalettes.length];

            q.labels.forEach((opt, optIdx) => {
                const count = q.counts[optIdx] || 0;
                const pct = q.percentages[optIdx] || 0;
                const color = palette[optIdx % palette.length];

                const row = makeElement("div", "breakdown-row");
                
                const leftPart = makeElement("div", "breakdown-left");
                const colorDot = makeElement("span", "color-dot");
                colorDot.style.backgroundColor = color;
                const optText = makeElement("span", "breakdown-text", opt);
                leftPart.append(colorDot, optText);

                const rightPart = makeElement("div", "breakdown-right");
                const countText = makeElement("span", "breakdown-count", `${count}`);
                const pctText = makeElement("strong", "breakdown-pct", `${pct}%`);
                rightPart.append(countText, pctText);

                row.append(leftPart, rightPart);
                tableWrap.appendChild(row);
            });

            chartCard.appendChild(tableWrap);
            chartsGrid.appendChild(chartCard);

            // Initialize Chart.js Instance
            const chartType = q.chart_type || "bar";
            const bgColors = q.labels.map((_, i) => palette[i % palette.length]);

            if (chartType === "bar") {
                surveyChartInstances[q.id] = new Chart(canvas, {
                    type: "bar",
                    data: {
                        labels: q.labels,
                        datasets: [{
                            label: "Respondents",
                            data: q.counts,
                            backgroundColor: bgColors,
                            borderRadius: 6,
                            maxBarThickness: 45
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => `${ctx.raw} votes (${q.percentages[ctx.dataIndex]}%)`
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: { font: { size: 11 } },
                                grid: { display: false }
                            },
                            y: {
                                beginAtZero: true,
                                ticks: { precision: 0 },
                                grid: { color: "rgba(0,0,0,0.05)" }
                            }
                        }
                    }
                });
            } else if (chartType === "doughnut" || chartType === "pie") {
                surveyChartInstances[q.id] = new Chart(canvas, {
                    type: chartType,
                    data: {
                        labels: q.labels,
                        datasets: [{
                            data: q.counts,
                            backgroundColor: bgColors,
                            borderWidth: 2,
                            borderColor: "#ffffff"
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: "bottom",
                                labels: { boxWidth: 12, font: { size: 11 } }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => ` ${ctx.label}: ${ctx.raw} (${q.percentages[ctx.dataIndex]}%)`
                                }
                            }
                        }
                    }
                });
            }
        });

        // 3. Populate Recent Participants Table
        if (tableBody) {
            tableBody.replaceChildren();
            const recents = data.recent_participants || [];
            
            if (recents.length === 0) {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td colspan="3" style="text-align: center; color: #888;">No survey records found.</td>`;
                tableBody.appendChild(tr);
            } else {
                recents.forEach(p => {
                    const tr = document.createElement("tr");
                    
                    const nameTd = makeElement("td", "", p.participant_name);
                    
                    const roleTd = makeElement("td");
                    const roleBadge = makeElement("span", "role-badge", p.participant_role);
                    roleTd.appendChild(roleBadge);

                    const timeTd = makeElement("td", "text-sub", p.submitted_at || "Recent");

                    tr.append(nameTd, roleTd, timeTd);
                    tableBody.appendChild(tr);
                });
            }
        }

    } catch (err) {
        console.error("Error loading survey analytics:", err);
    }
}


// ---------------- SURVEY TABS CONTROLLER ----------------

// ---------------- SURVEY TABS & QUESTIONNAIRE TOGGLE ----------------

const surveyWelcomeCard = document.getElementById("surveyWelcomeCard");
const btnStartSurvey = document.getElementById("btnStartSurvey");
const btnCloseSurvey = document.getElementById("btnCloseSurvey");
const btnGotoAnalytics = document.getElementById("btnGotoAnalytics");

function openSurveyForm() {
    switchToTab("surveyFormTab");
    if (surveyWelcomeCard) surveyWelcomeCard.style.display = "none";
    if (climateSurveyForm) climateSurveyForm.style.display = "block";
    document.getElementById("surveySection")?.scrollIntoView({ behavior: "smooth" });
}

function closeSurveyForm() {
    if (climateSurveyForm) climateSurveyForm.style.display = "none";
    if (surveyWelcomeCard) surveyWelcomeCard.style.display = "block";
}

function switchToTab(tabId) {
    if (tabId === "surveyFormTab") {
        if (tabBtnSurvey) tabBtnSurvey.classList.add("active");
        if (tabBtnAnalytics) tabBtnAnalytics.classList.remove("active");
        if (surveyFormTab) surveyFormTab.style.display = "block";
        if (surveyAnalyticsTab) surveyAnalyticsTab.style.display = "none";
    } else {
        if (tabBtnAnalytics) tabBtnAnalytics.classList.add("active");
        if (tabBtnSurvey) tabBtnSurvey.classList.remove("active");
        if (surveyAnalyticsTab) surveyAnalyticsTab.style.display = "block";
        if (surveyFormTab) surveyFormTab.style.display = "none";
        loadSurveyAnalytics();
    }
}

if (btnStartSurvey) {
    btnStartSurvey.addEventListener("click", openSurveyForm);
}

if (btnCloseSurvey) {
    btnCloseSurvey.addEventListener("click", closeSurveyForm);
}

if (btnGotoAnalytics) {
    btnGotoAnalytics.addEventListener("click", () => {
        switchToTab("surveyAnalyticsTab");
        document.getElementById("surveySection")?.scrollIntoView({ behavior: "smooth" });
    });
}

if (tabBtnSurvey) {
    tabBtnSurvey.addEventListener("click", () => switchToTab("surveyFormTab"));
}

if (tabBtnAnalytics) {
    tabBtnAnalytics.addEventListener("click", () => switchToTab("surveyAnalyticsTab"));
}

// Nav link and Hero button triggers
document.getElementById("navAnalyticsLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchToTab("surveyAnalyticsTab");
    document.getElementById("surveySection")?.scrollIntoView({ behavior: "smooth" });
});

document.getElementById("heroTakeSurveyBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    openSurveyForm();
});

document.getElementById("heroViewAnalyticsBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchToTab("surveyAnalyticsTab");
    document.getElementById("surveySection")?.scrollIntoView({ behavior: "smooth" });
});

if (refreshAnalyticsBtn) {
    refreshAnalyticsBtn.addEventListener("click", () => {
        loadSurveyAnalytics();
    });
}

if (printAnalyticsBtn) {
    printAnalyticsBtn.addEventListener("click", () => {
        window.print();
    });
}


// ---------------- FORM & BUTTON LISTENERS ----------------

if (searchForm) {
    searchForm.addEventListener("submit", event => {
        event.preventDefault();
        const query = locationInput.value.trim();

        if (query.length < 2) {
            showMessage("Please enter at least 2 characters.", true);
            return;
        }

        searchLocations(query);
    });
}

document.querySelectorAll(".example-location").forEach(button => {
    button.addEventListener("click", () => {
        const location = button.dataset.location || button.textContent.trim();
        if (locationInput) locationInput.value = location;
        searchLocations(location);
    });
});

document.querySelectorAll(".btn-sample-load").forEach(button => {
    button.addEventListener("click", () => {
        const location = button.dataset.location;
        searchLocations(location);
    });
});


// ---------------- INITIALIZE APPLICATION ON LOAD ----------------

document.addEventListener("DOMContentLoaded", () => {
    setupCarbonCalculator();
    loadHistory();
    loadSurveyQuestions();
});