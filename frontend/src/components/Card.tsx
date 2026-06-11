import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  return (
    <div 
      className={`bg-surface border border-border rounded-card shadow-soft p-6 ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
