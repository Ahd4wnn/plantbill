import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

export const AppHeader = () => {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (e) {
      console.error('Sign out failed:', e);
    }
  };

  const showBackButton =
    location.pathname === '/bill' ||
    location.pathname === '/bills' ||
    location.pathname.startsWith('/bills/');

  const handleBack = () => {
    if (location.pathname.startsWith('/bills/')) {
      navigate('/bills');
    } else {
      navigate('/');
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full h-16 bg-surface border-b border-border flex items-center justify-between px-5 select-none">
      <div className="flex items-center gap-3">
        {showBackButton && (
          <button
            onClick={handleBack}
            className="h-10 px-4 flex items-center justify-center bg-white border border-border rounded-button text-sm font-bold text-text-primary hover:bg-background active:bg-border transition-colors cursor-pointer"
          >
            Back
          </button>
        )}
        <span 
          className="text-xl font-bold tracking-tight text-accent cursor-pointer" 
          onClick={() => navigate('/')}
        >
          PlantBill
        </span>
      </div>

      {session && profile && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-text-secondary">
            {profile.full_name || 'Cashier'}
          </span>
          <button
            onClick={handleSignOut}
            className="text-sm font-bold text-danger hover:underline focus:outline-none cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
};

export default AppHeader;
