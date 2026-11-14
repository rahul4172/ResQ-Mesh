import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  action,
  icon,
  className = '',
}) => {
  return (
    <div className={`bg-charcoal-900 border border-charcoal-700/60 rounded-xl p-5 shadow-xl relative overflow-hidden backdrop-blur-sm ${className}`}>
      {/* Subtle top edge highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-charcoal-600 to-transparent opacity-40" />
      
      {(title || action || icon) && (
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-charcoal-800/80">
          <div className="flex items-center gap-3">
            {icon && <div className="text-tactical-cyan p-1.5 rounded-lg bg-charcoal-800 border border-charcoal-700">{icon}</div>}
            <div>
              {title && <h3 className="text-sm font-semibold tracking-wider text-slate-100 uppercase font-mono">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
