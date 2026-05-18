'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('font-plus-jakarta-sans p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4 sm:gap-6',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-semibold',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100',
        ),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday:
          'text-neutral-500 dark:text-neutral-400 rounded-md w-9 font-medium text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 p-0 text-center text-sm relative [&:has([aria-selected])]:bg-neutral-100 dark:[&:has([aria-selected])]:bg-neutral-800 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
        ),
        day_selected:
          'bg-neutral-900 text-white hover:bg-neutral-800 hover:text-white focus:bg-neutral-900 focus:text-white dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200',
        day_today: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100',
        day_outside: 'text-neutral-400 opacity-50',
        day_disabled: 'text-neutral-400 opacity-40',
        day_range_middle:
          'aria-selected:bg-neutral-100 aria-selected:text-neutral-900 dark:aria-selected:bg-neutral-800 dark:aria-selected:text-neutral-100',
        day_hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName }) =>
          orientation === 'left' ? (
            <ChevronLeft className={cn('h-4 w-4', iconClassName)} />
          ) : (
            <ChevronRight className={cn('h-4 w-4', iconClassName)} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
