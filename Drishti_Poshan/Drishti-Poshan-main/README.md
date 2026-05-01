# 👶 Drishti Poshan 
> **Offline-First AI-Powered Child Nutrition & Health Forecasting for Anganwadi Centers**

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![XGBoost](https://img.shields.io/badge/Machine%20Learning-XGBoost-orange?style=for-the-badge)
![Groq](https://img.shields.io/badge/AI-Groq_Cloud-black?style=for-the-badge)

## 📌 The Problem
In rural India, Anganwadi centers track child growth to prevent Severe Acute Malnutrition (SAM). However, the current system is largely reactive. By the time a child drops into the "red zone," the damage to their physical and cognitive development is already underway. Furthermore, frontline workers lack the tools to quickly digitize physical records or interpret complex health trajectories.

## 🚀 Our Solution
**Drishti Poshan** transforms Anganwadi tracking from *reactive* to *proactive*. We provide an end-to-end platform with a robust PostgreSQL database, an offline-capable React Progressive Web App (PWA), and a cutting-edge Machine Learning and OCR pipeline.

Instead of just recording past weights, Drishti Poshan uses **XGBoost** to forecast a child's health trajectory 60 days into the future. It supports automated digitization of field forms and Lab Diagnostics (Albumin, Prealbumin, CRP) using state-of-the-art **Groq Cloud AI (OCR)**. Crucially, we utilize **Explainable AI (SHAP)** to break down "black box" predictions, giving health workers precise, medical-style justifications for every forecast.

---

## ✨ Key Features

* **📡 Offline-First Architecture:** Built as a PWA, frontend IndexedDB caching allows workers to securely log anthropometric readings and access data without an internet connection. It features an offline PIN authentication system and syncs automatically when back online.
* **📈 60-Day Predictive Forecasting:** XGBoost regression models trained on historical Indian growth data predict future weight and malnutrition risk levels.
* **🧠 Explainable AI (XAI):** SHAP integration provides transparent, human-readable explanations for every ML prediction.
* **📄 AI-Powered OCR & Voice:** Uses Groq Cloud AI for seamless extraction of Hindi/Devanagari text from field-captured forms and rapid voice inputs to streamline data entry.
* **⚕️ Advanced Lab Diagnostics Integration:** Automatically analyzes key biochemical markers (Albumin, Prealbumin, CRP) for a comprehensive clinical assessment.
* **🗄️ 3rd Normal Form (3NF) Cloud Database:** A highly relational, strict PostgreSQL architecture hosted on AWS RDS using UUID primary keys, ensuring zero data redundancy, strict ORM mapping, and perfect medical audit trails.
* **🎨 Government-Grade UI:** High-performance, accessible, and responsive dashboard architecture built with Tailwind CSS and Framer Motion for a premium user experience.

---

## 🛠️ Tech Stack

### **Frontend (PWA)**
* **Framework:** React 19 (Vite)
* **Offline Sync & Storage:** IndexedDB (`idb`) / Custom SyncContext / PWA Plugins
* **Styling/Animations:** Tailwind CSS / Framer Motion / Recharts
* **Routing:** React Router v7

### **Backend & Database**
* **Framework:** FastAPI (Python 3.13)
* **Server:** Uvicorn
* **ORM:** SQLAlchemy (Async)
* **Database:** PostgreSQL (AWS RDS)
* **Authentication:** JWT, Bcrypt, local PIN fallback

### **Machine Learning & AI Pipeline**
* **Modeling:** XGBoost (`XGBRegressor` / `XGBClassifier`)
* **Explainability:** SHAP (`TreeExplainer`), Scikit-learn
* **OCR & Voice:** Groq API Cloud Services
* **Growth Standards:** PyGrowUp (WHO Child Growth Standards)

---

## 🗂️ Database Architecture
Our system relies on a strictly typed, production-ready schema:
1. `anganwadi_centers`: The physical locations/hubs.
2. `users`: The authenticated workers tied to a specific center.
3. `beneficiaries`: Core profiles of the children (UUID-based, strictly immutable facts).
4. `anthropometric_readings`: The time-series data (Weight, Height, MUAC) and Lab Diagnostics (Albumin, CRP) linked to the child.
5. `ml_forecasts`: Historical records of AI model predictions and SHAP values.

---

## 💻 Local Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/Yashvin12/Pragyantra-The_Commit_Crew-HC_07.git
cd Drishti-Poshan-v3
```

### 2. Environment Variables
Create `.env` files in both the `frontend/` and `backend/` directories. You will need:
* A PostgreSQL Database connection string.
* Your Groq Cloud API Keys for OCR/Voice.
* A Secret Key for JWT auth caching.

### 3. Run the Application
The project includes a `startup.bat` script for easy launching on Windows. 

```bash
./startup.bat
```
*(This will install requirements, run database migrations, and start both the Vite React dev server and the Python FastAPI backend in your environment).*
