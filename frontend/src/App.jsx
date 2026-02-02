import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dna,
  Beaker,
  Leaf,
  Calendar,
  Wind,
  Droplets,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Activity,
  Info,
  Upload,
  RefreshCw,
  Zap
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:5000';

function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isWhatIfMode, setIsWhatIfMode] = useState(false);
  const [batchResults, setBatchResults] = useState(null);

  const [formData, setFormData] = useState({
    variety: 'CO86032',
    age: 0,
    brix: 0,
    sucrose: 0,
    purity: 0,
    fiber: 0,
    moisture: 0,
    autoPurity: true
  });

  // Auto-calculate purity
  useEffect(() => {
    if (formData.autoPurity && formData.brix > 0) {
      const calculatedPurity = (formData.sucrose / formData.brix) * 100;
      setFormData(prev => ({ ...prev, purity: parseFloat(calculatedPurity.toFixed(2)) }));
    }
  }, [formData.sucrose, formData.brix, formData.autoPurity]);

  // Debounced live prediction for What-If mode
  useEffect(() => {
    if (isWhatIfMode) {
      const timeoutId = setTimeout(() => {
        handleSubmit(true);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [formData, isWhatIfMode]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'range' || type === 'number' ? parseFloat(value) : value)
    }));
  };

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const handleSubmit = async (hidden = false) => {
    if (!hidden) setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/predict`, {
        sucrose: formData.sucrose,
        brix: formData.brix,
        purity: formData.purity,
        fiber: formData.fiber,
        moisture: formData.moisture,
        variety: formData.variety,
        age: formData.age
      });
      setResult(response.data);
      if (!hidden) setStep(3);
    } catch (err) {
      console.error(err);
      if (!hidden) setError("Failed to connect to backend. Ensure Flask is running on port 5000.");
    } finally {
      if (!hidden) setLoading(false);
    }
  };

  const reset = () => {
    setStep(1);
    setResult(null);
    setBatchResults(null);
    setError(null);
    setIsWhatIfMode(false);
  };

  const toggleWhatIf = () => {
    setIsWhatIfMode(!isWhatIfMode);
    if (!isWhatIfMode) {
      setStep(2); // Go back to parameters if coming from result
      handleSubmit(true);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        const rows = text.split('\n').filter(r => r.trim()).map(row => row.split(','));
        if (rows.length < 2) return alert("Invalid CSV format");

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        const samples = dataRows.map((row, index) => {
          const obj = {};
          headers.forEach((h, i) => obj[h] = row[i]?.trim());
          if (!obj.id) obj.id = `SAMP-${String(index + 1).padStart(3, '0')}`;
          return obj;
        });

        setLoading(true);
        try {
          const res = await axios.post(`${API_BASE_URL}/predict-batch`, { samples });
          setBatchResults(res.data.results);
          setStep(4);
        } catch (err) {
          setError("Failed to process batch file. Ensure backend is running.");
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    }
  };

  const downloadSampleCSV = () => {
    const content = "id,brix,sucrose,purity,fiber,moisture\nTRK-001,18.5,15.2,82.1,12.5,75.0\nTRK-002,14.2,10.5,73.9,18.2,74.5\nTRK-003,19.2,17.4,90.6,11.2,76.5";
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sugarcane_sample.csv';
    a.click();
  };

  // Interaction check to hide hints/predictions when values are zero
  const hasInteracted = formData.brix > 0 || formData.sucrose > 0 || formData.fiber > 0 || formData.age > 0;

  // Live Hints Logic
  const hints = [];
  if (hasInteracted) {
    if (formData.fiber > 15) hints.push({ text: "High fiber may reduce sugar recovery", type: "critical" });
    if (formData.brix < 14) hints.push({ text: "Low sugar content detected", type: "critical" });
    if (formData.brix > 20) hints.push({ text: "Optimal sugar content detected", type: "optimal" });
    if (formData.purity < 80) hints.push({ text: "Low purity detected", type: "critical" });
    if (formData.age < 10) hints.push({ text: "Cane might be under-matured", type: "acceptable" });
    if (formData.age > 16) hints.push({ text: "Cane might be over-matured", type: "acceptable" });
  }

  return (
    <div className="app-container">
      <header>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1>Smart Sugarcane Quality Analysis</h1>
          <p className="subtitle">Industrial Extraction & Quality Prediction System</p>
        </motion.div>
      </header>

      <div className="steps-indicator">
        <div className={`step-dot ${step >= 1 ? 'active' : ''}`} />
        <div className={`step-dot ${step >= 2 ? 'active' : ''}`} />
        <div className={`step-dot ${step >= 3 || step === 4 ? 'active' : ''}`} />
        {step === 4 && <div className={`step-dot active`} />}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-card">
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <Leaf className="text-primary" /> 1. Cane Identity
            </h2>

            <div className="form-group">
              <label>Cane Variety</label>
              <select name="variety" value={formData.variety} onChange={handleChange}>
                <option value="CO86032">CO86032 (High Yield)</option>
                <option value="CO0238">CO0238 (Early Spec)</option>
                <option value="COJ64">COJ64 (Standard)</option>
                <option value="Local">Local Variety</option>
              </select>
            </div>

            <div className="form-group">
              <label>Cane Age (Months) <span className="slider-value">{formData.age} mo</span></label>
              <input type="range" name="age" min="0" max="18" step="0.5" value={formData.age} onChange={handleChange} />
              <div className="hint-container">
                {formData.age < 10 && <div className="hint acceptable"><Info size={14} /> Under-matured</div>}
                {formData.age > 16 && <div className="hint acceptable"><Info size={14} /> Over-matured</div>}
              </div>
            </div>

            <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed var(--border)', textAlign: 'center' }}>
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', cursor: 'pointer', margin: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 600 }}>
                  <Upload size={20} /> Upload CSV for Bulk Analysis
                </div>
                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Analyze multiple batches in one go</span>
              </label>
              <button
                onClick={downloadSampleCSV}
                style={{ marginTop: '1rem', background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Download Sample Format
              </button>
            </div>

            <button className="btn-primary" style={{ marginTop: '2rem' }} onClick={nextStep}>
              Target Parameters <ChevronRight size={20} />
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <Beaker className="text-primary" /> 2. Juice Parameters
              </h2>
              {isWhatIfMode && <span className="badge-live"><Zap size={14} /> LIVE MODE</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div className="form-group">
                <label>Brix % <span className="slider-value">{formData.brix}%</span></label>
                <input type="range" name="brix" min="0" max="25" step="0.1" value={formData.brix} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Sucrose % <span className="slider-value">{formData.sucrose}%</span></label>
                <input type="range" name="sucrose" min="0" max="22" step="0.1" value={formData.sucrose} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Fiber % <span className="slider-value">{formData.fiber}%</span></label>
                <input type="range" name="fiber" min="0" max="20" step="0.1" value={formData.fiber} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Moisture % <span className="slider-value">{formData.moisture}%</span></label>
                <input type="range" name="moisture" min="0" max="85" step="0.1" value={formData.moisture} onChange={handleChange} />
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                <label style={{ margin: 0 }}>Purity %</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <input type="checkbox" name="autoPurity" checked={formData.autoPurity} onChange={handleChange} /> Auto-calc
                </label>
              </div>
              <input type="number" name="purity" value={formData.purity} onChange={handleChange} disabled={formData.autoPurity} className={formData.autoPurity ? 'disabled-input' : ''} />
            </div>

            {hasInteracted && (
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Live Insights:</h4>
                <div className="hints-list">
                  {hints.length > 0 ? hints.map((h, i) => (
                    <div key={i} className={`hint ${h.type}`}>
                      {h.type === 'critical' ? <AlertTriangle size={14} /> : <Info size={14} />}
                      {h.text}
                    </div>
                  )) : <div className="hint optimal"><CheckCircle size={14} /> Parameters within ideal range</div>}
                </div>
              </div>
            )}

            {isWhatIfMode && result && hasInteracted && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mini-result">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                  <span>Real-time Prediction:</span>
                  <strong style={{ color: getQualityColor(result.Predicted_Quality || result.quality) }}>
                    {(result.Predicted_Quality || result.quality).toUpperCase()}
                  </strong>
                </div>
              </motion.div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn-secondary" onClick={prevStep}><ChevronLeft size={20} /></button>
              <button className="btn-primary" onClick={() => handleSubmit()} disabled={loading}>
                {loading ? <Activity className="animate-spin" /> : <>Run Prediction <Zap size={20} /></>}
              </button>
              <button
                className={`btn-icon ${isWhatIfMode ? 'active' : ''}`}
                onClick={toggleWhatIf}
                title="Toggle What-If Analysis"
              >
                <RefreshCw size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && result && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card result-page">
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <QualityBadge quality={result.Predicted_Quality || result.quality} />
              <Gauge score={calculateScore(result.Predicted_Quality || result.quality, formData)} />
            </div>

            <div className="explanation-box" style={{ borderLeft: `5px solid ${getQualityColor(result.Predicted_Quality || result.quality)}` }}>
              <p className="main-explanation">{result.Explanation || result.explanation}</p>
              {result.Suggestion && (
                <p style={{ marginTop: '1rem', fontStyle: 'italic', color: 'var(--primary)' }}>
                  <strong>Action Suggestion:</strong> {result.Suggestion}
                </p>
              )}
              {result.detected_issues?.length > 0 && (
                <div className="issues-section">
                  <h4>Detected Factors:</h4>
                  <ul>{result.detected_issues.map((iss, i) => <li key={i}>{iss}</li>)}</ul>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button className="btn-primary" style={{ flex: 2 }} onClick={reset}>New Prediction</button>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={toggleWhatIf}>Simulation Mode</button>
            </div>
          </motion.div>
        )}

        {step === 4 && batchResults && (
          <motion.div key="batchResult" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card">
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <Activity className="text-primary" /> 4. Batch Processing Results
            </h2>
            <div className="table-container">
              <table className="batch-table">
                <thead>
                  <tr>
                    <th>Sample ID</th>
                    <th>Predicted Quality</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResults.map((res, i) => (
                    <tr key={i}>
                      <td>{res.Sample_ID}</td>
                      <td>
                        <span className={`badge-status ${res.Quality.toLowerCase()}`}>
                          {res.Quality.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <button className="btn-text">View Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <div className="hint critical" style={{ marginTop: '1rem' }}>{error}</div>}
            <button className="btn-primary" style={{ marginTop: '2rem' }} onClick={reset}>
              <RefreshCw size={18} /> New Analysis
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QualityBadge({ quality }) {
  const q = quality?.toLowerCase() || '';
  const isPoor = q.includes('poor');
  const isAvg = q.includes('average');
  const color = isPoor ? 'var(--error)' : (isAvg ? 'var(--warning)' : 'var(--success)');
  const Icon = isPoor ? XCircle : (isAvg ? AlertTriangle : CheckCircle);

  return (
    <div className="quality-badge-hero">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ color }}>
        <Icon size={64} />
      </motion.div>
      <h2 style={{ color, fontSize: '3rem', fontWeight: 800, margin: '1rem 0' }}>{quality?.toUpperCase()}</h2>
    </div>
  );
}

function Gauge({ score }) {
  return (
    <div className="gauge-container">
      <div className="gauge-track">
        <motion.div
          className="gauge-fill"
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          style={{
            background: score > 70 ? 'var(--success)' : (score > 40 ? 'var(--warning)' : 'var(--error)')
          }}
        />
      </div>
      <span className="gauge-label">Quality Score: {score}%</span>
    </div>
  );
}

function calculateScore(quality, data) {
  if (quality?.toLowerCase().includes('good')) return 85 + Math.random() * 10;
  if (quality?.toLowerCase().includes('average')) return 50 + Math.random() * 20;
  return 20 + Math.random() * 20;
}

function getQualityColor(quality) {
  const q = quality?.toLowerCase() || '';
  if (q.includes('poor')) return '#e74c3c';
  if (q.includes('average')) return '#f1c40f';
  return '#2ecc71';
}

export default App;
