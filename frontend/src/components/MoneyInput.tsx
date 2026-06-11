import React from 'react';

interface MoneyInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({ label, className = '', id, ...props }) => {
  const inputId = id || `money-input-${label.toLowerCase().replace(/\s+/g, '-')}`;
  
  return (
    <div className="flex flex-col w-full">
      <label
        htmlFor={inputId}
        className="text-text-secondary text-sm font-semibold mb-2 select-none"
      >
        {label}
      </label>
      <div className="relative flex items-center w-full">
        <span className="absolute left-4 text-text-primary text-[18px] font-semibold pointer-events-none select-none">
          ₹
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          className={`h-[52px] pl-9 pr-4 w-full rounded-input border border-border bg-white text-text-primary text-[18px] font-medium placeholder-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all shadow-none ${className}`}
          {...props}
        />
      </div>
    </div>
  );
};
