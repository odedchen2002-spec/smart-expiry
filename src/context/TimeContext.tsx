import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLanguage } from './LanguageContext';

interface TimeContextValue {
  timeString: string;
  dateString: string;
}

const TimeContext = createContext<TimeContextValue | undefined>(undefined);

export function TimeProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();
  const [timeString, setTimeString] = useState<string>(
    new Date().toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  );
  const [dateString, setDateString] = useState<string>(
    new Date().toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  );

  useEffect(() => {
    // Update time immediately
    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' }));
      setDateString(now.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }));
    };

    updateTime();

    // Update every 30 seconds to keep time synchronized
    const interval = setInterval(updateTime, 1000 * 30);

    return () => clearInterval(interval);
  }, [locale]);

  return (
    <TimeContext.Provider value={{ timeString, dateString }}>
      {children}
    </TimeContext.Provider>
  );
}

export function useTime() {
  const context = useContext(TimeContext);
  if (context === undefined) {
    throw new Error('useTime must be used within a TimeProvider');
  }
  return context;
}

