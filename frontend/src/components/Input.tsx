import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Input: React.FC<InputProps> = ({ label, className = '', id, ...props }) => {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
  
  return (
    <div className="flex flex-col w-full">
      <label
        htmlFor={inputId}
        className="text-text-secondary text-sm font-semibold mb-2 select-none"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={`h-[52px] px-4 rounded-input border border-border bg-white text-text-primary text-[18px] font-medium placeholder-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all shadow-none ${className}`}
        {...props}
      />
    </div>
  );
};
