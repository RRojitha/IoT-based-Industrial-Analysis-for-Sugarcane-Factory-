import serial
import time
import requests

PORT = 'COM3' # <--- CHANGE THIS TO YOUR ESP8266 COM PORT
BAUD_RATE = 9600
API_URL = "http://localhost:5000/predict"

# Model expects 7 features: ['Sucrose', 'Brix', 'Purity', 'Fiber', 'Moisture', 'Cane_Variety', 'Cane_Age']
# Mapping numeric input from phone to String variety for app.py
VARIETY_MAP = {0: "CO86032", 1: "Co0238", 2: "BO91", 3: "COC671"}

try:
    print(f"Connecting to ESP8266 on {PORT}...")
    ser = serial.Serial(PORT, BAUD_RATE, timeout=1)
    print("Connected! Waiting for data from your phone...")
    
    while True:
        if ser.in_waiting > 0:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            
            if "," in line:
                print(f"\n--- Data Received from Phone: {line} ---")
                
                try:
                    data_points = [float(x.strip()) for x in line.split(',')]
                    
                    if len(data_points) >= 3:
                        # If the user only submits 3 inputs from the phone (e.g. Sucrose, Brix, Fiber)
                        sucrose = data_points[0]
                        brix = data_points[1] if len(data_points) > 1 else 0
                        
                        if len(data_points) >= 7:
                            # Full Array (Sucrose, Brix, Purity, Fiber, Moisture, Cane_Variety (numeric), Cane_Age)
                            purity = data_points[2]
                            fiber = data_points[3]
                            moisture = data_points[4]
                            variety_num = int(data_points[5])
                            age = data_points[6]
                        else:
                            # Auto-calculate purity
                            fiber = data_points[2] if len(data_points) > 2 else 0
                            purity = round((sucrose / brix) * 100, 2) if brix > 0 else 0
                            
                            # If they send 6 inputs: Sucrose, Brix, Fiber, Age, Moisture, Weight
                            age = data_points[3] if len(data_points) > 3 else 12.0
                            moisture = data_points[4] if len(data_points) > 4 else 75.0
                            
                            variety_num = 0   # Default to CO86032
                        
                        variety_str = VARIETY_MAP.get(variety_num, "CO86032")
                        
                        payload = {
                            "source": "ESP32_BRIDGE",
                            "sucrose": sucrose,
                            "brix": brix,
                            "purity": purity,
                            "fiber": fiber,
                            "moisture": moisture,
                            "variety": variety_str,
                            "age": age,
                            "location": "Sensor Bridge"
                        }
                        
                        if len(data_points) > 5:
                            payload["weight"] = data_points[5]
                        
                        print(f"Sending data to Backend Model: {payload}")
                        
                        try:
                            response = requests.post(API_URL, json=payload, timeout=3)
                            if response.status_code == 200:
                                result = response.json()
                                print(f"✅ Prediction Success!")
                                print(f"==> Quality: {result.get('Predicted_Quality')}")
                                print(f"==> Sugar Recovery: {result.get('Production_Estimates', {}).get('Sugar_Recovery_Percent')}%")
                            else:
                                print(f"❌ Backend Error: {response.status_code} - {response.text}")
                        except requests.exceptions.RequestException as e:
                            print(f"❌ Failed to reach backend model server (app.py running?): {e}")
                    else:
                        print(f"⚠️ Received unreadable data length. Need at least 3 features (Sucrose, Brix, Fiber): {data_points}")
                    
                except ValueError:
                    print(f"⚠️ Could not parse data points as numbers: {line}")
                    pass
                    
        time.sleep(0.1)

except serial.SerialException:
    print(f"\nERROR: Could not open {PORT}.")
    print("Did you remember to close the Arduino Serial Monitor?")
