import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'cyan' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate' | 'orange';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  dot = false,
  className = '',
}) => {
  const variantStyles = {
    cyan: 'bg-tactical-cyan/10 text-tactical-cyan border-tactical-cyan/30',
    indigo: 'bg-tactical-indigo/10 text-tactical-indigo border-tactical-indigo/30',
    emerald: 'bg-tactical-emerald/10 text-tactical-emerald border-tactical-emerald/30',
    amber: 'bg-tactical-amber/10 text-tactical-amber border-tactical-amber/30',
    rose: 'bg-tactical-rose/10 text-tactical-rose border-tactical-rose/30',
    orange: 'bg-tactical-orange/10 text-tactical-orange border-tactical-orange/30',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
  };

  const dotColors = {
    cyan: 'bg-tactical-cyan',
    indigo: 'bg-tactical-indigo',
    emerald: 'bg-tactical-emerald',
    amber: 'bg-tactical-amber',
    rose: 'bg-tactical-rose',
    orange: 'bg-tactical-orange',
    slate: 'bg-slate-400',
  };

  const sizeStyles = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono uppercase tracking-wider font-semibold rounded-md border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} animate-pulse`} />}
      {children}
    </span>
  );
};
