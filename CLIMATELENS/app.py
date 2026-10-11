from flask import Flask, render_template, request, jsonify
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from datetime import date, timedelta
import sqlite3
import json
import os
import random

app = Flask(__name__)

DATABASE = os.path.join(app.root_path, "climate.db")


# ---------------- 10 CLIMATE AWARENESS SURVEY QUESTIONS ----------------

SURVEY_QUESTIONS = [
    {
        "id": "q1",
        "title": "Do you believe human activities (fossil fuels, deforestation) are the primary driver of global climate change?",
        "options": ["Strongly Agree", "Agree", "Neutral", "Disagree"],
        "chart_type": "bar"
    },
    {
        "id": "q2",
        "title": "Have you personally noticed abnormal weather patterns (extreme heatwaves, unseasonal rains, drought) in your region?",
        "options": ["Frequently", "Occasionally", "Rarely", "Never"],
        "chart_type": "doughnut"
    },
    {
        "id": "q3",
        "title": "What urgency should governments place on transitioning from coal & petroleum to solar & wind energy?",
        "options": ["Immediate High Priority", "Gradual Transition", "Low Priority", "Unsure"],
        "chart_type": "bar"
    },
    {
        "id": "q4",
        "title": "How frequently do you consciously conserve electricity, save water, or refuse single-use plastics?",
        "options": ["Daily", "Several times a week", "Rarely", "Never"],
        "chart_type": "pie"
    },
    {
        "id": "q5",
        "title": "Should climate change education & practical sustainability be mandatory in school and college curriculums?",
        "options": ["Definitely Yes", "Optional Elective", "No Need"],
        "chart_type": "doughnut"
    },
    {
        "id": "q6",
        "title": "Do you support imposing a mandatory Carbon Tax on heavy industrial polluters to finance clean air projects?",
        "options": ["Strongly Support", "Support with Safeguards", "Oppose", "No Opinion"],
        "chart_type": "bar"
    },
    {
        "id": "q7",
        "title": "What is your primary source of climate and environmental awareness?",
        "options": ["Social Media & Web", "College / University Lectures", "News & Documentaries", "Community / Friends"],
        "chart_type": "bar"
    },
    {
        "id": "q8",
        "title": "Would you pay a slight premium for certified carbon-neutral or eco-friendly everyday products?",
        "options": ["Yes, definitely", "Only if within 10% premium", "No, too expensive", "Undecided"],
        "chart_type": "doughnut"
    },
    {
        "id": "q9",
        "title": "How much impact do you believe student initiatives and youth-led awareness campaigns can create?",
        "options": ["Significant Impact", "Moderate Impact", "Slight Impact", "Negligible Impact"],
        "chart_type": "bar"
    },
    {
        "id": "q10",
        "title": "Which individual action do you feel contributes most effectively toward slowing climate change?",
        "options": ["Public Transit / EV Adoption", "Reducing Household Energy / AC", "Plant-Forward Diets", "Zero-Waste & Tree Planting"],
        "chart_type": "pie"
    }
]


# ---------------- DATABASE ----------------

