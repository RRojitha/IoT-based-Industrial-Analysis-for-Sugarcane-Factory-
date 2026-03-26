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
  Zap,
  TrendingUp,
  Package,
  Container
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isWhatIfMode, setIsWhatIfMode] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [lastSensorTimestamp, setLastSensorTimestamp] = useState(0);
  const [showHarvestWarning, setShowHarvestWarning] = useState(false);
  const [pendingStep, setPendingStep] = useState(null);

  const [formData, setFormData] = useState({
    variety: 'CO86032',
    location: '',
    age: 0,
    weight: 1.0,
    includeQuantity: false,
    brix: 0,
    sucrose: 0,
    purity: 0,
    fiber: 0,
    moisture: 0,
    autoPurity: true
  });

  // Fetch Analytics
  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/analytics`);
      setAnalyticsData(response.data);
    } catch (err) {
      console.error("Analytics fetch failed", err);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Poll for live sensor data from ESP32 Bridge
  useEffect(() => {
    const fetchLatestSensor = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/latest-sensor-data`);
        const data = response.data;
        if (data && data.timestamp && data.timestamp > lastSensorTimestamp) {
          // New data received!
          setLastSensorTimestamp(data.timestamp);
          
          setFormData(prev => ({
            ...prev,
            sucrose: data.sucrose ?? prev.sucrose,
            brix: data.brix ?? prev.brix,
            fiber: data.fiber ?? prev.fiber,
            moisture: data.moisture ?? prev.moisture,
            age: data.age ?? prev.age,
            weight: data.weight ?? prev.weight,
            includeQuantity: (data.weight && data.weight > 0) ? true : prev.includeQuantity,
            variety: data.variety ?? prev.variety,
            location: data.location ?? prev.location,
            purity: data.purity ?? prev.purity
          }));
          
          // Visually jump to parameters screen and auto-predict
          setStep(2);
          setIsWhatIfMode(true);
        }
      } catch (err) {
        // silent fail for polling
      }
    };

    const intervalId = setInterval(fetchLatestSensor, 2000);
    return () => clearInterval(intervalId);
  }, [lastSensorTimestamp, step]);

  // Auto-calculate purity
  useEffect(() => {
    if (formData.autoPurity && formData.brix > 0) {
      let calculatedPurity = (formData.sucrose / formData.brix) * 100;
      // Cap purity at 95 maximum
      calculatedPurity = Math.min(calculatedPurity, 95);
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
    setFormData(prev => {
      let newValue = type === 'checkbox' ? checked : (type === 'range' || type === 'number' ? parseFloat(value) : value);
      
      // Cap purity at 95 maximum
      if (name === 'purity' && newValue > 95) {
        newValue = 95;
      }
      
      return {
        ...prev,
        [name]: newValue
      };
    });
  };

  // Check if sugarcane is in harvest stage (12-16 months is ideal)
  const isInHarvestStage = () => {
    return formData.age >= 12 && formData.age <= 16;
  };

  const nextStep = () => {
    if (step === 1 && !isInHarvestStage()) {
      setShowHarvestWarning(true);
      setPendingStep(2);
    } else {
      setStep(prev => prev + 1);
    }
  };

  const continueAnyway = () => {
    setShowHarvestWarning(false);
    setStep(prev => prev + 1);
    setPendingStep(null);
  };

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
        location: formData.location,
        age: formData.age
      });
      setResult(response.data);
      if (!hidden) {
        setStep(3);
        fetchAnalytics();
      }
    } catch (err) {
      console.error(err);
      if (!hidden) setError("Failed to connect to backend. Ensure Flask and MongoDB are running.");
    } finally {
      if (!hidden) setLoading(false);
    }
  };

  const reset = () => {
    window.location.reload();
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

  const showAnalytics = () => {
    fetchAnalytics();
    setStep(5);
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
      {showHarvestWarning && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowHarvestWarning(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              backdropFilter: 'blur(10px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <AlertTriangle size={32} style={{ color: '#f1c40f' }} />
              <h3 style={{ margin: 0, color: '#f1c40f' }}>Harvest Stage Warning</h3>
            </div>
            
            <p style={{ margin: '0 0 1rem 0', color: 'rgba(255, 255, 255, 0.9)', lineHeight: '1.6' }}>
              The sugarcane age is <strong>{formData.age} months</strong>. Optimal harvest stage is between <strong>12-16 months</strong>.
            </p>
            
            {formData.age < 12 && (
              <div style={{ background: 'rgba(255, 107, 107, 0.1)', border: '1px solid rgba(255, 107, 107, 0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ margin: 0, color: '#ff6b6b', fontSize: '0.9rem' }}>
                  🌱 Your cane is <strong>under-matured</strong>. It may not have reached optimal sugar content. Harvest quality predictions may be less accurate.
                </p>
              </div>
            )}
            
            {formData.age > 16 && (
              <div style={{ background: 'rgba(255, 107, 107, 0.1)', border: '1px solid rgba(255, 107, 107, 0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ margin: 0, color: '#ff6b6b', fontSize: '0.9rem' }}>
                  ⚠️ Your cane is <strong>over-matured</strong>. It may have lost sugar content and quality. Harvest quality predictions may be less accurate.
                </p>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button
                onClick={() => setShowHarvestWarning(false)}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.15)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
              >
                Go Back
              </button>
              <button
                onClick={continueAnyway}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  background: '#f1c40f',
                  border: 'none',
                  color: '#333',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#f9d968'}
                onMouseLeave={(e) => e.target.style.background = '#f1c40f'}
              >
                Continue Anyway
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      
      <header className="main-header">
        <div className="header-content">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <h1>Smart Sugarcane Quality Analysis</h1>
            <p className="subtitle">Industrial Extraction & Quality Prediction System</p>
          </motion.div>
        </div>
        <button className="btn-analytics-toggle" onClick={showAnalytics}>
          <TrendingUp size={20} /> Analytics Dashboard
        </button>
      </header>

      <div className="steps-indicator">
{/* ... */}
        <div className={`step-dot ${step >= 1 ? 'active' : ''}`} />
        <div className={`step-dot ${step >= 2 ? 'active' : ''}`} />
        <div className={`step-dot ${step >= 3 || step === 4 ? 'active' : ''}`} />
        {step === 5 && <div className={`step-dot active`} />}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-card">
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <Leaf className="text-primary" /> 1. Cane Identity & Origin
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label>Extraction Location (Village)</label>
                <input 
                  type="text" 
                  name="location" 
                  value={formData.location} 
                  onChange={handleChange} 
                  placeholder="Eg: Perundurai"
                />
              </div>

              <div className="form-group">
                <label>Cane Variety</label>
                <select name="variety" value={formData.variety} onChange={handleChange}>
                  <option value="CO86032">CO86032 (High Yield)</option>
                  <option value="Co0238">CO0238 (Early Spec)</option>
                  <option value="BO91">BO91 (All-Weather)</option>
                  <option value="COC671">COC671 (High Sugar)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Cane Age (Months) <span className="slider-value">{formData.age} mo</span></label>
              <input type="range" name="age" min="0" max="18" step="0.5" value={formData.age} onChange={handleChange} />
              <div className="hint-container">
                {formData.age < 10 && <div className="hint acceptable"><Info size={14} /> Under-matured</div>}
                {formData.age > 16 && <div className="hint acceptable"><Info size={14} /> Over-matured</div>}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input 
                type="checkbox" 
                name="includeQuantity" 
                checked={formData.includeQuantity} 
                onChange={handleChange} 
                id="qty-toggle"
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <label htmlFor="qty-toggle" style={{ margin: 0, cursor: 'pointer', fontWeight: 600 }}>Calculate Total Output Yield</label>
            </div>

            {formData.includeQuantity && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="form-group" style={{ marginTop: '1rem' }}>
                <label>Total Cane Weight (Tons) <span style={{ color: '#ff6b6b' }}>*</span></label>
                <input 
                  type="number" 
                  name="weight" 
                  min="0.1"
                  step="0.1"
                  value={formData.weight} 
                  onChange={handleChange} 
                  className="number-input"
                  style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: 'black', border: formData.includeQuantity && (!formData.weight || parseFloat(formData.weight) <= 0) ? '2px solid #ff6b6b' : '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                {formData.includeQuantity && (!formData.weight || parseFloat(formData.weight) <= 0) && (
                  <div style={{ marginTop: '0.5rem', color: '#ff6b6b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={14} /> Weight is required when Quantity Analysis is enabled
                  </div>
                )}
              </motion.div>
            )}

            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border)', textAlign: 'center' }}>
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

            {formData.includeQuantity && (!formData.weight || parseFloat(formData.weight) <= 0) && (
              <div style={{ marginTop: '1rem', color: '#ff6b6b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 107, 107, 0.1)', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255, 107, 107, 0.3)' }}>
                <AlertTriangle size={16} /> You must enter a valid Total Cane Weight (Tons) to proceed with Quantity Analysis.
              </div>
            )}

            <button 
              className="btn-primary" 
              style={{ marginTop: '2rem' }}
              onClick={nextStep}
              disabled={formData.includeQuantity && (!formData.weight || parseFloat(formData.weight) <= 0)}
            >
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
                <label style={{ margin: 0 }}>Purity % <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(Max: 95%)</span></label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                  <input type="checkbox" name="autoPurity" checked={formData.autoPurity} onChange={handleChange} /> Auto-calc
                </label>
              </div>
              <input type="number" name="purity" value={formData.purity} onChange={handleChange} disabled={formData.autoPurity} className={formData.autoPurity ? 'disabled-input' : ''} max="95" min="0" />
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
                  <strong>{(result.Predicted_Quality || result.quality).toUpperCase()}</strong>
                </div>

                {result.Production_Estimates?.Sugar_Recovery_Percent && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    <span>Estimated Recovery:</span>
                    <strong style={{ color: 'var(--primary)' }}>{result.Production_Estimates.Sugar_Recovery_Percent}%</strong>
                  </div>
                )}
              </motion.div>
            )}

            {formData.includeQuantity && (!formData.weight || parseFloat(formData.weight) <= 0) && (
              <div style={{ marginTop: '1rem', color: '#ff6b6b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 107, 107, 0.1)', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255, 107, 107, 0.3)' }}>
                <AlertTriangle size={16} /> You must enter a valid Total Cane Weight (Tons) before analyzing Yields.
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn-secondary" onClick={prevStep}><ChevronLeft size={20} /></button>
              <button 
                className="btn-primary" 
                onClick={() => handleSubmit()} 
                disabled={loading || (formData.includeQuantity && (!formData.weight || parseFloat(formData.weight) <= 0))}
                style={{ opacity: (formData.includeQuantity && (!formData.weight || parseFloat(formData.weight) <= 0)) ? 0.5 : 1 }}
              >
                {loading ? <Activity className="animate-spin" /> : <>Run Prediction <Zap size={20} /></>}
              </button>
              <button
                className={`btn-icon ${isWhatIfMode ? 'active' : ''}`}
                onClick={toggleWhatIf}
                title="Toggle What-If Analysis"
                disabled={(formData.includeQuantity && (!formData.weight || parseFloat(formData.weight) <= 0))}
                style={{ opacity: (formData.includeQuantity && (!formData.weight || parseFloat(formData.weight) <= 0)) ? 0.5 : 1 }}
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
            </div>

            {result.Production_Estimates && (
              <div className="production-section fade-in">
                <div className="estimate-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--primary)', fontWeight: 600 }}>
                  <TrendingUp size={20} /> Base Production Metrics
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="production-card" style={{background: 'rgba(46, 204, 113, 0.1)', border: '1px solid rgba(46, 204, 113, 0.3)'}}>
                    <span className="production-value">{(result.Production_Estimates.Sugar_Recovery_Percent ?? 0).toFixed(2)}%</span>
                    <span className="production-label">Sugar Recovery Rate</span>
                  </div>
                  
                  {formData.includeQuantity && (
                    <div className="production-card" style={{backgroundColor: '#2ecc71', color: 'white', border: 'none'}}>
                      <span className="production-value" style={{color: 'white'}}>{(result.Production_Estimates.Total_Sugar_kg ?? 0).toLocaleString()} kg</span>
                      <span className="production-label" style={{color: 'rgba(255,255,255,0.9)'}}>Total Pure Sugar</span>
                    </div>
                  )}
                </div>

                {/* Byproducts */}
                {formData.includeQuantity && (
                  <>
                    <div className="estimate-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
                      Scaled Estimates ({formData.weight} Tons)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                      <div className="production-card">
                        <span className="production-value">{(result.Production_Estimates.Total_Molasses_kg ?? 0).toLocaleString()} kg</span>
                        <span className="production-label">Total Molasses</span>
                      </div>
                      <div className="production-card">
                        <span className="production-value">{(result.Production_Estimates.Total_Bagasse_kg ?? 0).toLocaleString()} kg</span>
                        <span className="production-label">Total Bagasse</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

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
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="batch-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '1rem' }}>Sample ID</th>
                    <th style={{ padding: '1rem' }}>Predicted Quality</th>
                    <th style={{ padding: '1rem' }}>Recovery %</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResults.map((res, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem' }}>{res.Sample_ID}</td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ color: getQualityColor(res.Quality), fontWeight: 600 }}>{res.Quality.toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--primary)' }}>{res.Sugar_Recovery}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-primary" style={{ marginTop: '2rem' }} onClick={reset}>
               New Analysis
            </button>
          </motion.div>
        )}

        {step === 5 && analyticsData && (
          <motion.div key="analytics" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card analytics-dashboard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2><TrendingUp className="text-primary" /> Regional Insights - {analyticsData.month}</h2>
              <button className="btn-secondary" onClick={() => setStep(1)}>Back to Analysis</button>
            </div>

            <div className="analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
              <div className="analytics-section">
                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', color: 'var(--text-muted)' }}>🏆 Top Sucrose by Village</h3>
                <div className="ranking-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {analyticsData.top_villages.length > 0 ? analyticsData.top_villages.map((v, i) => (
                    <div key={i} className="ranking-item" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                        <span style={{ fontWeight: 600 }}>{i + 1}. {v._id}</span>
                        <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{v.avg_sucrose.toFixed(2)}%</span>
                      </div>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, height: '4px', background: 'var(--primary)', width: `${(v.avg_sucrose / 22) * 100}%`, opacity: 0.4 }} />
                    </div>
                  )) : <p>No data yet.</p>}
                </div>
              </div>

              <div className="analytics-section">
                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', color: 'var(--text-muted)' }}>🌱 Best Performing Varieties</h3>
                <div className="ranking-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {analyticsData.top_varieties.length > 0 ? analyticsData.top_varieties.map((v, i) => (
                    <div key={i} className="ranking-item" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                        <span style={{ fontWeight: 600 }}>{i + 1}. {v._id}</span>
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>{v.avg_sucrose.toFixed(2)}%</span>
                      </div>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, height: '4px', background: 'var(--success)', width: `${(v.avg_sucrose / 22) * 100}%`, opacity: 0.4 }} />
                    </div>
                  )) : <p>No data yet.</p>}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <Package size={16} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} /> Trends calculated from real-time MongoDB extraction logs.
            </div>
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
  const color = isPoor ? '#e74c3c' : (isAvg ? '#f1c40f' : '#2ecc71');
  const Icon = isPoor ? XCircle : (isAvg ? AlertTriangle : CheckCircle);
  return (
    <div style={{ textAlign: 'center' }}>
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ color, marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
        <Icon size={64} />
      </motion.div>
      <h2 style={{ color, fontSize: '2.5rem', fontWeight: 800 }}>{quality?.toUpperCase()}</h2>
    </div>
  );
}

function Gauge({ score }) {
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', maxWidth: '300px', margin: '0 auto' }}>
        <motion.div
           initial={{ width: 0 }}
           animate={{ width: `${score}%` }}
           style={{
             height: '100%',
             background: score > 70 ? '#2ecc71' : (score > 40 ? '#f1c40f' : '#e74c3c')
           }}
        />
      </div>
      <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', opacity: 0.7 }}>Quality Score: {score.toFixed(1)}%</p>
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
