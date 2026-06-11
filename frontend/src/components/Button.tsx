import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: string; // Enforce visible text label
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  children,
  className = '',
  ...props
}) => {
  const baseStyle = 'flex items-center justify-center h-14 w-full md:w-auto px-6 rounded-button text-base font-bold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 select-none';
  
  const variantStyles = {
    primary: 'bg-accent text-white active:bg-accent-dark border border-transparent shadow-soft',
    secondary: 'bg-white text-text-primary border border-border hover:bg-background active:bg-border shadow-soft',
  };

  return (
    <button
      className={`${baseStyle} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
