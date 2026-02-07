
import { CycleConfig, DayException, DateMapping, DayType, OffDayBehavior, ScheduleGrid, Period } from '../types';

export function generateDateRange(start: string, end: string): string[] {
  const dates = [];
  let current = new Date(start);
  const last = new Date(end);

  while (current <= last) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export function calculateScheduleMappings(
  config: CycleConfig,
  exceptions: DayException[]
): DateMapping[] {
  const allDates = generateDateRange(config.startDate, config.endDate);
  const mappings: DateMapping[] = [];
  let currentCycleDay = config.firstCycleDay;

  allDates.forEach((dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const exception = exceptions.find(e => e.date === dateStr);

    let type = DayType.SCHOOL_DAY;
    if (isWeekend) type = DayType.WEEKEND;
    if (exception) type = exception.type;

    let cycleDay: number | null = null;

    if (type === DayType.SCHOOL_DAY || type === DayType.EXAM_DAY) {
      cycleDay = currentCycleDay;
      currentCycleDay = (currentCycleDay % config.cycleDays) + 1;
    } else if (type === DayType.WEEKEND || type === DayType.HOLIDAY || type === DayType.PD_DAY) {
      cycleDay = null;
      if (config.offDayBehavior === OffDayBehavior.SKIP && type !== DayType.WEEKEND) {
        // If we skip, we increment the cycle day even if it's not a school day
        currentCycleDay = (currentCycleDay % config.cycleDays) + 1;
      }
      // If PAUSE, we don't increment currentCycleDay
    }

    mappings.push({ date: dateStr, cycleDay, type });
  });

  return mappings;
}

export function exportToGCalCSV(
  mappings: DateMapping[],
  grid: ScheduleGrid,
  periods: Period[]
): string {
  const headers = ["Subject", "Start Date", "Start Time", "End Date", "End Time", "Description", "Location"];
  const rows = [headers.join(",")];

  mappings.forEach(mapping => {
    // Ensure weekends are strictly excluded from the export
    if (mapping.cycleDay !== null && mapping.type !== DayType.WEEKEND) {
      const dayGrid = grid[mapping.cycleDay];
      if (dayGrid) {
        periods.forEach(period => {
          const assignment = dayGrid[period.id];
          if (assignment && assignment.className) {
            const row = [
              `"${assignment.className} (Day ${mapping.cycleDay})"`,
              `"${mapping.date}"`,
              `"${period.startTime}"`,
              `"${mapping.date}"`,
              `"${period.endTime}"`,
              `"Cycle Day: ${mapping.cycleDay}, Period: ${period.name}"`,
              `"${assignment.roomNumber || ''}"`
            ];
            rows.push(row.join(","));
          }
        });
      }
    }
  });

  return rows.join("\n");
}
