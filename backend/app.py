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
    client = MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=2000)
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
    purity = float(data.get("purity", 0))
    fiber = float(data.get("fiber", 0))
    moisture = float(data.get("moisture", 0))
    age = float(data.get("age", 0))

    issues = []

    if sucrose < 14: issues.append("Low sucrose")
    if brix < 18: issues.append("Low brix")
    if purity < 85: issues.append("Low purity")
    if fiber > 15: issues.append("High fiber")
    if moisture > 75: issues.append("High moisture")
    if age > 14: issues.append("Over-aged cane")

    # Encode variety for input
    variety_encoded = 0
    if le_variety:
        try:
            variety_encoded = le_variety.transform([variety])[0]
        except Exception as e:
            print(f"Variety Encoding Error: [{variety}] {e}")
            variety_encoded = 0

    prediction_label = "Average"

    # ================================
    # MODEL 1 → QUALITY PREDICTION
    # ================================
    if model1 and le_quality:
        try:
            # Model 1 expects 7 features: ['Sucrose', 'Brix', 'Purity', 'Fiber', 'Moisture', 'Cane_Variety', 'Cane_Age']
            input_data = np.array([[
                sucrose,
                brix,
                purity,
                fiber,
                moisture,
                variety_encoded,
                age
            ]])
            prediction_encoded = model1.predict(input_data)[0]
            prediction_label = le_quality.inverse_transform([prediction_encoded])[0]
        except Exception as e:
            print("Model 1 Prediction Error:", e)
            prediction_label = "Average"

    # ================================
    # MODEL 2 → PRODUCTION PREDICTION
    # ================================
    sugar_recovery = 0.0
    sugar_kg = 0.0
    molasses_kg = 0.0
    bagasse_kg = 0.0

    if model2 and le_quality:
        try:
            # First, encode the predicted quality for Model 2 input
            quality_encoded = le_quality.transform([prediction_label])[0]
            
            # Model 2 expects 8 features: ['Sucrose', 'Brix', 'Purity', 'Fiber', 'Moisture', 'Cane_Variety', 'Cane_Age', 'Predicted_Quality']
            model2_input = np.array([[
                sucrose,
                brix,
                purity,
                fiber,
                moisture,
                variety_encoded,
                age,
                quality_encoded
            ]])
            production = model2.predict(model2_input)[0]
            sugar_recovery = round(float(production[0]), 2)
            sugar_kg = round(float(production[1]), 2)
            molasses_kg = round(float(production[2]), 2)
            bagasse_kg = round(float(production[3]), 2)
        except Exception as e:
            print("Model 2 Prediction Error:", e)

    if prediction_label == "Poor":
        explanation = "❌ Cane quality is below acceptable standards."
        suggestion = "Corrective actions required before processing."
    elif prediction_label == "Average":
        explanation = "⚠️ Cane quality is acceptable but not optimal."
        suggestion = "Minor improvements recommended."
    else:
        explanation = "✅ Cane quality is good."
        suggestion = "Safe for processing with optimal recovery."

    return {
        "Predicted_Quality": prediction_label,
        "Explanation": explanation,
        "Suggestion": suggestion,
        "detected_issues": issues,
        "Production_Estimates": {
            "Sugar_Recovery_Percent": sugar_recovery,
            "Sugar_kg_per_ton": sugar_kg,
            "Molasses_kg_per_ton": molasses_kg,
            "Bagasse_kg_per_ton": bagasse_kg
        }
    }

# ================================
# API ROUTES
# ================================

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.json
        result = get_prediction_data(data)
        
        # Save to MongoDB if available
        if predictions_col is not None:
            record = {
                "variety": data.get("variety", "Unknown"),
                "location": data.get("location", "Unknown"),
                "brix": float(data.get("brix", 0)),
                "sucrose": float(data.get("sucrose", 0)),
                "purity": float(data.get("purity", 0)),
                "predicted_quality": result["Predicted_Quality"],
                "sugar_recovery": result["Production_Estimates"]["Sugar_Recovery_Percent"],
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