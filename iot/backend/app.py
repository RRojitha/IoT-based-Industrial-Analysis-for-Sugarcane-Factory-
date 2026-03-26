import os
import joblib
import numpy as np
import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient

app = Flask(__name__)
CORS(app)

# ================================
# MongoDB Configuration
# ================================
try:
    client = MongoClient("mongodb+srv://admin:12344321@cluster0.k5lnxxf.mongodb.net/?appName=Cluster0", serverSelectionTimeoutMS=10000)
    db = client["sugarcane_db"]
    predictions_col = db["predictions"]
    # Check connection
    client.server_info()
    print("✅ MongoDB Connected Successfully")
except Exception as e:
    print(f"❌ MongoDB Connection Failed: {e}")
    predictions_col = None

# ================================
# Model Paths
# ================================

MODEL1_PATH = "juice_quality_model.pkl"
MODEL2_PATH = "production_model.pkl"

QUALITY_ENCODER_PATH = "quality_encoder.pkl"
VARIETY_ENCODER_PATH = "variety_encoder.pkl"

# ================================
# Load Resources
# ================================

def load_resource(path):
    if os.path.exists(path):
        return joblib.load(path)
    return None

model1 = load_resource(MODEL1_PATH)
model2 = load_resource(MODEL2_PATH)

le_quality = load_resource(QUALITY_ENCODER_PATH)
le_variety = load_resource(VARIETY_ENCODER_PATH)

# ================================
# Prediction Function
# ================================

def get_prediction_data(data):
    # Normalize variety names to match encoder
    variety_raw = data.get("variety", "CO86032")
    variety_map = {
        "CO86032": "CO86032",
        "CO0238": "Co0238",
        "BO91": "BO91",
        "COC671": "COC671"
    }
    variety = variety_map.get(variety_raw.upper(), variety_raw)
    
    brix = float(data.get("brix", 0))
    sucrose = float(data.get("sucrose", 0))
    fiber = float(data.get("fiber", 0))
    moisture = float(data.get("moisture", 0))
    age = float(data.get("age", 0))
    weight = float(data.get("weight", 0)) # Default to 0 Ton so analysis stays hidden unless requested

    # STEP 1: VALIDATE INPUTS
    invalid_reasons = []
    if brix < 0 or brix > 35: invalid_reasons.append(f"Brix {brix} out of bounds (0-35)")
    if sucrose < 0 or sucrose > brix: invalid_reasons.append(f"Sucrose {sucrose} out of bounds (0-{brix})")
    if fiber < 0 or fiber > 30: invalid_reasons.append(f"Fiber {fiber} out of bounds (0-30)")
    if moisture < 0 or moisture > 100: invalid_reasons.append(f"Moisture {moisture} out of bounds (0-100)")

    if invalid_reasons:
        return {
            "Predicted_Quality": "Poor",
            "Explanation": "❌ Invalid Input Data: " + ", ".join(invalid_reasons),
            "Suggestion": "Reject (Impossible Values)",
            "detected_issues": invalid_reasons,
            "Production_Estimates": {
                "Sugar_Recovery_Percent": 0, "Sugar_kg_per_ton": 0, "Molasses_kg_per_ton": 0, "Bagasse_kg_per_ton": 0,
                "Total_Sugar_kg": 0, "Total_Molasses_kg": 0, "Total_Bagasse_kg": 0
            }
        }

    # STEP 2: DERIVED METRIC
    purity = round((sucrose / brix) * 100, 2) if brix > 0 else 0
    if purity > 100:
        return {
            "Predicted_Quality": "Poor",
            "Explanation": "❌ Invalid Input Data: Purity > 100%",
            "Suggestion": "Reject (Inconsistent Data)",
            "detected_issues": ["Purity cannot exceed 100%"],
            "Production_Estimates": {
                "Sugar_Recovery_Percent": 0, "Sugar_kg_per_ton": 0, "Molasses_kg_per_ton": 0, "Bagasse_kg_per_ton": 0,
                "Total_Sugar_kg": 0, "Total_Molasses_kg": 0, "Total_Bagasse_kg": 0
            }
        }

    # STEP 3: AGRONOMIC CONSISTENCY CHECKS
    warnings = []
    if brix > 20 and sucrose < 10: warnings.append("High Brix with low Sucrose (Poor Purity / Deteriorated cane)")
    if moisture > 80 and brix < 15: warnings.append("High Moisture with low Brix (Immature cane)")
    if moisture < 60: warnings.append("Low Moisture (Dried/stale cane)")
    if fiber > 18: warnings.append("High Fiber (Difficult juice extraction)")
    if purity < 70: warnings.append("Low Purity (High impurities or deterioration)")

    # STEP 4 & 5: FINAL DECISION LOGIC
    quality = "Medium"
    if purity > 85 and sucrose > 12 and brix > 18 and (10 <= fiber <= 14) and (65 <= moisture <= 72):
        quality = "Good"
    elif purity < 75 or sucrose < 10 or brix < 16 or fiber > 16 or moisture < 65 or moisture > 78:
        quality = "Poor"

    # STEP 8: RECOMMENDATION RULES
    if quality == "Good":
        recommendation = "Harvest immediately"
        explanation = "✅ Optimal quality parameters met."
    elif quality == "Medium":
        recommendation = "Wait for maturation"
        explanation = "⚠️ Acceptable but sub-optimal parameters."
    else:
        recommendation = "Not suitable for processing"
        explanation = "❌ Poor quality sugarcane."

    # STEP 6: SUGAR RECOVERY ESTIMATION
    recovery = round(sucrose * 0.85, 2)
    
    # Calculate yields based on class balance estimates
    sugar_kg = round((recovery / 100) * 1000, 2)
    molasses_kg = 45.0  # Industry standard approx per ton
    bagasse_kg = round(fiber * 21.0, 2) # Fiber extrapolated to wet bagasse

    return {
        "Predicted_Quality": quality,
        "Explanation": explanation,
        "Suggestion": recommendation,
        "detected_issues": warnings,
        "Production_Estimates": {
            "Sugar_Recovery_Percent": recovery,
            "Sugar_kg_per_ton": sugar_kg,
            "Molasses_kg_per_ton": molasses_kg,
            "Bagasse_kg_per_ton": bagasse_kg,
            "Total_Sugar_kg": round(sugar_kg * weight, 2),
            "Total_Molasses_kg": round(molasses_kg * weight, 2),
            "Total_Bagasse_kg": round(bagasse_kg * weight, 2)
        }
    }

