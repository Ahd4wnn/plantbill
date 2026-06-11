# Plant Shop Billing App (PlantBill)

This is a billing web application for plant shops, designed with accessibility and extreme simplicity first.

## Project Structure

- `/frontend`: React + Vite + TypeScript + Tailwind CSS + React Router + PWA support.
- `/backend`: FastAPI + Uvicorn server.

## Getting Started

### Frontend Development

1. Navigate to `/frontend`:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in Supabase credentials.
4. Run the development server:
   ```bash
   npm run dev
   ```

### Backend Development

1. Navigate to `/backend`:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # On Windows:
   .venv\Scripts\activate
   # On macOS/Linux:
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up environment variables:
   Copy `.env.example` to `.env` and fill in the configuration.
5. Run the server:
   ```bash
   uvicorn main:app --reload
   ```
   The API will be available at `http://localhost:8000`. You can query `http://localhost:8000/health` to confirm the backend is up.
