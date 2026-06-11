import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppHeader } from './components/AppHeader';
import { ScreenContainer } from './components/ScreenContainer';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Bill } from './pages/Bill';
import { Bills } from './pages/Bills';
import { BillDetail } from './pages/BillDetail';
import { Admin } from './pages/Admin';
import { Expenses } from './pages/Expenses';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';

function App() {
  return (
    <Router>
      <ScreenContainer>
        <AppHeader />
        <main className="flex-1 flex flex-col">
          <Routes>
            {/* Public Login */}
            <Route path="/login" element={<Login />} />

            {/* Protected cashier home */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />

            {/* Protected billing route */}
            <Route
              path="/bill"
              element={
                <ProtectedRoute>
                  <Bill />
                </ProtectedRoute>
              }
            />

            {/* Protected expenses route */}
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Expenses />
                </ProtectedRoute>
              }
            />

            {/* Protected bills list route */}
            <Route
              path="/bills"
              element={
                <ProtectedRoute>
                  <Bills />
                </ProtectedRoute>
              }
            />

            {/* Protected bill detail route */}
            <Route
              path="/bills/:id"
              element={
                <ProtectedRoute>
                  <BillDetail />
                </ProtectedRoute>
              }
            />

            {/* Protected admin page */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />

            {/* Catch-all redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </ScreenContainer>
    </Router>
  );
}

export default App;
