"""
Smart Industrial Pollution Monitoring System
Backend API - Flask + IBM Granite LLM
Domain: Environmental Sustainability - Golden Corridor (Vapi–Ankleshwar–Vatva)
"""

import random
import time
import math
import json
import threading
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests
import os

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)

# ─── IBM Watsonx Credentials ────────────────────────────────────────────────
WATSONX_API_KEY = "iQv_Lw8dVCLnyWSEHlHFCs53LYrzjH4XQyJ9CtqpPZvB"
WATSONX_URL = "https://au-syd.ml.cloud.ibm.com"
WATSONX_PROJECT_ID = "e0613b22-ba0a-4f16-955b-e02df9854af6"
GRANITE_MODEL_ID = "ibm/granite-3-3-8b-instruct"

# ─── Sensor Locations ───────────────────────────────────────────────────────
LOCATIONS = ["Vapi", "Ankleshwar", "Vatva"]

# ─── Parameter Thresholds ──────────────────────────────────────────────────
AIR_THRESHOLDS = {
    "PM2_5":   {"good": 30,  "moderate": 60,  "bad": 90,   "unit": "µg/m³"},
    "PM10":    {"good": 50,  "moderate": 100, "bad": 150,  "unit": "µg/m³"},
    "SO2":     {"good": 40,  "moderate": 80,  "bad": 120,  "unit": "µg/m³"},
    "NO2":     {"good": 40,  "moderate": 80,  "bad": 120,  "unit": "µg/m³"},
    "CO":      {"good": 2,   "moderate": 5,   "bad": 10,   "unit": "mg/m³"},
    "O3":      {"good": 50,  "moderate": 100, "bad": 160,  "unit": "µg/m³"},
    "VOC":     {"good": 150, "moderate": 300, "bad": 500,  "unit": "µg/m³"},
    "H2S":     {"good": 5,   "moderate": 10,  "bad": 20,   "unit": "µg/m³"},
}

WATER_THRESHOLDS = {
    "pH":       {"good": [6.5, 8.5], "moderate": [6.0, 9.0], "bad": [5.5, 9.5], "unit": "pH"},
    "BOD":      {"good": 3,   "moderate": 10,  "bad": 30,   "unit": "mg/L"},
    "COD":      {"good": 50,  "moderate": 150, "bad": 300,  "unit": "mg/L"},
    "TDS":      {"good": 500, "moderate": 1000,"bad": 2000,  "unit": "mg/L"},
    "Turbidity":{"good": 5,   "moderate": 15,  "bad": 30,   "unit": "NTU"},
    "DO":       {"good": 6,   "moderate": 4,   "bad": 2,    "unit": "mg/L"},
    "Nitrates": {"good": 10,  "moderate": 30,  "bad": 50,   "unit": "mg/L"},
    "HeavyMetals":{"good": 0.05,"moderate": 0.1,"bad": 0.5, "unit": "mg/L"},
}

# ─── In-memory data store ────────────────────────────────────────────────────
sensor_data_store = {loc: [] for loc in LOCATIONS}
MAX_HISTORY = 50
iam_token_cache = {"token": None, "expires_at": 0}

# ─── Complaint store (in-memory) ─────────────────────────────────────────────
complaint_store = []   # list of dicts

# ─── Known industrial sources per location ───────────────────────────────────
INDUSTRIAL_SOURCES = {
    "Vapi": [
        {"name": "Chemical Complex A", "type": "Chloro-alkali", "lat": 20.371, "lon": 72.905},
        {"name": "Textile Dyeing Unit B", "type": "Textile", "lat": 20.375, "lon": 72.912},
        {"name": "Pharmaceutical Plant C", "type": "Pharma", "lat": 20.368, "lon": 72.898},
        {"name": "Pesticide Factory D", "type": "Agrochemical", "lat": 20.380, "lon": 72.920},
    ],
    "Ankleshwar": [
        {"name": "Dye Intermediate Unit E", "type": "Dye/Chemical", "lat": 21.627, "lon": 73.001},
        {"name": "API Manufacturing F", "type": "Pharma", "lat": 21.631, "lon": 73.008},
        {"name": "Rubber Chemical Plant G", "type": "Rubber", "lat": 21.622, "lon": 72.995},
        {"name": "Solvent Recovery Unit H", "type": "Chemical", "lat": 21.635, "lon": 73.015},
    ],
    "Vatva": [
        {"name": "Dyes & Pigment Unit I", "type": "Dye/Pigment", "lat": 22.988, "lon": 72.617},
        {"name": "Engineering Plastics J", "type": "Plastics", "lat": 22.993, "lon": 72.625},
        {"name": "Battery Recycling K", "type": "Metal/Battery", "lat": 22.983, "lon": 72.610},
        {"name": "Paint Manufacturing L", "type": "Paint/Coating", "lat": 22.998, "lon": 72.631},
    ],
}

# ─── Parameter → likely source mapping ───────────────────────────────────────
PARAM_SOURCE_MAP = {
    "SO2":          ["Chloro-alkali", "Chemical", "Rubber"],
    "H2S":          ["Pharma", "Agrochemical", "Chemical"],
    "VOC":          ["Paint/Coating", "Solvent Recovery Unit", "Plastics"],
    "NO2":          ["Textile", "Dye/Chemical", "Pharma"],
    "PM2_5":        ["Textile", "Rubber", "Metal/Battery"],
    "PM10":         ["Metal/Battery", "Rubber", "Textile"],
    "HeavyMetals":  ["Metal/Battery", "Paint/Coating", "Dye/Pigment"],
    "BOD":          ["Textile", "Pharma", "Dye/Chemical"],
    "COD":          ["Dye/Pigment", "Chemical", "Textile"],
    "pH":           ["Chloro-alkali", "Chemical", "Pharma"],
}

