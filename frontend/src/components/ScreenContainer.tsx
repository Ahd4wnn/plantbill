import React from 'react';

interface ScreenContainerProps {
  children: React.ReactNode;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({ children }) => {
  return (
    <div className="min-h-screen w-full bg-background flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen bg-background border-x border-border flex flex-col px-5 pb-10">
        {children}
      </div>
    </div>
  );
};
