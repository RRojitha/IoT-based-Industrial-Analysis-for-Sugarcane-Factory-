# Here you go 😄

🌾Sugarcane Juice Quality Prediction System

This project is a full-stack application designed to predict the quality of sugarcane juice based on various chemical and physical parameters. It utilizes a Machine Learning model to analyze input data and provide quality assessments, explanations, and improvement suggestions.

## Project Structure

The project is divided into two main parts:

- **Frontend**: A React-based user interface using Vite, featuring a modern and responsive design.
- **Backend**: A Flask-based API that serves the Machine Learning model and handles prediction logic.

## Features

- **Single Prediction**: Enter parameters such as Variety, Brix, Sucrose, Purity, Fiber, Moisture, and Age to get an instant quality prediction.
- **Batch Prediction**: Support for processing multiple samples at once (API endpoint available).
- **Quality Assessment**: Classifies juice into categories like "Good", "Average", or "Poor".
- **Detailed Feedback**: Provides explanations for the prediction and detecting specific issues (e.g., "Low sucrose", "Over-aged cane").
- **Visual Feedback**: Uses color-coded results and icons for a better user experience.

## Prerequisites

- Node.js and npm (for the frontend)
- Python 3.x (for the backend)

## Installation & Setup

### 1. Backend Setup

Navigate to the `backend` directory and install the required Python packages.

```bash
cd backend
# Create a virtual environment (optional but recommended)
# python -m venv venv
# source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install flask flask-cors pandas numpy joblib scikit-learn
```

Ensure that the model files (`juice_quality_model.pkl`, `quality_encoder.pkl`, `variety_encoder.pkl`) are present in the `backend` directory.

To run the backend server:

```bash
python app.py
```
The server will start on `http://localhost:5000`.

### 2. Frontend Setup

Navigate to the `frontend` directory and install the Node.js dependencies.

```bash
cd frontend
npm install
```

To run the frontend development server:

```bash
npm run dev
```
The application will typically be accessible at `http://localhost:5173` (check the console output for the exact URL).

## Usage

1. Start both the backend and frontend servers as described above.
2. Open the frontend URL in your browser.
3. Fill in the details in the input form (Identity and Quality Parameters).
4. Click on "Analyze Quality" to see the prediction results.

## Technology Stack

- **Frontend**: React, Vite, Framer Motion, Lucide React, Axios
- **Backend**: Python, Flask, Pandas, NumPy, Scikit-learn, Joblib