# ─── IBM IAM Token ──────────────────────────────────────────────────────────
def get_iam_token():
    now = time.time()
    if iam_token_cache["token"] and now < iam_token_cache["expires_at"]:
        return iam_token_cache["token"]
    try:
        resp = requests.post(
            "https://iam.cloud.ibm.com/identity/token",
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey": WATSONX_API_KEY,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            iam_token_cache["token"] = data["access_token"]
            iam_token_cache["expires_at"] = now + data.get("expires_in", 3600) - 60
            return iam_token_cache["token"]
    except Exception as e:
        print(f"IAM token error: {e}")
    return None

# ─── Call IBM Granite LLM ───────────────────────────────────────────────────
def call_granite(prompt: str) -> str:
    token = get_iam_token()
    if not token:
        return _fallback_response(prompt)
    try:
        url = f"{WATSONX_URL}/ml/v1/text/generation?version=2023-05-29"
        payload = {
            "model_id": GRANITE_MODEL_ID,
            "input": prompt,
            "parameters": {
                "decoding_method": "greedy",
                "max_new_tokens": 400,
                "temperature": 0.7,
                "stop_sequences": ["<|endoftext|>"]
            },
            "project_id": WATSONX_PROJECT_ID,
        }
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        if resp.status_code == 200:
            result = resp.json()
            text = result.get("results", [{}])[0].get("generated_text", "").strip()
            return text if text else _fallback_response(prompt)
        else:
            print(f"Granite API error {resp.status_code}: {resp.text[:200]}")
            return _fallback_response(prompt)
    except Exception as e:
        print(f"Granite call error: {e}")
        return _fallback_response(prompt)

def _fallback_response(prompt: str) -> str:
    """Intelligent rule-based fallback when LLM is unavailable."""
    p = prompt.lower()
    if "bad" in p or "violation" in p or "critical" in p:
        return (
            "⚠️ CRITICAL: Pollution levels exceed safe limits. Immediate actions: "
            "1) Halt or reduce industrial operations at affected units. "
            "2) Notify GPCB (Gujarat Pollution Control Board) immediately. "
            "3) Activate emergency ventilation and effluent treatment systems. "
            "4) Issue public health advisory for nearby communities. "
            "5) Deploy rapid response teams for source identification and containment."
        )
    elif "good" in p or "safe" in p:
        return (
            "✅ GOOD: Environmental parameters are within safe limits. Maintenance tips: "
            "1) Continue regular monitoring every 15 minutes. "
            "2) Maintain current effluent treatment plant (ETP) operations. "
            "3) Conduct monthly equipment calibration. "
            "4) Ensure green buffer zones are maintained around facilities. "
            "5) Document current practices for compliance reports."
        )
    else:
        return (
            "📊 MODERATE: Some parameters approaching threshold limits. Advisory: "
            "1) Increase monitoring frequency to every 5 minutes. "
            "2) Inspect and optimize industrial scrubbers and ETPs. "
            "3) Reduce load on high-emission production lines if possible. "
            "4) Alert shift supervisors for corrective action. "
            "5) Prepare escalation report for GPCB if values rise further."
        )

# ─── IoT Sensor Simulation ──────────────────────────────────────────────────
def simulate_sensor_reading(location: str, t: float = None) -> dict:
    if t is None:
        t = time.time()
    # Vary by location for realism
    loc_multiplier = {"Vapi": 1.3, "Ankleshwar": 1.1, "Vatva": 0.9}
    mult = loc_multiplier.get(location, 1.0)

    # Simulate diurnal pattern + random spikes
    hour = datetime.now().hour
    diurnal = 1.0 + 0.3 * math.sin((hour - 6) * math.pi / 12)
    spike = random.uniform(0.8, 2.2) if random.random() < 0.15 else random.uniform(0.85, 1.15)

    def val(base, noise=0.15):
        return round(base * mult * diurnal * spike * random.uniform(1 - noise, 1 + noise), 2)

    air = {
        "PM2_5":    val(45),
        "PM10":     val(80),
        "SO2":      val(55),
        "NO2":      val(50),
        "CO":       round(val(3.5), 2),
        "O3":       val(70),
        "VOC":      val(200),
        "H2S":      val(8),
    }
    water = {
        "pH":        round(random.uniform(6.0, 9.5), 1),
        "BOD":       val(8),
        "COD":       val(120),
        "TDS":       val(700),
        "Turbidity": val(12),
        "DO":        round(random.uniform(2, 8), 1),
        "Nitrates":  val(18),
        "HeavyMetals": round(val(0.08), 3),
    }

    return {
        "location": location,
        "timestamp": datetime.now().isoformat(),
        "air": air,
        "water": water,
        "aqi": calculate_aqi(air),
        "wqi": calculate_wqi(water),
    }

def calculate_aqi(air: dict) -> dict:
    """Simple AQI calculation based on PM2.5 and PM10."""
    pm25 = air["PM2_5"]
    pm10 = air["PM10"]
    so2  = air["SO2"]
    # Weighted score 0-500
    score = int((pm25 / 90 * 200 + pm10 / 150 * 150 + so2 / 120 * 150) / 3)
    score = min(score, 500)
    if score <= 50:    status, color = "Good", "#22c55e"
    elif score <= 100: status, color = "Satisfactory", "#84cc16"
    elif score <= 200: status, color = "Moderate", "#eab308"
    elif score <= 300: status, color = "Poor", "#f97316"
    elif score <= 400: status, color = "Very Poor", "#ef4444"
    else:              status, color = "Severe", "#7f1d1d"
    return {"value": score, "status": status, "color": color}

def calculate_wqi(water: dict) -> dict:
    """Water Quality Index calculation."""
    ph = water["pH"]
    bod = water["BOD"]
    do  = water["DO"]
    tds = water["TDS"]
    ph_score  = 100 if 6.5 <= ph <= 8.5 else max(0, 100 - abs(ph - 7.0) * 25)
    bod_score = max(0, 100 - bod * 3)
    do_score  = min(100, do * 12.5)
    tds_score = max(0, 100 - tds / 20)
    score = int((ph_score + bod_score + do_score + tds_score) / 4)
    score = max(0, min(100, score))
    if score >= 90:    status, color = "Excellent", "#22c55e"
    elif score >= 70:  status, color = "Good", "#84cc16"
    elif score >= 50:  status, color = "Fair", "#eab308"
    elif score >= 25:  status, color = "Poor", "#f97316"
    else:              status, color = "Very Poor", "#ef4444"
    return {"value": score, "status": status, "color": color}

def get_parameter_status(param: str, value: float, category: str) -> str:
    thresholds = AIR_THRESHOLDS if category == "air" else WATER_THRESHOLDS
    if param not in thresholds:
        return "unknown"
    t = thresholds[param]
    if param == "pH":
        good_range = t["good"]
        mod_range  = t["moderate"]
        if good_range[0] <= value <= good_range[1]: return "good"
        if mod_range[0] <= value <= mod_range[1]:   return "moderate"
        return "bad"
    elif param == "DO":
        if value >= t["good"]:     return "good"
        if value >= t["moderate"]: return "moderate"
        return "bad"
    else:
        if value <= t["good"]:     return "good"
        if value <= t["moderate"]: return "moderate"
        return "bad"

# ─── Background IoT Simulator ───────────────────────────────────────────────
def run_iot_simulator():
    while True:
        for loc in LOCATIONS:
            reading = simulate_sensor_reading(loc)
            sensor_data_store[loc].append(reading)
            if len(sensor_data_store[loc]) > MAX_HISTORY:
                sensor_data_store[loc].pop(0)
        time.sleep(5)

simulator_thread = threading.Thread(target=run_iot_simulator, daemon=True)
simulator_thread.start()

# ─── API Routes ─────────────────────────────────────────────────────────────

@app.route("/")
def serve_index():
    return send_from_directory("../frontend", "index.html")

@app.route("/api/status")
def api_status():
    return jsonify({
        "status": "online",
        "system": "Smart Industrial Pollution Monitoring System",
        "region": "Golden Corridor — Vapi, Ankleshwar, Vatva",
        "locations": LOCATIONS,
        "timestamp": datetime.now().isoformat(),
    })

@app.route("/api/sensors/latest")
def api_latest():
    """Latest reading for all locations."""
    result = {}
    for loc in LOCATIONS:
        if sensor_data_store[loc]:
            result[loc] = sensor_data_store[loc][-1]
        else:
            result[loc] = simulate_sensor_reading(loc)
    return jsonify(result)

@app.route("/api/sensors/<location>/history")
def api_history(location):
    location = location.capitalize()
    if location not in LOCATIONS:
        return jsonify({"error": "Unknown location"}), 404
    data = sensor_data_store[location]
    limit = int(request.args.get("limit", 20))
    return jsonify(data[-limit:])

@app.route("/api/sensors/<location>/latest")
def api_location_latest(location):
    location = location.capitalize()
    if location not in LOCATIONS:
        return jsonify({"error": "Unknown location"}), 404
    data = sensor_data_store[location]
    if data:
        return jsonify(data[-1])
    return jsonify(simulate_sensor_reading(location))

@app.route("/api/alerts")
def api_alerts():
    """Generate alerts for all locations based on latest readings."""
    alerts = []
    for loc in LOCATIONS:
        if not sensor_data_store[loc]:
            continue
        reading = sensor_data_store[loc][-1]
        # Check air parameters
        for param, value in reading["air"].items():
            status = get_parameter_status(param, value, "air")
            if status in ("bad", "moderate"):
                unit = AIR_THRESHOLDS[param]["unit"]
                threshold = AIR_THRESHOLDS[param][status]
                alerts.append({
                    "id": f"{loc}_{param}_{int(time.time())}",
                    "location": loc,
                    "category": "air",
                    "parameter": param,
                    "value": value,
                    "unit": unit,
                    "threshold": threshold,
                    "status": status,
                    "timestamp": reading["timestamp"],
                    "message": f"[{loc}] {param}: {value} {unit} — {status.upper()}",
                })
        # Check water parameters
        for param, value in reading["water"].items():
            status = get_parameter_status(param, value, "water")
            if status in ("bad", "moderate"):
                unit = WATER_THRESHOLDS[param]["unit"]
                threshold = WATER_THRESHOLDS[param].get("good", "N/A")
                if isinstance(threshold, list):
                    threshold = f"{threshold[0]}–{threshold[1]}"
                alerts.append({
                    "id": f"{loc}_{param}_{int(time.time())}",
                    "location": loc,
                    "category": "water",
                    "parameter": param,
                    "value": value,
                    "unit": unit,
                    "threshold": threshold,
                    "status": status,
                    "timestamp": reading["timestamp"],
                    "message": f"[{loc}] {param}: {value} {unit} — {status.upper()}",
                })
    alerts.sort(key=lambda x: (x["status"] == "bad", x["location"]), reverse=True)
    return jsonify(alerts[:20])

@app.route("/api/ai/analyze", methods=["POST"])
def api_ai_analyze():
    """Granite LLM analysis with remedies."""
    body = request.get_json() or {}
    location = body.get("location", "Vapi")
    data = sensor_data_store.get(location, [])
    if data:
        reading = data[-1]
    else:
        reading = simulate_sensor_reading(location)

    # Determine overall status
    bad_count, moderate_count = 0, 0
    violations = []
    for param, value in reading["air"].items():
        s = get_parameter_status(param, value, "air")
        unit = AIR_THRESHOLDS[param]["unit"]
        if s == "bad":
            bad_count += 1
            violations.append(f"AIR {param}={value}{unit} [BAD]")
        elif s == "moderate":
            moderate_count += 1
            violations.append(f"AIR {param}={value}{unit} [MODERATE]")
    for param, value in reading["water"].items():
        s = get_parameter_status(param, value, "water")
        unit = WATER_THRESHOLDS[param]["unit"]
        if s == "bad":
            bad_count += 1
            violations.append(f"WATER {param}={value}{unit} [BAD]")
        elif s == "moderate":
            moderate_count += 1
            violations.append(f"WATER {param}={value}{unit} [MODERATE]")

    overall = "bad" if bad_count >= 2 else ("moderate" if bad_count >= 1 or moderate_count >= 3 else "good")

    prompt = f"""You are an expert Environmental AI Agent monitoring industrial pollution in the Golden Corridor (Vapi, Ankleshwar, Vatva), Gujarat, India.

Location: {location}
Timestamp: {reading['timestamp']}
AQI: {reading['aqi']['value']} ({reading['aqi']['status']})
WQI: {reading['wqi']['value']} ({reading['wqi']['status']})
Overall Status: {overall.upper()}
Violations/Concerns: {', '.join(violations) if violations else 'None — all parameters within safe limits'}

As an AI pollution control advisor, provide:
1. A brief situation assessment (2-3 sentences)
2. Specific remedies and action steps for the current status
3. Regulatory compliance guidance under GPCB/CPCB norms

Be concise, actionable, and specific to chemical/manufacturing industries."""

    ai_response = call_granite(prompt)

    return jsonify({
        "location": location,
        "overall_status": overall,
        "bad_count": bad_count,
        "moderate_count": moderate_count,
        "violations": violations,
        "aqi": reading["aqi"],
        "wqi": reading["wqi"],
        "ai_response": ai_response,
        "timestamp": reading["timestamp"],
    })

@app.route("/api/ai/remedies", methods=["POST"])
def api_ai_remedies():
    """Get specific remedies for a parameter."""
    body = request.get_json() or {}
    param = body.get("parameter", "PM2_5")
    value = body.get("value", 0)
    category = body.get("category", "air")
    status = body.get("status", "moderate")
    location = body.get("location", "Vapi")

    unit = AIR_THRESHOLDS.get(param, {}).get("unit", "") if category == "air" else WATER_THRESHOLDS.get(param, {}).get("unit", "")

    prompt = f"""You are an industrial pollution remediation expert for the {location} industrial belt.

Parameter: {param}
Value: {value} {unit}
Category: {category.upper()} Pollution
Status: {status.upper()}
Location: {location}, Gujarat, India

Provide 5 specific, practical remediation steps for this parameter violation in a chemical/manufacturing industrial context. 
Include both immediate actions and long-term preventive measures.
Format as numbered list."""

    ai_response = call_granite(prompt)
    return jsonify({
        "parameter": param,
        "value": value,
        "unit": unit,
        "status": status,
        "location": location,
        "remedies": ai_response,
    })

@app.route("/api/summary")
def api_summary():
    """Dashboard summary statistics."""
    summary = {}
    for loc in LOCATIONS:
        data = sensor_data_store[loc]
        if not data:
            continue
        latest = data[-1]
        bad = sum(1 for p, v in latest["air"].items() if get_parameter_status(p, v, "air") == "bad")
        bad += sum(1 for p, v in latest["water"].items() if get_parameter_status(p, v, "water") == "bad")
        summary[loc] = {
            "aqi": latest["aqi"],
            "wqi": latest["wqi"],
            "bad_params": bad,
            "timestamp": latest["timestamp"],
        }
    return jsonify(summary)


# ════════════════════════════════════════════════════════════════════
#  NEW AI AGENTS
# ════════════════════════════════════════════════════════════════════

# ── 1. Pollution Prediction Agent ────────────────────────────────────────────
@app.route("/api/agents/prediction", methods=["POST"])
def agent_prediction():
    """Predict pollution levels for the next 1–6 hours using trend analysis + LLM."""
    body = request.get_json() or {}
    location = body.get("location", "Vapi")
    horizon_hours = int(body.get("horizon_hours", 3))

    history = sensor_data_store.get(location, [])
    if len(history) < 3:
        history = [simulate_sensor_reading(location) for _ in range(10)]

    # Simple linear trend per parameter from last 10 readings
    recent = history[-10:]
    trends = {}
    for param in ["PM2_5", "SO2", "NO2", "CO"]:
        vals = [r["air"][param] for r in recent]
        if len(vals) >= 2:
            slope = (vals[-1] - vals[0]) / max(len(vals) - 1, 1)
            trends[param] = {"current": round(vals[-1], 2), "slope_per_reading": round(slope, 3)}

    for param in ["BOD", "COD", "DO"]:
        vals = [r["water"][param] for r in recent]
        if len(vals) >= 2:
            slope = (vals[-1] - vals[0]) / max(len(vals) - 1, 1)
            trends[param] = {"current": round(vals[-1], 2), "slope_per_reading": round(slope, 3)}

    # Generate 6-hour forecast points (one per hour)
    latest = recent[-1]
    forecast = []
    for h in range(1, horizon_hours + 1):
        # readings per hour ≈ 12 (every 5s in sim → scale down for real projection)
        steps = h * 2
        hour_label = (datetime.now() + timedelta(hours=h)).strftime("%H:%M")
        point = {"hour": f"+{h}h ({hour_label})"}
        for param in ["PM2_5", "SO2", "NO2", "CO"]:
            if param in trends:
                projected = trends[param]["current"] + trends[param]["slope_per_reading"] * steps
                projected = max(0, round(projected * random.uniform(0.92, 1.08), 2))
                status = get_parameter_status(param, projected, "air")
                point[param] = {"value": projected, "status": status}
        forecast.append(point)

    # Determine risk trajectory
    pm_slope = trends.get("PM2_5", {}).get("slope_per_reading", 0)
    trajectory = "rising" if pm_slope > 0.5 else ("falling" if pm_slope < -0.5 else "stable")

    trend_summary = "; ".join(
        f"{p}: {v['current']} (slope {v['slope_per_reading']:+.3f}/reading)"
        for p, v in trends.items()
    )

    prompt = f"""You are a Pollution Prediction AI Agent for the {location} industrial zone, Gujarat.

Current Sensor Trends (last 10 readings):
{trend_summary}

AQI: {latest['aqi']['value']} ({latest['aqi']['status']})
Trajectory: {trajectory.upper()}
Forecast Horizon: {horizon_hours} hours

Based on the current trends and typical industrial activity patterns for a chemical belt:
1. Predict likely pollution levels for the next {horizon_hours} hours
2. Identify any early-warning signs of imminent spikes
3. Suggest pre-emptive actions to prevent violations
4. Specify which GPCB thresholds are at risk of being breached

Be data-driven and concise."""

    ai_response = call_granite(prompt)

    return jsonify({
        "agent": "Pollution Prediction Agent",
        "location": location,
        "trajectory": trajectory,
        "trends": trends,
        "forecast": forecast,
        "horizon_hours": horizon_hours,
        "ai_prediction": ai_response,
        "timestamp": datetime.now().isoformat(),
    })


# ── 2. Public Health Risk Assessment Agent ───────────────────────────────────
@app.route("/api/agents/health-risk", methods=["POST"])
def agent_health_risk():
    """Assess public health risk for communities near industrial zones."""
    body = request.get_json() or {}
    location = body.get("location", "Vapi")

    data = sensor_data_store.get(location, [])
    reading = data[-1] if data else simulate_sensor_reading(location)

    # Population exposure model
    population_data = {
        "Vapi":       {"population": 85000,  "sensitive_groups": 18000, "distance_km": 1.2},
        "Ankleshwar": {"population": 60000,  "sensitive_groups": 13000, "distance_km": 0.8},
        "Vatva":      {"population": 120000, "sensitive_groups": 26000, "distance_km": 0.5},
    }
    pop = population_data.get(location, {"population": 75000, "sensitive_groups": 15000, "distance_km": 1.0})

    aqi_val = reading["aqi"]["value"]
    wqi_val = reading["wqi"]["value"]

    # Risk scoring
    air_risk  = min(10, round(aqi_val / 50, 1))
    water_risk = min(10, round((100 - wqi_val) / 10, 1))
    combined_risk = round((air_risk * 0.6 + water_risk * 0.4), 1)

    if combined_risk >= 7:   risk_level, risk_color = "CRITICAL",  "#7f1d1d"
    elif combined_risk >= 5: risk_level, risk_color = "HIGH",      "#ef4444"
    elif combined_risk >= 3: risk_level, risk_color = "MODERATE",  "#eab308"
    else:                    risk_level, risk_color = "LOW",        "#22c55e"

    # Affected population estimate
    exposure_factor = min(1.0, combined_risk / 10)
    affected_pop = int(pop["population"] * exposure_factor * 0.3)
    sensitive_at_risk = int(pop["sensitive_groups"] * exposure_factor * 0.5)

    # Health effects mapping
    health_effects = []
    if reading["air"]["PM2_5"] > 60:
        health_effects.append("Respiratory irritation, aggravated asthma")
    if reading["air"]["SO2"] > 80:
        health_effects.append("Bronchospasm, eye/nose irritation")
    if reading["air"]["H2S"] > 10:
        health_effects.append("Nausea, headache, neurological effects")
    if reading["air"]["NO2"] > 80:
        health_effects.append("Lung inflammation, reduced immunity")
    if reading["water"]["HeavyMetals"] > 0.1:
        health_effects.append("Heavy metal poisoning risk from water source")
    if reading["water"]["BOD"] > 10:
        health_effects.append("Waterborne disease risk")
    if not health_effects:
        health_effects.append("No significant health effects at current levels")

    prompt = f"""You are a Public Health Risk Assessment AI Agent for the {location} industrial corridor.

Location: {location}, Gujarat — Population: {pop['population']:,}
Sensitive Groups (elderly, children, asthmatics): {pop['sensitive_groups']:,}
Proximity to industrial zone: {pop['distance_km']} km

Current Air Quality Index: {aqi_val} ({reading['aqi']['status']})
Current Water Quality Index: {wqi_val} ({reading['wqi']['status']})
Combined Health Risk Score: {combined_risk}/10 — {risk_level}
Estimated affected population: ~{affected_pop:,}
Sensitive individuals at risk: ~{sensitive_at_risk:,}
Observed health effects: {'; '.join(health_effects)}

As a public health AI agent, provide:
1. Immediate health advisory for the community
2. Specific guidance for sensitive groups (children, elderly, pregnant women)
3. Recommended protective actions
4. Threshold at which evacuation should be considered
5. Long-term health monitoring recommendations

Be specific and actionable for this industrial community."""

    ai_response = call_granite(prompt)

    return jsonify({
        "agent": "Public Health Risk Assessment Agent",
        "location": location,
        "risk_score": combined_risk,
        "risk_level": risk_level,
        "risk_color": risk_color,
        "air_risk": air_risk,
        "water_risk": water_risk,
        "population": pop["population"],
        "sensitive_groups": pop["sensitive_groups"],
        "affected_estimate": affected_pop,
        "sensitive_at_risk": sensitive_at_risk,
        "health_effects": health_effects,
        "ai_assessment": ai_response,
        "timestamp": datetime.now().isoformat(),
    })


# ── 3. Pollution Source Identification Agent ──────────────────────────────────
@app.route("/api/agents/source-identification", methods=["POST"])
def agent_source_identification():
    """Identify likely industrial sources responsible for current pollution levels."""
    body = request.get_json() or {}
    location = body.get("location", "Vapi")

    data = sensor_data_store.get(location, [])
    reading = data[-1] if data else simulate_sensor_reading(location)
    sources = INDUSTRIAL_SOURCES.get(location, [])

    # Find which parameters are bad/moderate
    elevated_params = []
    for param, value in reading["air"].items():
        s = get_parameter_status(param, value, "air")
        if s in ("bad", "moderate"):
            elevated_params.append((param, value, "air", s))
    for param, value in reading["water"].items():
        s = get_parameter_status(param, value, "water")
        if s in ("bad", "moderate"):
            elevated_params.append((param, value, "water", s))

    # Score each source based on which elevated parameters they emit
    source_scores = []
    for src in sources:
        score = 0
        matching_params = []
        for param, value, cat, status in elevated_params:
            if src["type"] in PARAM_SOURCE_MAP.get(param, []):
                weight = 2 if status == "bad" else 1
                score += weight
                matching_params.append(param)
        source_scores.append({
            **src,
            "responsibility_score": score,
            "matching_parameters": matching_params,
            "likelihood": "High" if score >= 3 else ("Medium" if score >= 1 else "Low"),
            "likelihood_color": "#ef4444" if score >= 3 else ("#eab308" if score >= 1 else "#22c55e"),
        })

    source_scores.sort(key=lambda x: x["responsibility_score"], reverse=True)
    top_sources = source_scores[:3]

    elevated_summary = "; ".join(f"{p}={v:.2f}({cat},{s})" for p, v, cat, s in elevated_params[:6])

    prompt = f"""You are a Pollution Source Identification AI Agent for the {location} industrial zone.

Elevated Parameters: {elevated_summary if elevated_summary else 'None — all within limits'}

Top Suspected Sources:
{chr(10).join(f"  {i+1}. {s['name']} ({s['type']}) — Score: {s['responsibility_score']}, Matching params: {s['matching_parameters']}" for i, s in enumerate(top_sources))}

As a source identification expert:
1. Analyze which industrial units are most likely responsible
2. Explain the chemical/industrial process links for each suspected source
3. Recommend targeted inspection priorities for GPCB inspectors
4. Suggest fingerprinting tests to confirm source attribution
5. Estimate the emission load contribution percentage for top sources

Be technical and evidence-based."""

    ai_response = call_granite(prompt)

    return jsonify({
        "agent": "Pollution Source Identification Agent",
        "location": location,
        "elevated_parameters": [
            {"parameter": p, "value": v, "category": cat, "status": s}
            for p, v, cat, s in elevated_params
        ],
        "source_analysis": source_scores,
        "top_suspects": top_sources,
        "ai_analysis": ai_response,
        "timestamp": datetime.now().isoformat(),
    })


# ── 4. Anomaly Detection Agent ────────────────────────────────────────────────
@app.route("/api/agents/anomaly-detection", methods=["POST"])
def agent_anomaly_detection():
    """Detect statistical anomalies (spikes, sudden drops) in sensor data."""
    body = request.get_json() or {}
    location = body.get("location", "Vapi")

    history = sensor_data_store.get(location, [])
    if len(history) < 5:
        history = [simulate_sensor_reading(location) for _ in range(15)]

    recent = history[-20:]
    anomalies = []

    # Z-score anomaly detection for air params
    air_params  = ["PM2_5", "PM10", "SO2", "NO2", "CO", "O3", "VOC", "H2S"]
    water_params = ["BOD", "COD", "TDS", "Turbidity", "Nitrates", "HeavyMetals"]

    def detect_anomalies_for(param_list, category):
        for param in param_list:
            vals = [r[category][param] for r in recent]
            if len(vals) < 3:
                continue
            mean = sum(vals) / len(vals)
            variance = sum((v - mean) ** 2 for v in vals) / len(vals)
            std = variance ** 0.5
            if std == 0:
                continue
            latest_val = vals[-1]
            z_score = (latest_val - mean) / std
            # Spike: z > 2.0, Drop: z < -2.0
            if abs(z_score) >= 1.8:
                anomaly_type = "spike" if z_score > 0 else "sudden_drop"
                severity = "critical" if abs(z_score) >= 2.5 else "warning"
                unit = AIR_THRESHOLDS[param]["unit"] if category == "air" else WATER_THRESHOLDS[param]["unit"]
                anomalies.append({
                    "parameter": param,
                    "category": category,
                    "current_value": round(latest_val, 2),
                    "mean_value": round(mean, 2),
                    "std_dev": round(std, 2),
                    "z_score": round(z_score, 2),
                    "anomaly_type": anomaly_type,
                    "severity": severity,
                    "unit": unit,
                    "description": f"{param} is {abs(z_score):.1f}σ {'above' if z_score > 0 else 'below'} baseline",
                })

    detect_anomalies_for(air_params, "air")
    detect_anomalies_for(water_params, "water")
    anomalies.sort(key=lambda x: abs(x["z_score"]), reverse=True)

    anomaly_summary = "; ".join(
        f"{a['parameter']}(z={a['z_score']:+.2f},{a['anomaly_type']})"
        for a in anomalies[:5]
    ) or "No anomalies detected"

    prompt = f"""You are an Anomaly Detection AI Agent for the {location} industrial pollution monitoring system.

Statistical Anomalies Detected (z-score based):
{anomaly_summary}

Total anomalies found: {len(anomalies)}
Critical anomalies: {sum(1 for a in anomalies if a['severity'] == 'critical')}

As an anomaly detection specialist:
1. Interpret the statistical significance of each anomaly
2. Determine if these are isolated spikes or sustained violations
3. Identify potential causes (equipment malfunction, batch dumping, weather)
4. Recommend immediate investigation steps
5. Suggest threshold adjustments to reduce false positives

Be precise and technically rigorous."""

    ai_response = call_granite(prompt)

    return jsonify({
        "agent": "Anomaly Detection Agent",
        "location": location,
        "total_anomalies": len(anomalies),
        "critical_count": sum(1 for a in anomalies if a["severity"] == "critical"),
        "warning_count": sum(1 for a in anomalies if a["severity"] == "warning"),
        "anomalies": anomalies,
        "ai_analysis": ai_response,
        "timestamp": datetime.now().isoformat(),
    })


# ── 5. Citizen Complaint Analysis Agent ───────────────────────────────────────
@app.route("/api/agents/complaints", methods=["POST"])
def agent_complaints_submit():
    """Submit and analyze a citizen complaint."""
    body = request.get_json() or {}
    complaint_text = body.get("complaint", "")
    complainant_location = body.get("location", "Vapi")
    complaint_type = body.get("type", "odor")  # odor, dust, water, noise, other

    if not complaint_text:
        return jsonify({"error": "Complaint text is required"}), 400

    complaint_id = f"CMP-{int(time.time())}-{random.randint(100,999)}"
    complaint_record = {
        "id": complaint_id,
        "text": complaint_text,
        "location": complainant_location,
        "type": complaint_type,
        "timestamp": datetime.now().isoformat(),
        "status": "received",
    }
    complaint_store.append(complaint_record)

    # Match complaint to current sensor data
    data = sensor_data_store.get(complainant_location, [])
    reading = data[-1] if data else simulate_sensor_reading(complainant_location)
    aqi = reading["aqi"]["value"]
    wqi = reading["wqi"]["value"]

    # Correlate complaint type with sensor params
    type_param_map = {
        "odor":  ["H2S", "VOC", "SO2"],
        "dust":  ["PM2_5", "PM10"],
        "water": ["BOD", "COD", "pH", "HeavyMetals"],
        "smoke": ["PM2_5", "CO", "SO2"],
        "other": ["PM2_5", "SO2"],
    }
    correlated_params = type_param_map.get(complaint_type, ["PM2_5", "SO2"])
    sensor_corroboration = []
    for p in correlated_params:
        cat = "air" if p in reading["air"] else "water"
        val = reading[cat].get(p)
        if val is not None:
            s = get_parameter_status(p, val, cat)
            sensor_corroboration.append(f"{p}={val} [{s.upper()}]")

    prompt = f"""You are a Citizen Complaint Analysis AI Agent for the {complainant_location} industrial zone.

Complaint ID: {complaint_id}
Complaint Type: {complaint_type.upper()}
Complaint Text: "{complaint_text}"
Location: {complainant_location}
Time: {complaint_record['timestamp']}

Corroborating Sensor Data: {', '.join(sensor_corroboration) if sensor_corroboration else 'No corroboration found'}
Current AQI: {aqi}, WQI: {wqi}

As a complaint analysis AI agent:
1. Assess the validity and urgency of this complaint against sensor data
2. Classify the likely pollution source causing this complaint
3. Recommend investigation steps for GPCB field officers
4. Suggest timeline for resolution (immediate/24h/72h/scheduled)
5. Draft a brief acknowledgment response for the complainant

Be empathetic to the citizen while being technically precise."""

    ai_response = call_granite(prompt)
    complaint_record["ai_analysis"] = ai_response
    complaint_record["sensor_corroboration"] = sensor_corroboration

    return jsonify({
        "agent": "Citizen Complaint Analysis Agent",
        "complaint_id": complaint_id,
        "location": complainant_location,
        "type": complaint_type,
        "sensor_corroboration": sensor_corroboration,
        "ai_analysis": ai_response,
        "timestamp": complaint_record["timestamp"],
    })


@app.route("/api/agents/complaints/list", methods=["GET"])
def agent_complaints_list():
    """List all submitted complaints."""
    location = request.args.get("location")
    result = complaint_store if not location else [c for c in complaint_store if c["location"] == location]
    return jsonify(list(reversed(result[-30:])))


# ── 6. Environmental Risk Scoring Agent ───────────────────────────────────────
@app.route("/api/agents/risk-scoring", methods=["POST"])
def agent_risk_scoring():
    """Compute a comprehensive environmental risk score across all locations."""
    body = request.get_json() or {}
    location = body.get("location", "Vapi")

    data = sensor_data_store.get(location, [])
    reading = data[-1] if data else simulate_sensor_reading(location)

    # ── Scoring dimensions (each 0–100, weighted) ──────────────────
    # 1. Air Quality Score (higher = worse)
    air_scores = {}
    for param, value in reading["air"].items():
        s = get_parameter_status(param, value, "air")
        air_scores[param] = 100 if s == "bad" else (50 if s == "moderate" else 10)
    air_risk_score = round(sum(air_scores.values()) / len(air_scores), 1)

    # 2. Water Quality Score
    water_scores = {}
    for param, value in reading["water"].items():
        s = get_parameter_status(param, value, "water")
        water_scores[param] = 100 if s == "bad" else (50 if s == "moderate" else 10)
    water_risk_score = round(sum(water_scores.values()) / len(water_scores), 1)

    # 3. Regulatory Compliance Score (% of parameters in violation)
    total_params = len(reading["air"]) + len(reading["water"])
    violations = (
        sum(1 for p, v in reading["air"].items() if get_parameter_status(p, v, "air") != "good") +
        sum(1 for p, v in reading["water"].items() if get_parameter_status(p, v, "water") != "good")
    )
    compliance_score = round((violations / total_params) * 100, 1)

    # 4. Trend Risk (based on AQI trend from last readings)
    recent_aqis = [r["aqi"]["value"] for r in (data[-6:] if len(data) >= 6 else data)]
    if len(recent_aqis) >= 2:
        aqi_trend = (recent_aqis[-1] - recent_aqis[0]) / max(len(recent_aqis) - 1, 1)
        trend_score = min(100, max(0, 50 + aqi_trend * 5))
    else:
        trend_score = 50.0

    # 5. Composite Environmental Risk Index (ERI)
    eri = round(
        air_risk_score * 0.30 +
        water_risk_score * 0.25 +
        compliance_score * 0.25 +
        trend_score * 0.20,
        1
    )

    if eri >= 75:    eri_level, eri_color = "CRITICAL",  "#7f1d1d"
    elif eri >= 55:  eri_level, eri_color = "HIGH",      "#ef4444"
    elif eri >= 35:  eri_level, eri_color = "MODERATE",  "#eab308"
    elif eri >= 15:  eri_level, eri_color = "LOW",       "#84cc16"
    else:            eri_level, eri_color = "MINIMAL",   "#22c55e"

    # Sub-index summary
    dimensions = [
        {"name": "Air Quality Risk",       "score": air_risk_score,   "weight": "30%"},
        {"name": "Water Quality Risk",     "score": water_risk_score, "weight": "25%"},
        {"name": "Compliance Deficit",     "score": compliance_score, "weight": "25%"},
        {"name": "Pollution Trend Risk",   "score": round(trend_score, 1), "weight": "20%"},
    ]

    prompt = f"""You are an Environmental Risk Scoring AI Agent for the {location} industrial zone.

Environmental Risk Index (ERI): {eri}/100 — {eri_level}

Risk Dimensions:
- Air Quality Risk Score: {air_risk_score}/100
- Water Quality Risk Score: {water_risk_score}/100
- Regulatory Compliance Deficit: {compliance_score}%
- Pollution Trend Risk: {round(trend_score,1)}/100

AQI: {reading['aqi']['value']} ({reading['aqi']['status']})
WQI: {reading['wqi']['value']} ({reading['wqi']['status']})

As an environmental risk scoring specialist:
1. Interpret the composite ERI score in regulatory context
2. Identify which dimensions contribute most to the risk
3. Provide GPCB/CPCB compliance rating (Green/Orange/Red category)
4. Recommend specific risk mitigation priorities ranked by impact
5. Estimate timeline to bring ERI to acceptable levels (<35)

Be quantitative and compliance-focused."""

    ai_response = call_granite(prompt)

    return jsonify({
        "agent": "Environmental Risk Scoring Agent",
        "location": location,
        "eri": eri,
        "eri_level": eri_level,
        "eri_color": eri_color,
        "dimensions": dimensions,
        "air_param_scores": air_scores,
        "water_param_scores": water_scores,
        "compliance_violation_pct": compliance_score,
        "ai_scoring": ai_response,
        "timestamp": datetime.now().isoformat(),
    })


# ── Environmental Dashboard Agent ────────────────────────────────────────────
@app.route("/api/agents/env-dashboard", methods=["POST"])
def agent_env_dashboard():
    """Generate a comprehensive environmental snapshot across all locations."""
    body = request.get_json() or {}
    location = body.get("location", "all")

    # Gather data for all (or one) location
    if location == "all":
        target_locs = LOCATIONS
    else:
        loc = location.capitalize()
        target_locs = [loc] if loc in LOCATIONS else LOCATIONS

    snapshot = {}
    overall_bad = 0
    worst_location = None
    worst_score = -1

    for loc in target_locs:
        data = sensor_data_store.get(loc, [])
        reading = data[-1] if data else simulate_sensor_reading(loc)
        bad = sum(1 for p, v in reading["air"].items() if get_parameter_status(p, v, "air") == "bad")
        bad += sum(1 for p, v in reading["water"].items() if get_parameter_status(p, v, "water") == "bad")
        moderate = sum(1 for p, v in reading["air"].items() if get_parameter_status(p, v, "air") == "moderate")
        moderate += sum(1 for p, v in reading["water"].items() if get_parameter_status(p, v, "water") == "moderate")
        total = len(reading["air"]) + len(reading["water"])
        compliance_pct = round((total - bad - moderate) / total * 100, 1)
        overall_bad += bad
        if bad > worst_score:
            worst_score = bad
            worst_location = loc

        # Historical AQI trend (last 10)
        aqi_history = [r["aqi"]["value"] for r in (data[-10:] if len(data) >= 10 else data)]
        wqi_history = [r["wqi"]["value"] for r in (data[-10:] if len(data) >= 10 else data)]

        snapshot[loc] = {
            "aqi": reading["aqi"],
            "wqi": reading["wqi"],
            "bad_params": bad,
            "moderate_params": moderate,
            "compliance_pct": compliance_pct,
            "aqi_trend": aqi_history,
            "wqi_trend": wqi_history,
            "timestamp": reading["timestamp"],
            "top_violations": [
                {"param": p, "value": v, "cat": "air"}
                for p, v in reading["air"].items()
                if get_parameter_status(p, v, "air") == "bad"
            ][:3] + [
                {"param": p, "value": v, "cat": "water"}
                for p, v in reading["water"].items()
                if get_parameter_status(p, v, "water") == "bad"
            ][:3],
        }

    # Cross-location comparison
    comparison_summary = "; ".join(
        f"{loc}: AQI={snapshot[loc]['aqi']['value']}({snapshot[loc]['aqi']['status']}), "
        f"WQI={snapshot[loc]['wqi']['value']}({snapshot[loc]['wqi']['status']}), "
        f"Bad={snapshot[loc]['bad_params']}"
        for loc in target_locs if loc in snapshot
    )

    prompt = f"""You are an Environmental Dashboard AI Agent providing a comprehensive monitoring summary for the Golden Corridor industrial belt.

Monitoring Summary Across Locations:
{comparison_summary}

Worst Location: {worst_location} ({worst_score} parameters in violation)
Total Bad Parameters Across All Zones: {overall_bad}

As an environmental dashboard specialist, provide:
1. Executive summary of current environmental status across the Golden Corridor
2. Ranking of locations by pollution severity with key metrics
3. Most critical parameters requiring immediate attention
4. Comparison with previous typical patterns for this industrial belt
5. Priority action list for environmental managers today
6. Overall compliance rating (Green/Orange/Red) for GPCB reporting

Format as a structured dashboard briefing. Be concise and data-driven."""

    ai_response = call_granite(prompt)

    return jsonify({
        "agent": "Environmental Dashboard Agent",
        "locations": target_locs,
        "snapshot": snapshot,
        "worst_location": worst_location,
        "total_bad_params": overall_bad,
        "ai_summary": ai_response,
        "timestamp": datetime.now().isoformat(),
    })


# ── AI Assistant Agent (Multilingual Chat) ────────────────────────────────────
@app.route("/api/agents/assistant", methods=["POST"])
def agent_assistant():
    """Conversational AI assistant for pollution queries in English, Gujarati, Hindi."""
    body = request.get_json() or {}
    user_message = body.get("message", "")
    language = body.get("language", "english")   # english | gujarati | hindi
    location = body.get("location", "Vapi")
    history = body.get("history", [])            # [{role, content}, ...]

    if not user_message.strip():
        return jsonify({"error": "Message cannot be empty"}), 400

    # Get current sensor context
    data = sensor_data_store.get(location, [])
    reading = data[-1] if data else simulate_sensor_reading(location)

    # Build context string
    aqi = reading["aqi"]
    wqi = reading["wqi"]
    bad_air  = [f"{p}={v}" for p, v in reading["air"].items() if get_parameter_status(p, v, "air") == "bad"]
    bad_water = [f"{p}={v}" for p, v in reading["water"].items() if get_parameter_status(p, v, "water") == "bad"]

    # Build system prompt based on language
    lang_instructions = {
        "english": "Respond in English. Be conversational, helpful, and clear.",
        "gujarati": "તમારો જવાબ ગુજરાતી ભાષામાં આપો. સ્પષ્ટ અને સરળ ભાષા વાપરો. (Respond entirely in Gujarati language.)",
        "hindi": "हिंदी में जवाब दें। सरल और स्पष्ट भाषा उपयोग करें। (Respond entirely in Hindi language.)",
    }
    lang_instr = lang_instructions.get(language, lang_instructions["english"])

    # Format chat history
    history_text = ""
    if history:
        history_text = "\n".join(
            f"{'User' if h['role'] == 'user' else 'Assistant'}: {h['content']}"
            for h in history[-6:]  # last 3 turns
        )
        history_text = f"\nConversation so far:\n{history_text}\n"

    prompt = f"""You are an Environmental AI Assistant for the Smart Industrial Pollution Monitoring System in the Golden Corridor (Vapi, Ankleshwar, Vatva), Gujarat, India. You help citizens, regulators, and industrial managers understand pollution data, get remedies, and take action.

{lang_instr}

Current Sensor Data for {location}:
- AQI: {aqi['value']} ({aqi['status']})
- WQI: {wqi['value']} ({wqi['status']})
- Bad Air Parameters: {', '.join(bad_air) if bad_air else 'None'}
- Bad Water Parameters: {', '.join(bad_water) if bad_water else 'None'}
{history_text}
User's Question: {user_message}

Answer the user's question helpfully. If they ask about pollution data, use the current sensor readings above. If they ask for remedies or actions, be specific and practical. If they ask about health effects, be clear and empathetic. Keep your response concise (3-5 sentences max unless a detailed list is needed)."""

    ai_response = call_granite(prompt)

    # If Granite is unavailable, provide language-specific fallback
    if "CRITICAL" in ai_response or "MODERATE" in ai_response or "GOOD" in ai_response:
        # It's the generic fallback; try to adapt it to the language context
        pass

    return jsonify({
        "agent": "Environmental AI Assistant",
        "message": user_message,
        "language": language,
        "location": location,
        "response": ai_response,
        "context": {
            "aqi": aqi,
            "wqi": wqi,
        },
        "timestamp": datetime.now().isoformat(),
    })


if __name__ == "__main__":
    print("=" * 60)
    print("  Smart Industrial Pollution Monitoring System")
    print("  Golden Corridor — Vapi | Ankleshwar | Vatva")
    print("  Backend API: http://localhost:5000")
    print("=" * 60)
    app.run(debug=False, host="0.0.0.0", port=5000, threaded=True)
