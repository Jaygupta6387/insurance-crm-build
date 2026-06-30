import * as React from 'react';
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from './toast';

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

interface ToastItem {
  id: number;
  title: string;
  description: string;
  variant: 'default' | 'destructive' | 'success';
  open: boolean;
}

interface ToastContextValue {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastContextProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    ({
      title = '',
      description = '',
      variant = 'default' as const,
      duration = 4000,
    }: ToastOptions) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, title, description, variant, open: true }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    []
  );

  const toast = useMemo<ToastContextValue>(
    () => ({
      success: (title, description) => addToast({ title, description, variant: 'success' }),
      error: (title, description) => addToast({ title, description, variant: 'destructive' }),
      info: (title, description) => addToast({ title, description }),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastProvider>
        {toasts.map(({ id, title, description, variant, open }) => (
          <Toast key={id} open={open} variant={variant}>
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastContextProvider');
  return ctx;
};
