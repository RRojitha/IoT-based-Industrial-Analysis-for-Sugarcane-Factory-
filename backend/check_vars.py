import joblib
le = joblib.load('c:\\Consultancy\\Sugarcane\\backend\\variety_encoder.pkl')
with open('c:\\Consultancy\\Sugarcane\\backend\\varieties.txt', 'w') as f:
    for cls in le.classes_:
        f.write(cls + '\n')
