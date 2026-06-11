# PlantBill Backend

FastAPI application for Plant Shop Billing.

## Database Setup

To apply the database schema, perform the following steps:

1. Log in to your [Supabase Dashboard](https://supabase.com/).
2. Select your **Plant Shop Billing App** project.
3. In the left-hand navigation bar, click on **SQL Editor**.
4. Click **New query**.
5. Copy the entire contents of the schema file: [02_schema.sql](file:///d:/Projects/PlantParkBill/backend/db/02_schema.sql).
6. Paste the SQL code into the editor and click **Run**.
7. Create another query tab, copy the contents of the functions file: [03_functions.sql](file:///d:/Projects/PlantParkBill/backend/db/03_functions.sql).
8. Paste the code and click **Run**.
9. Create another query tab, copy the contents of the admin views file: [08_admin_views.sql](file:///d:/Projects/PlantParkBill/backend/db/08_admin_views.sql).
10. Paste the code and click **Run**.
11. Create another query tab, copy the contents of the customer/expenses migration file: [09_customers_expenses.sql](file:///d:/Projects/PlantParkBill/backend/db/09_customers_expenses.sql).
12. Paste the code and click **Run**.


### Schema Migration Conventions
Future schema updates will arrive as new sequentially numbered files (`03_*.sql`, `04_*.sql`, etc.) under `/backend/db/` to ensure traceable migrations.

## Local Development Setup

1. Create a virtual environment:
   ```bash
   python -m venv .venv
   ```
2. Activate it:
   - On Windows (PowerShell): `.\.venv\Scripts\Activate.ps1`
   - On macOS/Linux: `source .venv/bin/activate`
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure `.env` using `.env.example` as a template.
5. Start the server:
   ```bash
   uvicorn main:app --reload
   ```