def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with get_db() as db:
        # Search history table
        db.execute("""
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                place TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # 10-Question Climate Awareness Survey table
        db.execute("""
            CREATE TABLE IF NOT EXISTS survey_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                participant_name TEXT NOT NULL,
                participant_role TEXT NOT NULL DEFAULT 'Student',
                q1 TEXT NOT NULL,
                q2 TEXT NOT NULL,
                q3 TEXT NOT NULL,
                q4 TEXT NOT NULL,
                q5 TEXT NOT NULL,
                q6 TEXT NOT NULL,
                q7 TEXT NOT NULL,
                q8 TEXT NOT NULL,
                q9 TEXT NOT NULL,
                q10 TEXT NOT NULL,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.commit()

    # Pre-populate realistic seed responses if table is empty for instant presentation ready charts
    seed_survey_if_empty()


def seed_survey_if_empty():
    with get_db() as db:
        count = db.execute("SELECT COUNT(*) AS cnt FROM survey_responses").fetchone()["cnt"]
        if count == 0:
            sample_participants = [
                ("Aarav Sharma", "Student"),
                ("Dr. Kavita Rao", "Educator / Teacher"),
                ("Rohan Mehta", "Student"),
                ("Priya Patel", "Environmentalist"),
                ("Ananya Sen", "Student"),
                ("Prof. Vikram Desai", "Educator / Teacher"),
                ("Sneha Kulkarni", "Student"),
                ("Aditya Joshi", "General Citizen"),
                ("Neha Nair", "Student"),
                ("Devansh Malhotra", "Student"),
                ("Simran Kaur", "Student"),
                ("Rajesh Iyer", "General Citizen"),
                ("Tanvi Verma", "Student"),
                ("Manish Pandey", "Student"),
                ("Meera Nambiar", "Educator / Teacher"),
                ("Karthik Sundaram", "Student"),
                ("Ishita Bannerjee", "Student"),
                ("Alok Saxena", "Environmentalist"),
                ("Pooja Hegde", "Student"),
                ("Ritika Sen", "Student")
            ]

            seed_data = []
            for name, role in sample_participants:
                seed_data.append((
                    name,
                    role,
                    random.choices(["Strongly Agree", "Agree", "Neutral", "Disagree"], weights=[60, 30, 8, 2])[0],
                    random.choices(["Frequently", "Occasionally", "Rarely", "Never"], weights=[55, 35, 8, 2])[0],
                    random.choices(["Immediate High Priority", "Gradual Transition", "Low Priority", "Unsure"], weights=[65, 25, 6, 4])[0],
                    random.choices(["Daily", "Several times a week", "Rarely", "Never"], weights=[40, 45, 12, 3])[0],
                    random.choices(["Definitely Yes", "Optional Elective", "No Need"], weights=[80, 16, 4])[0],
                    random.choices(["Strongly Support", "Support with Safeguards", "Oppose", "No Opinion"], weights=[55, 32, 8, 5])[0],
                    random.choices(["Social Media & Web", "College / University Lectures", "News & Documentaries", "Community / Friends"], weights=[35, 30, 25, 10])[0],
                    random.choices(["Yes, definitely", "Only if within 10% premium", "No, too expensive", "Undecided"], weights=[42, 45, 8, 5])[0],
                    random.choices(["Significant Impact", "Moderate Impact", "Slight Impact", "Negligible Impact"], weights=[60, 28, 8, 4])[0],
                    random.choices(["Public Transit / EV Adoption", "Reducing Household Energy / AC", "Plant-Forward Diets", "Zero-Waste & Tree Planting"], weights=[38, 24, 16, 22])[0]
                ))

            db.executemany("""
                INSERT INTO survey_responses 
                (participant_name, participant_role, q1, q2, q3, q4, q5, q6, q7, q8, q9, q10)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, seed_data)
            db.commit()


# ---------------- API HELPER ----------------

def fetch_json(url, timeout=12):
    req = Request(
        url,
        headers={"User-Agent": "ClimateLens/2.0 (Academic Project; contact@climatelens.local)"}
    )
    with urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


# ---------------- WMO WEATHER CODE TRANSLATION ----------------

def parse_weather_code(code, is_day=1):
    codes = {
        0: ("Clear Sky", "☀️" if is_day else "🌙"),
        1: ("Mainly Clear", "🌤️" if is_day else "🌤️"),
        2: ("Partly Cloudy", "⛅"),
        3: ("Overcast", "☁️"),
        45: ("Foggy", "🌫️"),
        48: ("Depositing Rime Fog", "🌫️"),
        51: ("Light Drizzle", "🌦️"),
        53: ("Moderate Drizzle", "🌦️"),
        55: ("Dense Drizzle", "🌧️"),
        56: ("Light Freezing Drizzle", "🌨️"),
        57: ("Dense Freezing Drizzle", "🌨️"),
        61: ("Slight Rain", "🌧️"),
        63: ("Moderate Rain", "🌧️"),
        65: ("Heavy Rain", "🌧️"),
        66: ("Light Freezing Rain", "🌨️"),
        67: ("Heavy Freezing Rain", "🌨️"),
        71: ("Slight Snow Fall", "🌨️"),
        73: ("Moderate Snow Fall", "❄️"),
        75: ("Heavy Snow Fall", "❄️"),
        77: ("Snow Grains", "❄️"),
        80: ("Slight Rain Showers", "🌦️"),
        81: ("Moderate Rain Showers", "🌧️"),
        82: ("Violent Rain Showers", "⛈️"),
        85: ("Slight Snow Showers", "🌨️"),
        86: ("Heavy Snow Showers", "❄️"),
        95: ("Thunderstorm", "⛈️"),
        96: ("Thunderstorm with Slight Hail", "⛈️"),
        99: ("Thunderstorm with Heavy Hail", "⛈️")
    }
    return codes.get(code, ("Variable Conditions", "🌡️"))


# ---------------- HOME PAGE ----------------

@app.route("/")
def home():
    return render_template("index.html")


# ---------------- GLOBAL LOCATION SEARCH ----------------

@app.route("/api/search")
def search_location():
    query = request.args.get("q", "").strip()

    if len(query) < 2:
        return jsonify({
            "error": "Enter at least 2 characters."
        }), 400

    queries_to_try = [query]
    if "," in query:
        primary = query.split(",")[0].strip()
        if primary and primary != query:
            queries_to_try.append(primary)

    results = []
    try:
        for q in queries_to_try:
            params = urlencode({
                "name": q,
                "count": 8,
                "language": "en",
                "format": "json"
            })
            url = f"https://geocoding-api.open-meteo.com/v1/search?{params}"
            data = fetch_json(url)

            for item in data.get("results", []):
                lat = round(item.get("latitude", 0), 4)
                lon = round(item.get("longitude", 0), 4)
                if not any(r["latitude"] == lat and r["longitude"] == lon for r in results):
                    results.append({
                        "name": item.get("name", "Unknown"),
                        "admin1": item.get("admin1", ""),
                        "country": item.get("country", ""),
                        "country_code": item.get("country_code", ""),
                        "latitude": lat,
                        "longitude": lon,
                        "timezone": item.get("timezone", "auto")
                    })

            if results:
                break

        return jsonify({"results": results})

    except (HTTPError, URLError, TimeoutError, ValueError):
        app.logger.exception("Location search failed")
        return jsonify({
            "error": "Location search is temporarily unavailable. Please try again."
        }), 502


# ---------------- REVERSE GEOCODING ----------------

@app.route("/api/reverse")
def reverse_geocode():
    try:
        lat = float(request.args.get("lat", ""))
        lon = float(request.args.get("lon", ""))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid coordinates."}), 400

    try:
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"
        data = fetch_json(url, timeout=8)
        address = data.get("address", {})

        city = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("municipality")
            or address.get("suburb")
            or address.get("county")
            or data.get("name")
            or "Selected Area"
        )
        state = address.get("state", "")
        country = address.get("country", "")

        display_parts = [city, state, country]
        display_name = ", ".join([p for p in display_parts if p]) or f"Lat: {lat:.2f}, Lon: {lon:.2f}"

        return jsonify({
            "place": display_name,
            "city": city,
            "country": country,
            "latitude": lat,
            "longitude": lon
        })
    except Exception:
        return jsonify({
            "place": f"Location ({lat:.2f}, {lon:.2f})",
            "city": "Unknown",
            "country": "",
            "latitude": lat,
            "longitude": lon
        })


# ---------------- WEATHER, CLIMATE & AIR QUALITY ----------------

@app.route("/api/climate")
def climate_data():
    try:
        latitude = float(request.args.get("lat", ""))
        longitude = float(request.args.get("lon", ""))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid coordinates."}), 400

    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return jsonify({"error": "Coordinates are out of range."}), 400

    place = request.args.get("place", "Selected location").strip()
    place = place[:150] or "Selected location"

    try:
        forecast_params = urlencode({
            "latitude": latitude,
            "longitude": longitude,
            "current": (
                "temperature_2m,relative_humidity_2m,apparent_temperature,"
                "precipitation,weather_code,wind_speed_10m,wind_direction_10m,"
                "surface_pressure,is_day"
            ),
            "daily": (
                "weather_code,temperature_2m_max,temperature_2m_min,"
                "temperature_2m_mean,precipitation_sum,precipitation_probability_max,"
                "uv_index_max,sunrise,sunset"
            ),
            "forecast_days": 7,
            "timezone": "auto"
        })
        forecast_url = f"https://api.open-meteo.com/v1/forecast?{forecast_params}"
        forecast = fetch_json(forecast_url)

        end_date = date.today() - timedelta(days=5)
        start_date = end_date - timedelta(days=29)

        history_params = urlencode({
            "latitude": latitude,
            "longitude": longitude,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "daily": (
                "temperature_2m_mean,temperature_2m_max,"
                "temperature_2m_min,precipitation_sum"
            ),
            "timezone": "auto"
        })
        history_url = f"https://archive-api.open-meteo.com/v1/archive?{history_params}"
        history = fetch_json(history_url)

        air_quality = {}
        try:
            aq_params = urlencode({
                "latitude": latitude,
                "longitude": longitude,
                "current": (
                    "european_aqi,us_aqi,pm10,pm2_5,"
                    "carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone"
                )
            })
            aq_url = f"https://air-quality-api.open-meteo.com/v1/air-quality?{aq_params}"
            aq_data = fetch_json(aq_url, timeout=8)
            air_quality = aq_data.get("current", {})
        except Exception as e:
            app.logger.warning("Air Quality fetch warning: %s", e)

        current = forecast.get("current", {})
        daily = forecast.get("daily", {})
        historical_daily = history.get("daily", {})

        wmo_code = current.get("weather_code", 0)
        is_day = current.get("is_day", 1)
        weather_desc, weather_icon = parse_weather_code(wmo_code, is_day)
        current["weather_description"] = weather_desc
        current["weather_icon"] = weather_icon

        daily_codes = daily.get("weather_code", [])
        daily["weather_descriptions"] = [parse_weather_code(c, 1)[0] for c in daily_codes]
        daily["weather_icons"] = [parse_weather_code(c, 1)[1] for c in daily_codes]

        temp = current.get("temperature_2m", 20)
        humidity = current.get("relative_humidity_2m", 50)
        us_aqi = air_quality.get("us_aqi", None)
        uv = daily.get("uv_index_max", [0])[0] if daily.get("uv_index_max") else 0

        aqi_label = "Good"
        aqi_color = "#2b9348"
        if us_aqi is not None:
            if us_aqi <= 50:
                aqi_label = "Good"
                aqi_color = "#2b9348"
            elif us_aqi <= 100:
                aqi_label = "Moderate"
                aqi_color = "#e0a96d"
            elif us_aqi <= 150:
                aqi_label = "Unhealthy for Sensitive Groups"
                aqi_color = "#ee892d"
            elif us_aqi <= 200:
                aqi_label = "Unhealthy"
                aqi_color = "#d90429"
            elif us_aqi <= 300:
                aqi_label = "Very Unhealthy"
                aqi_color = "#7209b7"
            else:
                aqi_label = "Hazardous"
                aqi_color = "#560bad"

        heat_stress = "Comfortable"
        if temp > 38:
            heat_stress = "Extreme Heat Warning"
        elif temp > 33:
            heat_stress = "High Thermal Stress"
        elif temp > 28:
            heat_stress = "Moderate Warmth"
        elif temp < 5:
            heat_stress = "Cold Stress"

        with get_db() as db:
            db.execute("""
                INSERT INTO search_history
                (place, latitude, longitude)
                VALUES (?, ?, ?)
            """, (place, latitude, longitude))

        return jsonify({
            "place": place,
            "latitude": latitude,
            "longitude": longitude,
            "timezone": forecast.get("timezone", ""),
            "current": current,
            "forecast": daily,
            "history": historical_daily,
            "air_quality": {
                "metrics": air_quality,
                "label": aqi_label,
                "color": aqi_color,
                "us_aqi": us_aqi
            },
            "climate_insights": {
                "heat_stress": heat_stress,
                "max_uv": uv,
                "uv_status": "High" if uv >= 6 else ("Moderate" if uv >= 3 else "Low"),
                "rain_risk": "Elevated" if (daily.get("precipitation_probability_max", [0])[0] or 0) > 50 else "Low"
            },
            "units": {
                "temperature": "°C",
                "wind_speed": "km/h",
                "pressure": "hPa",
                "precipitation": "mm"
            },
            "sources": [
                "Open-Meteo Forecast & Archive API",
                "Open-Meteo Air Quality API",
                "OpenStreetMap / Nominatim"
            ]
        })

    except (HTTPError, URLError, TimeoutError, ValueError):
        app.logger.exception("Climate data request failed")
        return jsonify({
            "error": "Climate data is temporarily unavailable. Please try again."
        }), 502


# ---------------- RECENT SEARCHES ----------------

@app.route("/api/history")
def search_history():
    with get_db() as db:
        rows = db.execute("""
            SELECT place, latitude, longitude, searched_at
            FROM search_history
            ORDER BY id DESC
            LIMIT 10
        """).fetchall()

    return jsonify({
        "history": [dict(row) for row in rows]
    })


@app.route("/api/history/clear", methods=["POST"])
def clear_history():
    with get_db() as db:
        db.execute("DELETE FROM search_history")
    return jsonify({"success": True, "message": "Search history cleared."})


# ---------------- 10-QUESTION CLIMATE SURVEY ENDPOINTS ----------------

@app.route("/api/survey/questions")
def get_survey_questions():
    """Returns the question definitions for the interactive survey."""
    return jsonify({"questions": SURVEY_QUESTIONS})


@app.route("/api/survey/submit", methods=["POST"])
def submit_survey():
    """Stores a user's 10 answers with name and role in SQLite."""
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    role = data.get("role", "Student").strip()
    answers = data.get("answers", {})

    if not name:
        return jsonify({"error": "Please enter your name."}), 400

    # Ensure all 10 questions are answered
    for q in SURVEY_QUESTIONS:
        qid = q["id"]
        if qid not in answers or not str(answers[qid]).strip():
            return jsonify({"error": f"Please answer Question: {q['title']}"}), 400

    try:
        with get_db() as db:
            cur = db.execute("""
                INSERT INTO survey_responses 
                (participant_name, participant_role, q1, q2, q3, q4, q5, q6, q7, q8, q9, q10)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                name,
                role,
                str(answers["q1"]),
                str(answers["q2"]),
                str(answers["q3"]),
                str(answers["q4"]),
                str(answers["q5"]),
                str(answers["q6"]),
                str(answers["q7"]),
                str(answers["q8"]),
                str(answers["q9"]),
                str(answers["q10"])
            ))
            new_id = cur.lastrowid
            db.commit()

        return jsonify({
            "success": True,
            "message": f"Thank you {name}! Your survey response has been saved.",
            "response_id": new_id
        })
    except Exception as e:
        app.logger.exception("Survey submit error")
        return jsonify({"error": "Failed to save survey. Please try again."}), 500


@app.route("/api/survey/analytics")
def get_survey_analytics():
    """
    Returns aggregated responses formatted for Google Forms style charts:
    total count, role breakdowns, question-by-question counts & percentages.
    """
    with get_db() as db:
        total = db.execute("SELECT COUNT(*) AS total FROM survey_responses").fetchone()["total"]

        # Recent participants
        recent_rows = db.execute("""
            SELECT id, participant_name, participant_role, submitted_at
            FROM survey_responses
            ORDER BY id DESC
            LIMIT 10
        """).fetchall()

        recent_participants = [dict(r) for r in recent_rows]

        # Role breakdown
        role_rows = db.execute("""
            SELECT participant_role, COUNT(*) as cnt
            FROM survey_responses
            GROUP BY participant_role
        """).fetchall()
        role_breakdown = {r["participant_role"]: r["cnt"] for r in role_rows}

        # Analyze each of the 10 questions
        question_analytics = []
        for q in SURVEY_QUESTIONS:
            qid = q["id"]
            rows = db.execute(f"""
                SELECT {qid} AS choice, COUNT(*) AS count
                FROM survey_responses
                GROUP BY {qid}
            """).fetchall()

            count_map = {r["choice"]: r["count"] for r in rows}

            labels = q["options"]
            counts = [count_map.get(opt, 0) for opt in labels]
            percentages = [round((c / total * 100), 1) if total > 0 else 0 for c in counts]

            question_analytics.append({
                "id": qid,
                "title": q["title"],
                "chart_type": q["chart_type"],
                "labels": labels,
                "counts": counts,
                "percentages": percentages
            })

    return jsonify({
        "total_responses": total,
        "role_breakdown": role_breakdown,
        "recent_participants": recent_participants,
        "question_analytics": question_analytics
    })


# Initialize database and seed if needed
init_db()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug_mode = os.environ.get("FLASK_DEBUG", "True").lower() in ("true", "1")
    app.run(host="0.0.0.0", port=port, debug=debug_mode)