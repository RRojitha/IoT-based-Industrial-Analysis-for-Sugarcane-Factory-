import os
import joblib
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Load model and encoders
MODEL_PATH = "juice_quality_model.pkl"
QUALITY_ENCODER_PATH = "quality_encoder.pkl"
VARIETY_ENCODER_PATH = "variety_encoder.pkl"

def load_resource(path):
    if os.path.exists(path):
        return joblib.load(path)
    return None

model = load_resource(MODEL_PATH)
le_quality = load_resource(QUALITY_ENCODER_PATH)
le_variety = load_resource(VARIETY_ENCODER_PATH)

def get_prediction_data(data):
    # Extract input values
    variety = data.get("variety", "CO86032")
    brix = float(data.get("brix", 0))
    sucrose = float(data.get("sucrose", 0))
    purity = float(data.get("purity", 0))
    fiber = float(data.get("fiber", 0))
    moisture = float(data.get("moisture", 0))
    age = float(data.get("age", 0))

    # Determine issues
    issues = []
    if sucrose < 14: issues.append("Low sucrose")
    if brix < 18: issues.append("Low brix")
    if purity < 85: issues.append("Low purity")
    if fiber > 15: issues.append("High fiber")
    if moisture > 75: issues.append("High moisture")
    if age > 14: issues.append("Over-aged cane")

    prediction_label = "Good" # Fallback
    
    if model and le_variety and le_quality:
        try:
            # Encode variety
            variety_encoded = le_variety.transform([variety])[0]

            # Create input array
            input_data = np.array([[ 
                variety_encoded,
                brix,
                sucrose,
                purity,
                fiber,
                moisture,
                age
            ]])

            # Prediction
            prediction_encoded = model.predict(input_data)[0]
            prediction_label = le_quality.inverse_transform([prediction_encoded])[0]
        except Exception as e:
            print(f"Prediction Error: {e}")
            # Heuristic fallback if ML fails
            if sucrose < 12 or purity < 75 or fiber > 17:
                prediction_label = "Poor"
            elif sucrose < 14 or purity < 82:
                prediction_label = "Average"
    else:
        # Heuristic fallback if model not loaded
        if sucrose < 12 or purity < 75 or fiber > 17:
            prediction_label = "Poor"
        elif sucrose < 14 or purity < 82:
            prediction_label = "Average"

    if prediction_label == "Poor":
        explanation = "❌ Cane quality is below acceptable standards."
        suggestion = "Corrective actions required before processing. Major issues: " + ", ".join(issues)
    elif prediction_label == "Average":
        explanation = "⚠️ Cane quality is acceptable but not optimal."
        suggestion = "Minor improvements recommended before processing."
    else:
        explanation = "✅ Cane quality is good."
        suggestion = "Safe for processing with optimal juice recovery."

    return {
        "predicted_quality": prediction_label,
        "explanation": explanation,
        "suggestion": suggestion,
        "detected_issues": issues
    }

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.json
        result = get_prediction_data(data)
        
        # Mapping back to the keys the frontend expects for compatibility
        return jsonify({
            "Predicted_Quality": result["predicted_quality"],
            "Explanation": result["explanation"],
            "Suggestion": result["suggestion"],
            "detected_issues": result["detected_issues"]
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/predict-batch", methods=["POST"])
def predict_batch():
    try:
        samples = request.json.get("samples", [])
        results = []
        
        for sample in samples:
            res = get_prediction_data(sample)
            results.append({
                "Sample_ID": sample.get("id", sample.get("Sample_ID", "N/A")),
                "Quality": res["predicted_quality"]
            })
            
        return jsonify({"results": results})

    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    app.run(port=5000, debug=True)
