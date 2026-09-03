'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectGroup {
  label?: string;
  options: FilterSelectOption[];
}

// Sentinel for "no filter selected" (clears the query param). Distinct from
// any real option value so a filter can define its own explicit "show
// everything" option (e.g. priority's "all" is a real value, not this clear).
const CLEAR_VALUE = '__clear__';

export function FilterSelect({
  paramName,
  currentValue,
  allLabel,
  groups,
  className,
}: {
  paramName: string;
  currentValue?: string;
  allLabel: string;
  groups: FilterSelectGroup[];
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = currentValue ?? CLEAR_VALUE;

  const currentLabel = groups.flatMap((g) => g.options).find((o) => o.value === value)?.label ?? allLabel;

  function handleChange(next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next || next === CLEAR_VALUE) {
      params.delete(paramName);
    } else {
      params.set(paramName, next);
    }
    params.delete('page'); // changing any filter resets pagination
    router.push(`/?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={allLabel}>{currentLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CLEAR_VALUE}>{allLabel}</SelectItem>
        {groups.map((group, i) => (
          <SelectGroup key={group.label ?? i}>
            {group.label && (
              <>
                <SelectSeparator />
                <SelectLabel>{group.label}</SelectLabel>
              </>
            )}
            {group.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
