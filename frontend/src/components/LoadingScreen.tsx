import React from 'react';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background select-none">
      <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
};
export default LoadingScreen;