# ================================
# API ROUTES
# ================================

latest_sensor_data = {"timestamp": 0}

@app.route("/latest-sensor-data", methods=["GET"])
def get_latest_sensor_data():
    return jsonify(latest_sensor_data)

@app.route("/predict", methods=["POST"])
def predict():
    global latest_sensor_data
    try:
        data = request.json
        
        # If it came EXCLUSIVELY from the ESP32 bridge, cache it for the frontend UI auto-fill
        if data.get("source") == "ESP32_BRIDGE":
            latest_sensor_data = data.copy()
            latest_sensor_data["timestamp"] = datetime.datetime.utcnow().timestamp()
            
        result = get_prediction_data(data)
        
        # Save to MongoDB if available
        if predictions_col is not None:
            record = {
                "variety": data.get("variety", "Unknown"),
                "location": data.get("location", "Unknown"),
                "brix": float(data.get("brix", 0)),
                "sucrose": float(data.get("sucrose", 0)),
                "purity": float(data.get("purity", 0)),
                "weight_tons": float(data.get("weight", 1)),
                "predicted_quality": result["Predicted_Quality"],
                "sugar_recovery": result["Production_Estimates"]["Sugar_Recovery_Percent"],
                "total_sugar_kg": result["Production_Estimates"]["Total_Sugar_kg"],
                "timestamp": datetime.datetime.utcnow()
            }
            predictions_col.insert_one(record)
            
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/analytics", methods=["GET"])
def get_analytics():
    if predictions_col is None:
        return jsonify({"error": "Database not connected"}), 500
        
    try:
        # Get start of current month
        now = datetime.datetime.utcnow()
        start_of_month = datetime.datetime(now.year, now.month, 1)
        
        # 1. Which village had the highest average sucrose this month?
        village_pipeline = [
            {"$match": {"timestamp": {"$gte": start_of_month}}},
            {"$group": {"_id": "$location", "avg_sucrose": {"$avg": "$sucrose"}}},
            {"$sort": {"avg_sucrose": -1}},
            {"$limit": 5}
        ]
        top_villages = list(predictions_col.aggregate(village_pipeline))
        
        # 2. Which variety had the highest average sucrose this month?
        variety_pipeline = [
            {"$match": {"timestamp": {"$gte": start_of_month}}},
            {"$group": {"_id": "$variety", "avg_sucrose": {"$avg": "$sucrose"}}},
            {"$sort": {"avg_sucrose": -1}},
            {"$limit": 5}
        ]
        top_varieties = list(predictions_col.aggregate(variety_pipeline))
        
        return jsonify({
            "top_villages": top_villages,
            "top_varieties": top_varieties,
            "month": now.strftime("%B %Y")
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/predict-batch", methods=["POST"])
def predict_batch():
    try:
        data = request.json
        samples = data.get("samples", [])
        results = []
        for sample in samples:
            prediction = get_prediction_data(sample)
            results.append({
                "Sample_ID": sample.get("id", "Unknown"),
                "Quality": prediction["Predicted_Quality"],
                "Sugar_Recovery": prediction["Production_Estimates"]["Sugar_Recovery_Percent"],
                "Sugar_kg": prediction["Production_Estimates"]["Sugar_kg_per_ton"],
                "Molasses_kg": prediction["Production_Estimates"]["Molasses_kg_per_ton"],
                "Bagasse_kg": prediction["Production_Estimates"]["Bagasse_kg_per_ton"],
                "Issues": prediction["detected_issues"]
            })
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    app.run(port=5000)