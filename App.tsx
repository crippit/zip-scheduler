
import React, { useState, useEffect, useMemo, KeyboardEvent } from 'react';
import { 
  CycleConfig, 
  Period, 
  DayException, 
  OffDayBehavior, 
  DayType, 
  ScheduleGrid, 
  DateMapping 
} from './types';
import { calculateScheduleMappings, exportToGCalCSV, generateDateRange } from './utils/scheduler';
import { parseScheduleDescription } from './services/geminiService';

// UI Components
const StepIndicator = ({ currentStep }: { currentStep: number }) => {
  const steps = ["Setup", "Periods", "Calendar", "Grid", "Review"];
  return (
    <div className="flex justify-between mb-8 overflow-x-auto pb-2">
      {steps.map((label, idx) => (
        <div key={label} className="flex flex-col items-center mx-2 min-w-[60px]">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
            currentStep >= idx + 1 ? 'bg-primary-600 border-primary-600 text-white' : 'border-slate-300 dark:border-slate-700 text-slate-400'
          }`}>
            {currentStep > idx + 1 ? <i className="fas fa-check"></i> : idx + 1}
          </div>
          <span className={`text-xs mt-2 font-medium ${currentStep >= idx + 1 ? 'text-primary-600' : 'text-slate-400'}`}>{label}</span>
        </div>
      ))}
    </div>
  );
};

interface TagInputProps {
  label: string;
  tags: string[];
  placeholder: string;
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
}

const TagInput = ({ label, tags, placeholder, onAdd, onRemove }: TagInputProps) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (inputValue.trim()) {
        e.preventDefault();
        onAdd(inputValue.trim());
        setInputValue('');
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onRemove(tags.length - 1);
    }
  };

  return (
    <div className="flex flex-col">
      <label className="block text-sm font-semibold mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 p-2 min-h-[50px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-sm focus-within:ring-2 focus-within:ring-primary-500 transition-all">
        {tags.map((tag, idx) => (
          <span key={`${tag}-${idx}`} className="flex items-center bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2 py-1 rounded-md text-sm font-medium">
            {tag}
            <button 
              onClick={() => onRemove(idx)}
              className="ml-2 text-primary-400 hover:text-primary-600 dark:hover:text-primary-200"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 bg-transparent border-none outline-none text-sm min-w-[120px] py-1"
        />
      </div>
      <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">Press Tab or Enter to add</p>
    </div>
  );
};

export default function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [nlpInput, setNlpInput] = useState('');
  
  // State for all data
  const [config, setConfig] = useState<CycleConfig>({
    cycleDays: 6,
    periodsPerDay: 8,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().getFullYear() + 1, 5, 30).toISOString().split('T')[0],
    firstCycleDay: 1,
    offDayBehavior: OffDayBehavior.PAUSE,
    rooms: [],
    classList: []
  });

  const [periods, setPeriods] = useState<Period[]>([]);
  const [exceptions, setExceptions] = useState<DayException[]>([]);
  const [grid, setGrid] = useState<ScheduleGrid>({});
  const [finalMappings, setFinalMappings] = useState<DateMapping[]>([]);

  // Initialize periods when periodsPerDay changes
  useEffect(() => {
    if (periods.length !== config.periodsPerDay) {
      const newPeriods: Period[] = Array.from({ length: config.periodsPerDay }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Period ${i + 1}`,
        startTime: `${8 + i}:00`,
        endTime: `${8 + i}:50`
      }));
      setPeriods(newPeriods);
    }
  }, [config.periodsPerDay]);

  const handleNlpSubmit = async () => {
    if (!nlpInput.trim()) return;
    setLoading(true);
    try {
      const result = await parseScheduleDescription(nlpInput);
      
      setConfig(prev => ({
        ...prev,
        cycleDays: result.cycleDays || prev.cycleDays,
        periodsPerDay: result.periodsPerDay || prev.periodsPerDay,
        rooms: [...new Set([...prev.rooms, ...(result.rooms || [])])],
        classList: [...new Set([...prev.classList, ...(result.classList || [])])]
      }));

      if (result.periods) {
        setPeriods(result.periods.map((p: any, i: number) => ({
          ...p,
          id: `p${i + 1}`
        })));
      }
      setNlpInput('');
    } catch (err) {
      console.error(err);
      alert("Failed to parse input. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const calculateAndGoToReview = () => {
    const mappings = calculateScheduleMappings(config, exceptions);
    setFinalMappings(mappings);
    setStep(5);
  };

  const downloadCSV = () => {
    const csv = exportToGCalCSV(finalMappings, grid, periods);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `school_schedule_${new Date().getFullYear()}.csv`;
    a.click();
  };

  const toggleException = (date: string, type: DayType) => {
    setExceptions(prev => {
      const exists = prev.find(e => e.date === date);
      if (exists) {
        if (exists.type === type) return prev.filter(e => e.date !== date);
        return prev.map(e => e.date === date ? { ...e, type } : e);
      }
      return [...prev, { date, type }];
    });
  };

  const monthsData = useMemo(() => {
    const allDates = generateDateRange(config.startDate, config.endDate);
    const groups: { [key: string]: string[] } = {};
    
    allDates.forEach(dateStr => {
      const date = new Date(dateStr + 'T00:00:00');
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(dateStr);
    });

    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [config.startDate, config.endDate]);

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">Z</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ZipCycle <span className="text-primary-600 font-normal">Scheduler</span></h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">A Zip Solutions Product</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
        <StepIndicator currentStep={step} />

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 md:p-10">
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <section>
                <h2 className="text-2xl font-bold mb-4 flex items-center">
                  <i className="fas fa-magic text-primary-500 mr-3"></i> Quick Setup
                </h2>
                <div className="relative">
                  <textarea 
                    value={nlpInput}
                    onChange={(e) => setNlpInput(e.target.value)}
                    placeholder="Describe your schedule (e.g., 'I teach Math 10 and Physics 11. I have a 6 day cycle. Room 101.')"
                    className="w-full h-32 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all resize-none"
                  />
                  <button 
                    onClick={handleNlpSubmit}
                    disabled={loading || !nlpInput.trim()}
                    className="absolute bottom-4 right-4 bg-primary-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50 transition-all shadow-lg"
                  >
                    {loading ? <i className="fas fa-circle-notch fa-spin"></i> : "Apply Magic"}
                  </button>
                </div>
              </section>

              <hr className="border-slate-100 dark:border-slate-800" />

              <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">Cycle Length (Days)</label>
                  <input 
                    type="number" 
                    value={config.cycleDays} 
                    onChange={(e) => setConfig({...config, cycleDays: parseInt(e.target.value) || 1})}
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Periods per Day</label>
                  <input 
                    type="number" 
                    value={config.periodsPerDay} 
                    onChange={(e) => setConfig({...config, periodsPerDay: parseInt(e.target.value) || 1})}
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">School Year Starts</label>
                  <input 
                    type="date" 
                    value={config.startDate} 
                    onChange={(e) => setConfig({...config, startDate: e.target.value})}
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">School Year Ends</label>
                  <input 
                    type="date" 
                    value={config.endDate} 
                    onChange={(e) => setConfig({...config, endDate: e.target.value})}
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">First Day Cycle Number</label>
                  <input 
                    type="number" 
                    min="1"
                    max={config.cycleDays}
                    value={config.firstCycleDay} 
                    onChange={(e) => setConfig({...config, firstCycleDay: parseInt(e.target.value) || 1})}
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Non-Teaching Day Action</label>
                  <select 
                    value={config.offDayBehavior}
                    onChange={(e) => setConfig({...config, offDayBehavior: e.target.value as OffDayBehavior})}
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shadow-sm"
                  >
                    <option value={OffDayBehavior.PAUSE}>Pause Cycle (Pick up where we left off)</option>
                    <option value={OffDayBehavior.SKIP}>Skip Day (Cycle continues in background)</option>
                  </select>
                </div>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <TagInput
                  label="Classes Taught"
                  tags={config.classList}
                  placeholder="Type a class name..."
                  onAdd={(tag) => setConfig(prev => ({ ...prev, classList: [...prev.classList, tag] }))}
                  onRemove={(idx) => setConfig(prev => ({ ...prev, classList: prev.classList.filter((_, i) => i !== idx) }))}
                />
                <TagInput
                  label="Room Numbers"
                  tags={config.rooms}
                  placeholder="Type a room number..."
                  onAdd={(tag) => setConfig(prev => ({ ...prev, rooms: [...prev.rooms, tag] }))}
                  onRemove={(idx) => setConfig(prev => ({ ...prev, rooms: prev.rooms.filter((_, i) => i !== idx) }))}
                />
              </section>

              <div className="flex justify-end">
                <button 
                  onClick={() => setStep(2)}
                  className="bg-primary-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-primary-700 transition-all flex items-center space-x-2 shadow-lg"
                >
                  <span>Continue</span>
                  <i className="fas fa-arrow-right"></i>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-bold flex items-center">
                <i className="far fa-clock text-primary-500 mr-3"></i> Define Period Timings
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-slate-100 dark:border-slate-800">
                      <th className="pb-3 pr-4">Period Name</th>
                      <th className="pb-3 pr-4">Start Time</th>
                      <th className="pb-3">End Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {periods.map((p, idx) => (
                      <tr key={p.id}>
                        <td className="py-4 pr-4">
                          <input 
                            value={p.name} 
                            onChange={(e) => {
                              const next = [...periods];
                              next[idx].name = e.target.value;
                              setPeriods(next);
                            }}
                            className="bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-primary-500 focus:outline-none w-full"
                          />
                        </td>
                        <td className="py-4 pr-4">
                          <input 
                            type="time" 
                            value={p.startTime} 
                            onChange={(e) => {
                              const next = [...periods];
                              next[idx].startTime = e.target.value;
                              setPeriods(next);
                            }}
                            className="bg-slate-50 dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 shadow-sm"
                          />
                        </td>
                        <td className="py-4">
                          <input 
                            type="time" 
                            value={p.endTime} 
                            onChange={(e) => {
                              const next = [...periods];
                              next[idx].endTime = e.target.value;
                              setPeriods(next);
                            }}
                            className="bg-slate-50 dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 shadow-sm"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="text-slate-500 font-semibold hover:text-slate-700">Back</button>
                <button onClick={() => setStep(3)} className="bg-primary-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-primary-700 shadow-lg">Next Step</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold flex items-center">
                    <i className="far fa-calendar-alt text-primary-500 mr-3"></i> Identify Exceptions
                  </h2>
                  <p className="text-sm text-slate-500 mb-4">Click dates to toggle between Holiday, PD Day, and Exam Day.</p>
                </div>
                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                   <div className="flex items-center"><span className="w-3 h-3 bg-red-500 rounded mr-1"></span> Holiday</div>
                   <div className="flex items-center"><span className="w-3 h-3 bg-amber-500 rounded mr-1"></span> PD Day</div>
                   <div className="flex items-center"><span className="w-3 h-3 bg-blue-500 rounded mr-1"></span> Exam</div>
                </div>
              </div>
              
              <div className="space-y-10 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {monthsData.map(([monthKey, dates]) => {
                  const firstDate = new Date(dates[0] + 'T00:00:00');
                  const monthName = firstDate.toLocaleString('default', { month: 'long', year: 'numeric' });
                  const startDay = firstDate.getDay(); 
                  
                  return (
                    <div key={monthKey} className="space-y-3">
                      <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-800 pb-2">{monthName}</h3>
                      <div className="grid grid-cols-7 gap-1">
                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                          <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
                        ))}
                        
                        {Array.from({ length: startDay }).map((_, i) => (
                          <div key={`pad-${i}`} className="h-12"></div>
                        ))}

                        {dates.map(d => {
                          const dateObj = new Date(d + 'T00:00:00');
                          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                          const currentException = exceptions.find(e => e.date === d);
                          
                          return (
                            <button 
                              key={d}
                              disabled={isWeekend}
                              onClick={() => {
                                const types = [DayType.HOLIDAY, DayType.PD_DAY, DayType.EXAM_DAY, DayType.SCHOOL_DAY];
                                const currentIdx = types.indexOf(currentException?.type || DayType.SCHOOL_DAY);
                                const nextType = types[(currentIdx + 1) % types.length];
                                toggleException(d, nextType);
                              }}
                              className={`relative h-12 border border-slate-100 dark:border-slate-800 rounded-md transition-all flex flex-col items-center justify-center ${
                                isWeekend ? 'bg-slate-50 dark:bg-slate-900/50 opacity-30 cursor-not-allowed border-slate-200 dark:border-slate-700' : 
                                currentException?.type === DayType.HOLIDAY ? 'bg-red-500 text-white border-red-600 shadow-sm' :
                                currentException?.type === DayType.PD_DAY ? 'bg-amber-500 text-white border-amber-600 shadow-sm' :
                                currentException?.type === DayType.EXAM_DAY ? 'bg-blue-500 text-white border-blue-600 shadow-sm' :
                                'hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <span className="text-xs font-bold">{dateObj.getDate()}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => setStep(2)} className="text-slate-500 font-semibold hover:text-slate-700">Back</button>
                <button onClick={() => setStep(4)} className="bg-primary-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-primary-700 shadow-lg">Next Step</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-bold flex items-center">
                <i className="fas fa-th text-primary-500 mr-3"></i> Assign Classes to Cycle Days
              </h2>
              <p className="text-sm text-slate-500 mb-4">Choose your class and room for each cycle day. Leave empty if you have no class.</p>
              <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="p-4 border-b border-r border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left sticky left-0 z-10 min-w-[120px] text-xs font-bold uppercase text-slate-500">Period</th>
                      {Array.from({ length: config.cycleDays }).map((_, i) => (
                        <th key={i} className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase text-slate-500">Day {i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {periods.map(p => (
                      <tr key={p.id}>
                        <td className="p-4 border-r border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 font-semibold sticky left-0 z-10 text-sm">{p.name}</td>
                        {Array.from({ length: config.cycleDays }).map((_, i) => {
                          const cycleDay = i + 1;
                          const assignment = grid[cycleDay]?.[p.id] || { className: '', roomNumber: '' };
                          return (
                            <td key={i} className="p-3 border-r border-slate-100 dark:border-slate-800 min-w-[200px]">
                              <select 
                                value={assignment.className}
                                onChange={(e) => {
                                  setGrid(prev => ({
                                    ...prev,
                                    [cycleDay]: {
                                      ...prev[cycleDay],
                                      [p.id]: { ...assignment, className: e.target.value }
                                    }
                                  }));
                                }}
                                className="w-full text-sm p-2 bg-slate-50 dark:bg-slate-800 rounded-md border border-transparent focus:border-primary-500 focus:bg-white dark:focus:bg-slate-900 transition-all mb-2 outline-none font-medium shadow-sm"
                              >
                                <option value="">Select Class</option>
                                {config.classList.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                              <select
                                value={assignment.roomNumber}
                                onChange={(e) => {
                                  setGrid(prev => ({
                                    ...prev,
                                    [cycleDay]: {
                                      ...prev[cycleDay],
                                      [p.id]: { ...assignment, roomNumber: e.target.value }
                                    }
                                  }));
                                }}
                                className="w-full text-[10px] p-2 bg-slate-100 dark:bg-slate-800 border-none rounded-md focus:ring-1 focus:ring-primary-500 font-bold text-slate-600 dark:text-slate-400 shadow-sm"
                              >
                                <option value="">Select Room</option>
                                {config.rooms.map(r => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep(3)} className="text-slate-500 font-semibold hover:text-slate-700">Back</button>
                <button onClick={calculateAndGoToReview} className="bg-primary-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-primary-700 shadow-lg">Final Review</button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Review & Adjust</h2>
                <button 
                  onClick={downloadCSV}
                  className="bg-primary-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-primary-700 shadow-lg flex items-center transition-all hover:scale-105 active:scale-95"
                >
                  <i className="fas fa-file-export mr-2"></i> Export to GCal (CSV)
                </button>
              </div>
              
              <p className="text-sm text-slate-500">Review the final cycle assignments. You can see which classes are scheduled for each date based on its Cycle Day.</p>
              
              <div className="max-h-[600px] overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl custom-scrollbar shadow-inner">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-20">
                    <tr>
                      <th className="p-4 text-left font-bold uppercase text-[10px] tracking-widest text-slate-500 border-b border-slate-100 dark:border-slate-800 w-1/4">Date</th>
                      <th className="p-4 text-left font-bold uppercase text-[10px] tracking-widest text-slate-500 border-b border-slate-100 dark:border-slate-800 w-1/6">Status</th>
                      <th className="p-4 text-center font-bold uppercase text-[10px] tracking-widest text-slate-500 border-b border-slate-100 dark:border-slate-800 w-1/6">Cycle Day</th>
                      <th className="p-4 text-left font-bold uppercase text-[10px] tracking-widest text-slate-500 border-b border-slate-100 dark:border-slate-800">Class Assignments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {finalMappings.map((m, idx) => {
                      const dayGrid = m.cycleDay ? grid[m.cycleDay] : null;
                      const activeClasses = dayGrid ? periods.filter(p => dayGrid[p.id]?.className) : [];

                      return (
                        <tr key={m.date} className={`${m.type === DayType.WEEKEND ? 'bg-slate-50/50 dark:bg-slate-900/50 opacity-40' : 'hover:bg-slate-50/30 dark:hover:bg-slate-800/20'}`}>
                          <td className="p-4 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {new Date(m.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="p-4">
                            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded whitespace-nowrap ${
                              m.type === DayType.SCHOOL_DAY ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                              m.type === DayType.HOLIDAY ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              m.type === DayType.PD_DAY ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                              m.type === DayType.EXAM_DAY ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
                            }`}>
                              {m.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            {m.cycleDay !== null ? (
                              <select 
                                value={m.cycleDay}
                                onChange={(e) => {
                                  const next = [...finalMappings];
                                  next[idx].cycleDay = parseInt(e.target.value);
                                  setFinalMappings(next);
                                }}
                                className="bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-3 py-1 rounded font-black border-none ring-1 ring-primary-100 dark:ring-primary-900/50 shadow-sm"
                              >
                                {Array.from({ length: config.cycleDays }).map((_, i) => (
                                  <option key={i} value={i + 1}>{i + 1}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-2">
                              {activeClasses.length > 0 ? (
                                activeClasses.map(p => (
                                  <div key={p.id} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                                    <span className="font-bold text-slate-400 mr-1">{p.name}:</span>
                                    <span className="font-semibold">{dayGrid![p.id].className}</span>
                                    {dayGrid![p.id].roomNumber && (
                                      <span className="ml-1 text-primary-500">({dayGrid![p.id].roomNumber})</span>
                                    )}
                                  </div>
                                ))
                              ) : (
                                m.cycleDay !== null && <span className="text-[10px] text-slate-400 italic">No classes assigned for this cycle day</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-start">
                <button onClick={() => setStep(4)} className="text-slate-500 font-semibold hover:text-slate-700 transition-colors">
                  <i className="fas fa-chevron-left mr-2"></i> Back to Grid
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-slate-100 dark:bg-slate-900 p-8 border-t border-slate-200 dark:border-slate-800 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center opacity-60">
          <p className="text-xs font-medium tracking-tight">ZipCycle Scheduler &copy; {new Date().getFullYear()} Zip Solutions. Built for Teachers.</p>
          <div className="flex space-x-6 mt-4 md:mt-0 text-[10px] font-black uppercase tracking-widest">
             <span className="cursor-pointer hover:text-primary-600 transition-colors">Terms</span>
             <span className="cursor-pointer hover:text-primary-600 transition-colors">Privacy</span>
             <span className="cursor-pointer hover:text-primary-600 transition-colors">Support</span>
          </div>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
        }
      `}</style>
    </div>
  );
}
