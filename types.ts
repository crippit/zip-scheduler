
export enum DayType {
  SCHOOL_DAY = 'SCHOOL_DAY',
  HOLIDAY = 'HOLIDAY',
  PD_DAY = 'PD_DAY',
  EXAM_DAY = 'EXAM_DAY',
  WEEKEND = 'WEEKEND'
}

export enum OffDayBehavior {
  SKIP = 'SKIP', // Skip the cycle day (Day 4 is skipped if Monday is a holiday)
  PAUSE = 'PAUSE' // Cycle pauses (If Friday was Day 3, Tuesday is Day 4 after a Monday holiday)
}

export interface Period {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface ClassAssignment {
  className: string;
  roomNumber: string;
}

export interface CycleConfig {
  cycleDays: number;
  periodsPerDay: number;
  startDate: string;
  endDate: string;
  firstCycleDay: number;
  offDayBehavior: OffDayBehavior;
  rooms: string[];
  classList: string[];
}

export interface DayException {
  date: string; // YYYY-MM-DD
  type: DayType;
  label?: string;
}

export interface ScheduleGrid {
  [cycleDay: number]: {
    [periodId: string]: ClassAssignment;
  };
}

export interface DateMapping {
  date: string;
  cycleDay: number | null; // null if not a school day
  type: DayType;
}
